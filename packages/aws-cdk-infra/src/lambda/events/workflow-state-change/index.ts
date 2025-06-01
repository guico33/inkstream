import { EventBridgeEvent } from 'aws-lambda';
import { z } from 'zod';
import { updateWorkflowStatus } from '../../../utils/workflow-state';

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

// Step Functions state change event structure
interface StepFunctionsStateChangeEvent {
  version: string;
  id: string;
  'detail-type': string;
  source: string;
  account: string;
  time: string;
  region: string;
  detail: {
    executionArn: string;
    stateMachineArn: string;
    name: string; // This is our workflowId
    status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
    startDate: number;
    stopDate?: number;
    input?: string;
    output?: string;
    error?: string;
    cause?: string;
  };
}

export const handler = async (
  event: EventBridgeEvent<string, StepFunctionsStateChangeEvent['detail']>
): Promise<void> => {
  console.log(
    'Workflow State Change Lambda invoked with event:',
    JSON.stringify(event, null, 2)
  );

  try {
    const { detail } = event;
    const { executionArn: workflowId, status } = detail;

    console.log(
      `Processing state change for workflow ${workflowId}: ${status}`
    );

    // Only handle states that aren't already processed by step lambdas
    // SUCCEEDED and FAILED are handled by the workflow step lambdas
    // We only need to handle TIMED_OUT and ABORTED which bypass normal flow
    if (!['TIMED_OUT', 'ABORTED'].includes(status)) {
      console.log(`Ignoring status that's handled by step lambdas: ${status}`);
      return;
    }

    // Extract input to get userId (workflowId is the execution name/ARN)
    let userId: string | undefined;

    if (detail.input) {
      try {
        const inputData = JSON.parse(detail.input);
        userId = inputData.userId;
      } catch (error) {
        console.error('Failed to parse execution input:', error);
      }
    }

    if (!userId) {
      console.error(
        `No userId found in execution input for workflow ${workflowId}`
      );
      return;
    }

    // Determine the workflow status based on Step Functions status
    let workflowStatus: 'FAILED' | 'TIMED_OUT';
    let errorDetails: { error?: string; cause?: string } = {};

    switch (status) {
      case 'TIMED_OUT':
        workflowStatus = 'TIMED_OUT';
        errorDetails = {
          error: 'Workflow timed out',
          cause: 'Step Functions execution exceeded timeout limit',
        };
        break;
      case 'ABORTED':
        workflowStatus = 'FAILED';
        errorDetails = {
          error: 'Workflow aborted',
          cause: 'Step Functions execution was manually stopped',
        };
        break;
      default:
        console.log(`Unhandled status: ${status}`);
        return;
    }

    // Update workflow status in DynamoDB
    try {
      await updateWorkflowStatus(
        env.USER_WORKFLOWS_TABLE,
        userId,
        workflowId,
        workflowStatus,
        errorDetails
      );

      console.log(
        `Successfully updated workflow ${workflowId} status to ${workflowStatus}`
      );
    } catch (updateError) {
      console.error(
        `Failed to update workflow status for ${workflowId}:`,
        updateError
      );

      // Don't throw here - we don't want EventBridge to retry
      // Log the error for monitoring purposes
    }
  } catch (error) {
    console.error('Error processing workflow state change:', error);
    // Don't throw - we don't want EventBridge to retry indefinitely
  }
};
