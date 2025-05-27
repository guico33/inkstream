import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import {
  SFNClient,
  DescribeExecutionCommand,
  ExecutionStatus,
} from '@aws-sdk/client-sfn';
import { getWorkflow } from '../../../utils/workflow-state';
import { ValidationError, ExternalServiceError } from '../../../errors';

// Initialize Step Functions client
const sfnClient = new SFNClient({});

// Zod schema for query parameters validation
const QueryParametersSchema = z.object({
  workflowId: z
    .string({ required_error: 'workflowId is required' })
    .min(1, 'workflowId cannot be empty'),
});

// Type for Step Functions execution details
export type StepFunctionsExecutionDetails = {
  status: ExecutionStatus;
  input?: object;
  output?: object;
  error?: string;
  cause?: string;
  startDate?: Date;
  stopDate?: Date;
} | null;

/**
 * Gets Step Functions execution details
 */
export async function getStepFunctionsExecutionDetails(
  executionArn: string
): Promise<StepFunctionsExecutionDetails> {
  try {
    const command = new DescribeExecutionCommand({
      executionArn,
    });

    const response = await sfnClient.send(command);

    // Helper function to safely parse JSON
    const safeJsonParse = (jsonString?: string) => {
      if (!jsonString) return undefined;
      try {
        return JSON.parse(jsonString);
      } catch {
        return undefined;
      }
    };

    return {
      status: response.status!,
      input: safeJsonParse(response.input),
      output: safeJsonParse(response.output),
      error: response.error || undefined,
      cause: response.cause || undefined,
      startDate: response.startDate,
      stopDate: response.stopDate,
    };
  } catch (error) {
    console.warn('Failed to get Step Functions execution details:', error);
    // Return null if we can't get Step Functions details, but don't fail the request
    return null;
  }
}

/**
 * Combines DynamoDB workflow record with Step Functions execution details
 */
export function combineWorkflowStatus(
  workflowRecord: any,
  executionDetails: StepFunctionsExecutionDetails
) {
  const baseStatus = {
    workflowId: workflowRecord.workflowId,
    status: workflowRecord.status,
    parameters: workflowRecord.parameters || {},
    s3Paths: workflowRecord.s3Paths || {},
    createdAt: workflowRecord.createdAt,
    updatedAt: workflowRecord.updatedAt,
    error: workflowRecord.error,
  };

  // Add Step Functions execution details if available
  if (executionDetails) {
    return {
      ...baseStatus,
      execution: {
        status: executionDetails.status,
        startDate: executionDetails.startDate?.toISOString(),
        stopDate: executionDetails.stopDate?.toISOString(),
        error: executionDetails.error,
        cause: executionDetails.cause,
      },
      // Prefer Step Functions error details if workflow failed and SFN has more context
      ...(executionDetails.error && {
        error: executionDetails.error,
        cause: executionDetails.cause,
      }),

      ...(executionDetails.status === 'FAILED' && {
        status: 'FAILED',
      }),
    };
  }

  return baseStatus;
}

/**
 * Extracts workflowId from query parameters
 */
export function extractWorkflowId(event: APIGatewayProxyEvent): string {
  if (
    !event.queryStringParameters ||
    !('workflowId' in event.queryStringParameters)
  ) {
    throw new ValidationError('workflowId is required as query parameter');
  }

  try {
    const { workflowId } = QueryParametersSchema.parse(
      event.queryStringParameters
    );
    return workflowId;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      throw new ValidationError(
        `Invalid query parameters: ${errorMessages.join(', ')}`
      );
    }
    throw new ValidationError('Invalid query parameters');
  }
}

/**
 * Extracts and validates user ID from JWT claims
 */
export function extractUserId(event: APIGatewayProxyEvent): string {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    throw new ValidationError('Invalid or missing userId in JWT claims');
  }

  return userId;
}

/**
 * Retrieves workflow record from DynamoDB
 */
export async function getWorkflowFromDatabase(
  userWorkflowsTable: string,
  userId: string,
  workflowId: string
) {
  try {
    return await getWorkflow(userWorkflowsTable, userId, workflowId);
  } catch (error) {
    throw new ExternalServiceError(
      'Failed to retrieve workflow from DynamoDB',
      'DynamoDB',
      error
    );
  }
}

/**
 * Handles different error types and returns appropriate HTTP responses
 */
export function handleError(error: unknown): APIGatewayProxyResult {
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
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
      body: JSON.stringify({
        message: 'Environment configuration error',
        error: errorMessages.join(', '),
      }),
    };
  }

  if (error instanceof ExternalServiceError) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to get workflow status',
        error: error.message,
      }),
    };
  }

  // Generic error handling
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: 'Failed to get workflow status',
      error: errorMessage,
    }),
  };
}
