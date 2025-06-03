import { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';
import { extractWorkflowId, getWorkflowFromDatabase } from './utils';
import { WorkflowResponse, GetWorkflowResult } from '@inkstream/shared';
import { extractUserId } from 'src/utils/auth-utils';
import {
  handleError,
  createSuccessResponse,
  createErrorResponse,
} from 'src/utils/api-utils';
import {
  combineWorkflowDetails,
  getStepFunctionsExecutionDetails,
} from 'src/utils/workflow-utils';
import { SFNClient } from '@aws-sdk/client-sfn';

const sfnClient = new SFNClient({});

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
): Promise<GetWorkflowResult> => {
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
      return createErrorResponse(404, 'Workflow not found', undefined, {
        workflowId,
      });
    }

    // Only get Step Functions execution details after confirming user owns this workflow
    const executionDetails = await getStepFunctionsExecutionDetails(
      sfnClient,
      workflowId
    );

    // Combine DynamoDB record with Step Functions execution details
    const workflowDetails: WorkflowResponse = combineWorkflowDetails(
      workflowRecord,
      executionDetails
    );

    console.log(
      'Combined workflow status:',
      JSON.stringify(workflowDetails, null, 2)
    );

    // Return comprehensive workflow status
    return createSuccessResponse(workflowDetails);
  } catch (error: unknown) {
    console.error('Error getting workflow status:', error);
    return handleError(error);
  }
};
