import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';
import { createWorkflow } from '../../../utils/workflow-state';

const sfnClient = new SFNClient({});

interface WorkflowInput {
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
  fileKey?: string;
  timestamp?: number;
  workflowId?: string;
  [key: string]: unknown;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log(
    'Start Workflow Lambda invoked with event:',
    JSON.stringify(event)
  );

  try {
    // Get the state machine ARN from environment variables
    const stateMachineArn = process.env.STATE_MACHINE_ARN as string;

    if (!stateMachineArn) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'STATE_MACHINE_ARN environment variable is not set',
        }),
      };
    }

    // Parse request body if available
    let requestBody: WorkflowInput = {};
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid request body format',
          error: 'Body must be valid JSON',
        }),
      };
    }
    if (event.body) {
      try {
        requestBody = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: 'Invalid request body format',
            error: 'Body must be valid JSON',
          }),
        };
      }
    }

    // Prepare the input for the state machine
    // Default values can be overridden by the request body
    const workflowId = uuidv4();
    // Extract userId from Cognito JWT claims in the event
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

    if (!userId || typeof userId !== 'string' || userId.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid or missing userId',
        }),
      };
    }

    const executionInput: WorkflowInput = {
      ...requestBody,
      doTranslate: requestBody.doTranslate ?? false,
      doSpeech: requestBody.doSpeech ?? false,
      targetLanguage: requestBody.targetLanguage ?? 'french',
      fileKey: requestBody.fileKey,
      userId,
      timestamp: Date.now(),
      workflowId: workflowId, // Add the UUID to the input
    };

    // --- Create workflow record in DynamoDB with status STARTING ---
    const userWorkflowsTable = process.env.USER_WORKFLOWS_TABLE;
    if (!userWorkflowsTable) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'USER_WORKFLOWS_TABLE environment variable is not set',
        }),
      };
    }
    await createWorkflow(userWorkflowsTable, {
      userId,
      workflowId,
      status: 'STARTING',
      parameters: {
        doTranslate: executionInput.doTranslate,
        doSpeech: executionInput.doSpeech,
        targetLanguage: executionInput.targetLanguage,
      },
      createdAt: new Date(executionInput.timestamp!).toISOString(),
      updatedAt: new Date(executionInput.timestamp!).toISOString(),
    });
    // --- End workflow record creation ---

    // Start the Step Functions execution
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify(executionInput),
      name: `Execution-${workflowId.substring(0, 8)}-${Date.now()}`,
    });

    let response: any = undefined;
    try {
      response = await sfnClient.send(startExecutionCommand);
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to start workflow',
          error: err instanceof Error ? err.message : String(err),
        }),
      };
    }

    if (!response || !response.executionArn) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to start workflow',
          error: 'Step Functions did not return an executionArn',
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Workflow started successfully',
        executionArn: response.executionArn,
        startDate: response.startDate,
      }),
    };
  } catch (error: unknown) {
    console.error('Error starting workflow:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to start workflow',
        error: errorMessage,
      }),
    };
  }
};
