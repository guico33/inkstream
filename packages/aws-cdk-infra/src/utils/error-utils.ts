/**
 * Error utilities for consistent error handling across Lambda functions
 */

/**
 * Safely gets an error message from any type of error
 * @param error The error object (can be any type)
 * @returns A string error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else {
    return 'Unknown error occurred';
  }
}

/**
 * Formats an error for logging with consistent structure
 * @param context Context where the error occurred
 * @param error The error object
 * @returns The formatted error message for logging
 */
export function formatErrorForLogging(context: string, error: unknown): string {
  const errorMessage = getErrorMessage(error);
  return `Error in ${context}: ${errorMessage}`;
}
