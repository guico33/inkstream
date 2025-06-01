import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import {
  listWorkflowsWithSorting,
  listWorkflowsByStatus,
} from '../../../utils/workflow-state';
import {
  WorkflowRecord,
  WorkflowStatus,
  workflowStatuses,
} from '@inkstream/shared';
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
const QueryParametersSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    nextToken: z.string().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt']).optional(),
    // one of the values in workflowStatuses
    status: z
      .enum(workflowStatuses, {
        required_error: 'status must be one of the defined workflow statuses',
        invalid_type_error: 'status must be a string',
      })
      .optional(),
  })
  .refine(
    (data) => {
      // Prevent sortBy and status from being used together
      return !(data.sortBy && data.status);
    },
    {
      message:
        'sortBy parameter cannot be used with status filtering. Use either sortBy for sorting or status for filtering, but not both.',
    }
  );

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

    // Get workflows for this user from DynamoDB with pagination, sorting, and filtering
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
 * Retrieves workflow records for a user from DynamoDB with pagination, sorting, and filtering
 */
async function getUserWorkflowsFromDatabase(
  userWorkflowsTable: string,
  userId: string,
  options: {
    limit?: number;
    nextToken?: string;
    sortBy?: 'createdAt' | 'updatedAt';
    status?: WorkflowStatus;
  }
): Promise<{
  items: WorkflowRecord[];
  nextToken?: string;
}> {
  try {
    // Use the appropriate function based on whether status filtering is needed
    if (options.status) {
      // Status filtering - use dedicated function
      return await listWorkflowsByStatus(
        userWorkflowsTable,
        userId,
        options.status,
        {
          limit: options.limit,
          nextToken: options.nextToken,
        }
      );
    } else {
      // No status filtering - use sorting function with default sortBy
      return await listWorkflowsWithSorting(userWorkflowsTable, userId, {
        limit: options.limit,
        nextToken: options.nextToken,
        sortBy: options.sortBy || 'updatedAt',
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
