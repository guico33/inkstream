// Updated S3 client using the new auth service
// Automatically handles token refresh

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { authService } from './auth/auth-service';
import { ENV } from './constants';
import type { User } from './types/user-types';

class S3Service {
  private client: S3Client | null = null;

  async getClient(): Promise<S3Client> {
    // Always get fresh credentials to handle token refresh
    const idToken = await authService.getIdToken();

    if (!idToken) {
      throw new Error('No authentication token available');
    }

    const credentials = fromCognitoIdentityPool({
      clientConfig: { region: ENV.AWS_REGION },
      identityPoolId: ENV.COGNITO_IDENTITY_POOL_ID,
      logins: {
        [`cognito-idp.${ENV.AWS_REGION}.amazonaws.com/${ENV.COGNITO_USER_POOL_ID}`]:
          idToken,
      },
    });

    this.client = new S3Client({
      region: ENV.AWS_REGION,
      credentials,
    });

    return this.client;
  }

  // Helper method to ensure client is ready
  async withClient<T>(operation: (client: S3Client) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    return operation(client);
  }
}

export const s3Service = new S3Service();

// Helper function to get MIME type from file extension
function getMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
  };
  return mimeTypes[extension || ''] || 'application/octet-stream';
}

// Upload file to S3 with progress tracking
export async function uploadFileToS3({
  file,
  user,
}: {
  file: File;
  user: User;
}): Promise<{ bucket: string; key: string }> {
  if (!ENV.S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  // Generate S3 key following the pattern: users/{userId}/uploads/{filename}
  const timestamp = Date.now();
  const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `users/${user.sub}/uploads/${timestamp}-${sanitizedFilename}`;

  console.log(`[S3Upload] Uploading file to S3: ${key}`);

  try {
    // Convert File to ArrayBuffer for upload
    const fileBuffer = await file.arrayBuffer();

    await s3Service.withClient(async (client) => {
      const command = new PutObjectCommand({
        Bucket: ENV.S3_BUCKET,
        Key: key,
        Body: new Uint8Array(fileBuffer),
        ContentType: getMimeType(file.name),
        ContentLength: file.size,
        Metadata: {
          originalFilename: file.name,
          uploadTimestamp: timestamp.toString(),
          userId: user.sub,
        },
      });

      return client.send(command);
    });

    console.log(
      `[S3Upload] Successfully uploaded file: s3://${ENV.S3_BUCKET}/${key}`
    );

    return {
      bucket: ENV.S3_BUCKET,
      key,
    };
  } catch (error) {
    console.error('[S3Upload] Failed to upload file:', error);
    throw new Error(
      `Failed to upload file to S3: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
