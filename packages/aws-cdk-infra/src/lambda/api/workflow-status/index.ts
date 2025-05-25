import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { getWorkflow } from '../../../utils/workflow-state';
import { ValidationError, ExternalServiceError } from '../../../errors';

// Zod schema for query parameters validation
const QueryParametersSchema = z.object({
  workflowId: z
    .string({ required_error: 'workflowId is required' })
    .min(1, 'workflowId cannot be empty'),
});

// Zod schema for environment variables validation
const EnvironmentSchema = z.object({
  USER_WORKFLOWS_TABLE: z
    .string({
      required_error: 'USER_WORKFLOWS_TABLE environment variable is required',
    })
    .min(1, 'USER_WORKFLOWS_TABLE cannot be empty'),
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log(
    'Workflow Status Lambda invoked with event:',
    JSON.stringify(event)
  );

  try {
    // Validate environment variables
    const env = EnvironmentSchema.parse(process.env);

    // Extract and validate workflowId from query parameters
    const workflowId = extractWorkflowId(event);

    // Validate and extract user ID from JWT claims
    const userId = extractUserId(event);

    // Get workflow record from DynamoDB
    const workflowRecord = await getWorkflowFromDatabase(
      env.USER_WORKFLOWS_TABLE,
      userId,
      workflowId
    );

    if (!workflowRecord) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: 'Workflow not found',
          workflowId,
        }),
      };
    }

    // Return workflow status with comprehensive details
    return {
      statusCode: 200,
      body: JSON.stringify({
        workflowId: workflowRecord.workflowId,
        status: workflowRecord.status,
        parameters: workflowRecord.parameters || {},
        s3Paths: workflowRecord.s3Paths || {},
        createdAt: workflowRecord.createdAt,
        updatedAt: workflowRecord.updatedAt,
        error: workflowRecord.error,
      }),
    };
  } catch (error: unknown) {
    console.error('Error getting workflow status:', error);
    return handleError(error);
  }
};

/**
 * Extracts workflowId from query parameters
 */
function extractWorkflowId(event: APIGatewayProxyEvent): string {
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
function extractUserId(event: APIGatewayProxyEvent): string {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    throw new ValidationError('Invalid or missing userId in JWT claims');
  }

  return userId;
}

/**
 * Retrieves workflow record from DynamoDB
 */
async function getWorkflowFromDatabase(
  userWorkflowsTable: string,
  userId: string,
  workflowId: string
) {
  try {
    return await getWorkflow(userWorkflowsTable, userId, workflowId);
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to retrieve workflow from DynamoDB: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'DynamoDB',
      error
    );
  }
}

/**
 * Handles different error types and returns appropriate HTTP responses
 */
function handleError(error: unknown): APIGatewayProxyResult {
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
