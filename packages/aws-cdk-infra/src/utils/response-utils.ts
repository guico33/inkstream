/**
 * Response utilities for consistent Lambda function responses
 */
import { getErrorMessage } from './error-utils';

/**
 * Standard S3 path format used across Lambda functions
 */
export interface S3Path {
  bucket: string;
  key: string;
}

/**
 * Base response type with common fields
 */
export interface BaseResponseBody {
  message: string;
  error?: string;
}

/**
 * Success response with S3 path
 */
export interface S3ResponseBody extends BaseResponseBody {
  s3Path: S3Path;
}

/**
 * Creates a success response with standard formatting
 * @param statusCode HTTP status code
 * @param message Success message
 * @param data Additional data to include in the response
 * @returns The formatted success response
 */
export function createSuccessResponse<T extends Record<string, unknown>>(
  statusCode: number,
  message: string,
  data?: T
): {
  statusCode: number;
  body: string;
  [key: string]: unknown;
} {
  return {
    statusCode,
    body: JSON.stringify({
      message,
      ...(data || {}),
    }),
    ...(data || {}), // Also add data fields at the top level for Step Functions
  };
}

/**
 * Creates a standard S3 success response
 * @param s3Path The S3 path object with bucket and key
 * @param message Success message
 * @param additionalData Additional data to include in the response
 * @returns The formatted S3 success response
 */
export function createS3Response<T extends Record<string, unknown>>(
  s3Path: S3Path,
  message: string,
  additionalData?: T
): {
  statusCode: number;
  body: string;
  s3Path: S3Path;
  [key: string]: unknown;
} {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message,
      s3Path,
      ...(additionalData || {}),
    }),
    s3Path, // Add s3Path at top level for Step Functions
    ...(additionalData || {}), // Add other fields at top level too
  };
}

/**
 * Creates an error response for S3 operations
 * @param statusCode HTTP status code
 * @param message Error message
 * @param error The error that occurred
 * @returns The formatted error response with null S3 path
 */
export function createS3ErrorResponse(
  statusCode: number,
  message: string,
  error?: unknown
): {
  statusCode: number;
  body: string;
  s3Path: null;
  [key: string]: unknown;
} {
  const errorMessage = error ? getErrorMessage(error) : undefined;

  return {
    statusCode,
    body: JSON.stringify({
      message,
      ...(errorMessage && { error: errorMessage }),
    }),
    s3Path: null, // Indicate no S3 output
  };
}
