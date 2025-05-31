import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import { listWorkflows } from '../../../utils/workflow-state';
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

    // Get all workflows for this user from DynamoDB
    const workflows = await getUserWorkflowsFromDatabase(
      env.USER_WORKFLOWS_TABLE,
      userId
    );

    console.log(`Found ${workflows.length} workflows for user ${userId}`);

    // Return the workflows list
    return createSuccessResponse(workflows);
  } catch (error: unknown) {
    console.error('Error getting user workflows:', error);
    return handleError(error);
  }
};

/**
 * Retrieves all workflow records for a user from DynamoDB
 */
async function getUserWorkflowsFromDatabase(
  userWorkflowsTable: string,
  userId: string
): Promise<WorkflowRecord[]> {
  try {
    const workflows = await listWorkflows(userWorkflowsTable, userId);
    return workflows || [];
  } catch (error) {
    throw new ExternalServiceError(
      'Failed to retrieve user workflows from DynamoDB',
      'DynamoDB',
      error
    );
  }
}
