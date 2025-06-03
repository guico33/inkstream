import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  SFNClient,
  StartExecutionCommand,
  StartExecutionCommandOutput,
} from '@aws-sdk/client-sfn';
import { z } from 'zod';
import { createWorkflow } from '../../../utils/user-workflows-db-utils';
import {
  WorkflowCommonState,
  WorkflowRecord,
  WorkflowResponse,
  StartWorkflowResult,
} from '@inkstream/shared';
import { ExternalServiceError } from '../../../errors';
import {
  validateRequestBody,
  createSuccessResponse,
  handleError,
} from '../../../utils/api-utils';
import { extractUserId } from 'src/utils/auth-utils';
import {
  combineWorkflowDetails,
  getStepFunctionsExecutionDetails,
} from '../../../utils/workflow-utils';

// Zod schema for environment variables validation
const EnvironmentSchema = z.object({
  STATE_MACHINE_ARN: z
    .string({
      required_error: 'STATE_MACHINE_ARN environment variable is required',
    })
    .min(1, 'STATE_MACHINE_ARN cannot be empty'),
  STORAGE_BUCKET: z
    .string({
      required_error: 'STORAGE_BUCKET environment variable is required',
    })
    .min(1, 'STORAGE_BUCKET cannot be empty'),
  USER_WORKFLOWS_TABLE: z
    .string({
      required_error: 'USER_WORKFLOWS_TABLE environment variable is required',
    })
    .min(1, 'USER_WORKFLOWS_TABLE cannot be empty'),
});

// validate environment variables
const env = EnvironmentSchema.parse(process.env);

const sfnClient = new SFNClient({});

// Zod schema for request body validation
const WorkflowInputSchema = z.object({
  filename: z
    .string({ required_error: 'filename is required' })
    .min(1, 'filename cannot be empty'),
  doTranslate: z.boolean().optional().default(false),
  doSpeech: z.boolean().optional().default(false),
  targetLanguage: z.string().optional().default('english'),
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<StartWorkflowResult> => {
  console.log(
    'Start Workflow Lambda invoked with event:',
    JSON.stringify(event)
  );

  try {
    // Validate and parse request body
    const requestBody = validateRequestBody(event.body, WorkflowInputSchema);

    // Validate and extract user ID from JWT claims
    const userId = extractUserId(event);

    // Prepare workflow execution input
    const fileKey = `users/${userId}/uploads/${requestBody.filename}`;
    const executionInput: WorkflowCommonState = {
      doTranslate: requestBody.doTranslate,
      doSpeech: requestBody.doSpeech,
      targetLanguage: requestBody.targetLanguage,
      storageBucket: env.STORAGE_BUCKET,
      originalFileKey: fileKey,
      userId,
      timestamp: Date.now(),
    };

    // Start Step Functions execution
    const workflowId = await startStepFunctionExecution(
      env.STATE_MACHINE_ARN,
      executionInput
    );

    // Create workflow record in DynamoDB
    const workflowDetails = await createWorkflowRecord(
      env.USER_WORKFLOWS_TABLE,
      userId,
      workflowId,
      executionInput,
      fileKey
    );

    const executionDetails = await getStepFunctionsExecutionDetails(
      sfnClient,
      workflowId
    );

    const combinedWorkflowDetails = combineWorkflowDetails(
      workflowDetails,
      executionDetails
    );

    const response: WorkflowResponse = combinedWorkflowDetails;

    return createSuccessResponse(response);
  } catch (error: unknown) {
    console.error('Error starting workflow:', error);
    return handleError(error);
  }
};

/**
 * Starts Step Functions execution and returns the workflow ID
 */
async function startStepFunctionExecution(
  stateMachineArn: string,
  executionInput: WorkflowCommonState
): Promise<string> {
  const startExecutionCommand = new StartExecutionCommand({
    stateMachineArn,
    input: JSON.stringify(executionInput),
  });

  try {
    const response: StartExecutionCommandOutput = await sfnClient.send(
      startExecutionCommand
    );

    if (!response || !response.executionArn) {
      throw new ExternalServiceError(
        'Step Functions did not return an executionArn',
        'StepFunctions'
      );
    }

    return response.executionArn;
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }
    throw new ExternalServiceError(
      `Failed to start Step Functions execution: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'StepFunctions',
      error
    );
  }
}

/**
 * Creates workflow record in DynamoDB
 */
async function createWorkflowRecord(
  userWorkflowsTable: string,
  userId: string,
  workflowId: string,
  executionInput: WorkflowCommonState,
  fileKey: string
): Promise<WorkflowRecord> {
  const nowIso = new Date().toISOString();

  try {
    const workflow = await createWorkflow(userWorkflowsTable, {
      userId,
      workflowId,
      status: 'STARTING',
      statusHistory: [
        {
          status: 'STARTING',
          timestamp: nowIso,
        },
      ],
      parameters: {
        doTranslate: executionInput.doTranslate,
        doSpeech: executionInput.doSpeech,
        targetLanguage: executionInput.targetLanguage,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
      s3Paths: {
        originalFile: fileKey,
      },
    });

    if (!workflow) {
      throw new ExternalServiceError(
        'Failed to create workflow record in DynamoDB',
        'DynamoDB'
      );
    }

    return workflow;
  } catch (error) {
    throw new ExternalServiceError(
      `Failed to create workflow record in DynamoDB: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'DynamoDB',
      error
    );
  }
}
