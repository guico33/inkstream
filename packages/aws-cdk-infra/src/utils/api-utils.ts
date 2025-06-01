// Common API utilities for Lambda functions
// Provides shared validation, error handling, and extraction functions

import { APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { ValidationError, ExternalServiceError } from '../errors';

/**
 * Handles different error types and returns appropriate HTTP responses
 */
export function handleError(error: unknown): APIGatewayProxyResult {
  const headers = getCommonHeaders();

  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'Validation error',
        error: error.message,
      }),
    };
  }

  if (error instanceof z.ZodError) {
    const errorMessages = error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`
    );
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'Validation error',
        error: errorMessages.join(', '),
      }),
    };
  }

  if (error instanceof ExternalServiceError) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message,
      }),
    };
  }

  // Generic error handling
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({
      message: 'Internal server error',
      error: errorMessage,
    }),
  };
}

/**
 * Validates and parses JSON request body using a Zod schema
 */
export function validateRequestBody<T>(
  body: string | null,
  schema: z.ZodSchema<T>
): T {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    throw new ValidationError(
      'Invalid request body format - must be valid JSON'
    );
  }

  try {
    return schema.parse(parsedBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      throw new ValidationError(
        `Invalid request body: ${errorMessages.join(', ')}`
      );
    }
    throw new ValidationError('Invalid request body');
  }
}

/**
 * Creates a successful API response with Content-Type header
 */
export function createSuccessResponse(
  data: unknown,
  statusCode: number = 200
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: getCommonHeaders(),
    body: JSON.stringify(data),
  };
}

/**
 * Creates an error response with specified status code and message
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  error?: string,
  additionalData?: Record<string, unknown>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: getCommonHeaders(),
    body: JSON.stringify({
      message,
      ...(error && { error }),
      ...additionalData,
    }),
  };
}

export function getCommonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token',
  };
}
