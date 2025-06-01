import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import {
  listWorkflows,
  listWorkflowsByCreatedAt,
  listWorkflowsByUpdatedAt,
} from '../../../utils/workflow-state';
import { WorkflowRecord } from '@inkstream/shared';
import { handleError, createSuccessResponse } from '../../../utils/api-utils';
import { ExternalServiceError } from '../../../errors';
import { extractUserId } from 'src/utils/auth-utils';

// Zod schema for environment variables validation
const EnvironmentSchema = z.object({
  USER_WORKFLOWS_TABLE: z
    .string({
      required_error: 'USER_WORKFLOWS_TABLE environment variable is required',
    })
    .min(1, 'USER_WORKFLOWS_TABLE cannot be empty'),
});

// Zod schema for query parameters validation
const QueryParametersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  nextToken: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt']).optional().default('updatedAt'),
});

// Validate environment variables
const env = EnvironmentSchema.parse(process.env);

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log(
    'User Workflows Lambda invoked with event:',
    JSON.stringify(event)
  );

  try {
    // Validate and extract user ID from JWT claims
    const userId = extractUserId(event);

    // Parse and validate query parameters
    const queryParams = QueryParametersSchema.parse(
      event.queryStringParameters || {}
    );

    console.log('Query parameters:', queryParams);

    // Get workflows for this user from DynamoDB with pagination and sorting
    const result = await getUserWorkflowsFromDatabase(
      env.USER_WORKFLOWS_TABLE,
      userId,
      queryParams
    );

    console.log(`Found ${result.items.length} workflows for user ${userId}`);

    // Return the workflows list with pagination info
    return createSuccessResponse(result);
  } catch (error: unknown) {
    console.error('Error getting user workflows:', error);
    return handleError(error);
  }
};

/**
 * Retrieves workflow records for a user from DynamoDB with pagination and sorting
 */
async function getUserWorkflowsFromDatabase(
  userWorkflowsTable: string,
  userId: string,
  options: {
    limit?: number;
    nextToken?: string;
    sortBy: 'createdAt' | 'updatedAt';
  }
): Promise<{
  items: WorkflowRecord[];
  nextToken?: string;
}> {
  try {
    // Choose the appropriate function based on sortBy parameter
    switch (options.sortBy) {
      case 'createdAt':
        return await listWorkflowsByCreatedAt(userWorkflowsTable, userId, {
          limit: options.limit,
          nextToken: options.nextToken,
        });
      case 'updatedAt':
        return await listWorkflowsByUpdatedAt(userWorkflowsTable, userId, {
          limit: options.limit,
          nextToken: options.nextToken,
        });
      default:
        // Fallback to default listWorkflows (sorted by updatedAt)
        return await listWorkflows(userWorkflowsTable, userId, {
          limit: options.limit,
          nextToken: options.nextToken,
        });
    }
  } catch (error) {
    throw new ExternalServiceError(
      'Failed to retrieve user workflows from DynamoDB',
      'DynamoDB',
      error
    );
  }
}
