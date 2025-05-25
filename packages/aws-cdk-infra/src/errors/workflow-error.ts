/**
 * Custom error types for Step Functions workflow
 * These errors provide meaningful error types that can be caught by Step Functions
 */

/**
 * Base workflow error class that extends Error with a type property
 * Step Functions can catch these errors using the error type
 */
export class WorkflowError extends Error {
  public readonly errorType: string;

  constructor(message: string, errorType: string = 'WorkflowError') {
    super(message);
    this.name = errorType;
    this.errorType = errorType;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowError);
    }
  }
}

/**
 * Validation error for missing or invalid input parameters
 * Step Functions can catch this with: "ErrorEquals": ["ValidationError"]
 */
export class ValidationError extends WorkflowError {
  constructor(message: string) {
    super(message, 'ValidationError');
  }
}

/**
 * Error for S3-related operations (read, write, missing files)
 * Step Functions can catch this with: "ErrorEquals": ["S3Error"]
 */
export class S3Error extends WorkflowError {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message, 'S3Error');
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error for external service calls (Bedrock, Textract, etc.)
 * Step Functions can catch this with: "ErrorEquals": ["ExternalServiceError"]
 */
export class ExternalServiceError extends WorkflowError {
  public readonly service: string;
  public readonly cause?: unknown;

  constructor(message: string, service: string, cause?: unknown) {
    super(message, 'ExternalServiceError');
    this.service = service;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error for workflow state management operations
 * Step Functions can catch this with: "ErrorEquals": ["WorkflowStateError"]
 */
export class WorkflowStateError extends WorkflowError {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message, 'WorkflowStateError');
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Error for data processing operations (formatting, parsing, etc.)
 * Step Functions can catch this with: "ErrorEquals": ["ProcessingError"]
 */
export class ProcessingError extends WorkflowError {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message, 'ProcessingError');
    if (cause) {
      this.cause = cause;
    }
  }
}
