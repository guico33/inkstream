/**
 * S3 utility functions for working with files in S3
 */
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { streamToString, streamToBuffer } from './stream-utils';
import { getFilenameWithoutExtension, getMimeType } from './file-utils';

// Initialize S3 client - can be reused across functions
const s3Client = new S3Client({});

/**
 * Get text content from an S3 object
 * @param bucket The S3 bucket name
 * @param key The S3 object key
 * @returns The text content of the S3 object
 */
export async function getTextFromS3(
  bucket: string,
  key: string
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`No content found in S3 object: s3://${bucket}/${key}`);
  }

  return streamToString(response.Body as Readable);
}

/**
 * Get binary content from an S3 object as a Buffer
 * @param bucket The S3 bucket name
 * @param key The S3 object key
 * @returns The binary content of the S3 object as a Buffer
 */
export async function getBufferFromS3(
  bucket: string,
  key: string
): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`No content found in S3 object: s3://${bucket}/${key}`);
  }

  return streamToBuffer(response.Body as Readable);
}

/**
 * Save text content to an S3 object
 * @param bucket The S3 bucket name
 * @param key The S3 object key
 * @param content The text content to save
 * @returns The S3 path object {bucket, key}
 */
export async function saveTextToS3(
  bucket: string,
  key: string,
  content: string
): Promise<{ bucket: string; key: string }> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(content, 'utf-8'),
      ContentType: 'text/plain; charset=utf-8',
    })
  );

  console.log(`Text saved to S3: s3://${bucket}/${key}`);
  return { bucket, key };
}

/**
 * Save binary content to an S3 object
 * @param bucket The S3 bucket name
 * @param key The S3 object key
 * @param content The binary content to save
 * @param contentType The MIME type of the content
 * @returns The S3 path object {bucket, key}
 */
export async function saveBinaryToS3(
  bucket: string,
  key: string,
  content: Buffer,
  contentType?: string
): Promise<{ bucket: string; key: string }> {
  const extension = key.split('.').pop() || '';
  const mimeType = contentType || getMimeType(extension);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: content,
      ContentType: mimeType,
    })
  );

  console.log(`Binary content saved to S3: s3://${bucket}/${key}`);
  return { bucket, key };
}

/**
 * Generate a user-specific S3 key path
 * @param userId The user ID
 * @param type The type of content (e.g., 'formatted', 'translated', 'speech')
 * @param originalFileKey The original file key
 * @param extension The file extension to use (without dot)
 * @param additionalInfo Optional additional info to add to the filename
 * @returns The generated S3 key
 */
export function generateUserS3Key(
  userId: string,
  type: string,
  originalFileKey: string,
  extension: string,
  additionalInfo?: string
): string {
  const baseFilename = getFilenameWithoutExtension(originalFileKey);
  const additionalPart = additionalInfo ? `-${additionalInfo}` : '';
  return `users/${userId}/${type}/${baseFilename}${additionalPart}.${extension}`;
}
