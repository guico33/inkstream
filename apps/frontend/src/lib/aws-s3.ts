// Updated S3 client using the new auth service
// Automatically handles token refresh

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { authService } from './auth-service';
import { ENV } from './constants/env';
import type { User } from './types/user-types';
import {
  outputExtentionMap,
  outputTypeMap,
  type S3PathOutputFileKey,
} from '@inkstream/shared';

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

  // Download file from S3
  async downloadFile({
    bucket,
    key,
    filename,
  }: {
    bucket: string;
    key: string;
    filename?: string;
  }): Promise<string> {
    try {
      console.log(
        `[S3Download] Downloading file from S3: s3://${bucket}/${key}`
      );

      const response = await this.withClient(async (client) => {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });
        return client.send(command);
      });

      if (!response.Body) {
        throw new Error('No file content received from S3');
      }

      // Convert the response body to a blob
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Calculate total length and create combined array
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedArray = new Uint8Array(totalLength);
      let offset = 0;

      for (const chunk of chunks) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }

      // Create blob and download
      const contentType = response.ContentType || 'application/octet-stream';
      const blob = new Blob([combinedArray], { type: contentType });

      // Determine filename
      const downloadFilename =
        filename ||
        (response.Metadata?.originalFilename
          ? decodeURIComponent(response.Metadata.originalFilename)
          : undefined) ||
        key.split('/').pop() ||
        'download';

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log(
        `[S3Download] Successfully downloaded file: ${downloadFilename}`
      );

      return downloadFilename;
    } catch (error) {
      console.error('[S3Download] Failed to download file:', error);
      throw new Error(
        `Failed to download file from S3: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
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
}): Promise<{ bucket: string; key: string; filename: string }> {
  if (!ENV.S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  // Generate S3 key following the pattern: users/{userId}/uploads/{filename}
  const timestamp = Date.now();
  const sanitizedFilename = file.name
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\s/g, '');
  const datedFilename = `${timestamp}-${sanitizedFilename}`;
  const key = `users/${user.sub}/uploads/${datedFilename}`;

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
          originalFilename: encodeURIComponent(file.name),
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
      filename: datedFilename,
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

// Download file by workflow result path
export async function downloadWorkflowFile({
  s3Path,
  filename,
}: {
  s3Path: string;
  filename: string;
}): Promise<string> {
  if (!ENV.S3_BUCKET) {
    throw new Error('S3_BUCKET environment variable not configured');
  }

  // Extract key from s3:// URL or use as-is if it's already a key
  const key = s3Path.startsWith('s3://')
    ? s3Path.replace(`s3://${ENV.S3_BUCKET}/`, '')
    : s3Path;

  const downloadedFilename = await s3Service.downloadFile({
    bucket: ENV.S3_BUCKET,
    key,
    filename,
  });

  return downloadedFilename;
}

export function getDownloadFileName({
  originalFilePath,
  outputFileType,
}: {
  originalFilePath: string;
  outputFileType: S3PathOutputFileKey;
}): string {
  console.log(
    `[getDownloadFileName] Generating download filename for: ${originalFilePath}, type: ${outputFileType}`
  );
  // combine the original file name with the output type and add a timestamp
  const originalFilename = originalFilePath.split('/').pop();
  const originalFileNameWithoutExt = originalFilename
    ? originalFilename.split('.').slice(0, -1).join('.')
    : 'downloaded-file';
  const outputTypeSuffix = `-${outputTypeMap[outputFileType]}`;

  const resultFileName = `${originalFileNameWithoutExt}${outputTypeSuffix}${outputExtentionMap[outputFileType]}`;

  console.log(
    `[getDownloadFileName] Generated download filename: ${resultFileName}`
  );

  return resultFileName;
}
