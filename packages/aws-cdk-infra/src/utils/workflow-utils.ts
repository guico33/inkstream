import {
  DescribeExecutionCommand,
  ExecutionStatus,
  SFNClient,
} from '@aws-sdk/client-sfn';
import { WorkflowRecord, WorkflowStatus } from '@inkstream/shared';

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
  sfnClient: SFNClient,
  executionArn: string
): Promise<StepFunctionsExecutionDetails> {
  try {
    console.log(
      'Fetching Step Functions execution details for ARN:',
      executionArn
    );

    const command = new DescribeExecutionCommand({
      executionArn,
    });

    const response = await sfnClient.send(command);

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
export function combineWorkflowDetails(
  workflowRecord: WorkflowRecord,
  executionDetails: StepFunctionsExecutionDetails
) {
  // Add Step Functions execution details if available
  if (executionDetails) {
    return {
      ...workflowRecord,
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
        status: 'FAILED' as WorkflowStatus,
      }),
    };
  }

  return workflowRecord;
}
