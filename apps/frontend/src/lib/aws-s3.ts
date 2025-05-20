// aws-s3.ts
// Utility for uploading files to S3 using Cognito Identity Pool credentials.
// The upload path is /uploads/{cognito-identity-id}/filename, matching the CDK IAM policy.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import type { User } from './types'; // Updated import path
import { ENV } from './constants'; // Updated import path

// Get AWS credentials for the current user using Cognito Identity Pool
export function getS3Client(idToken: string) {
  return new S3Client({
    region: ENV.REGION,
    credentials: fromCognitoIdentityPool({
      clientConfig: { region: ENV.REGION },
      identityPoolId: ENV.IDENTITY_POOL_ID,
      logins: {
        // The key must match your Cognito User Pool provider name
        [`cognito-idp.${ENV.REGION}.amazonaws.com/${ENV.USER_POOL_ID}`]:
          idToken,
      },
    }),
  });
}

// Upload a file to S3 under /uploads/{sub}/filename
export async function uploadFileToS3({
  file,
  user,
  idToken,
}: {
  file: File;
  user: User;
  idToken: string;
}) {
  const s3 = getS3Client(idToken);
  const key = `uploads/${user.sub}/${file.name}`;
  const input: PutObjectCommandInput = {
    Bucket: ENV.BUCKET,
    Key: key,
    Body: file instanceof Blob ? file : new Blob([file]), // Ensure browser compatibility
    ContentType: file.type,
  };
  await s3.send(new PutObjectCommand(input));
  return { key, bucket: ENV.BUCKET };
}
