import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { z } from 'zod';
import {
  getStepFunctionsExecutionDetails,
  combineWorkflowStatus,
  extractWorkflowId,
  getWorkflowFromDatabase,
} from './utils';
import { extractUserId } from 'src/utils/auth-utils';
import { handleError } from 'src/utils/api-utils';

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
    'Workflow Status Lambda invoked with event:',
    JSON.stringify(event)
  );

  try {
    // Extract and validate workflowId from query parameters
    const workflowId = extractWorkflowId(event);

    // Validate and extract user ID from JWT claims
    const userId = extractUserId(event);

    // Get workflow record from DynamoDB - this acts as authorization check
    const workflowRecord = await getWorkflowFromDatabase(
      env.USER_WORKFLOWS_TABLE,
      userId,
      workflowId
    );

    if (!workflowRecord) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Workflow not found',
          workflowId,
        }),
      };
    }

    // Only get Step Functions execution details after confirming user owns this workflow
    const executionDetails = await getStepFunctionsExecutionDetails(workflowId);

    // Combine DynamoDB record with Step Functions execution details
    const status = combineWorkflowStatus(workflowRecord, executionDetails);

    console.log('Combined workflow status:', JSON.stringify(status, null, 2));

    // Return comprehensive workflow status
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(status),
    };
  } catch (error: unknown) {
    console.error('Error getting workflow status:', error);
    return handleError(error);
  }
};
