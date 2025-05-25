/**
 * Response utilities for consistent Lambda function responses
 */

/**
 * Standard S3 path format used across Lambda functions
 */
export interface S3Path {
  bucket: string;
  key: string;
}
