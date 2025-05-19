import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';

const sfnClient = new SFNClient({});

interface WorkflowInput {
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
  fileKey?: string;
  userId?: string;
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
      throw new Error('STATE_MACHINE_ARN environment variable is not set');
    }

    // Parse request body if available
    let requestBody: WorkflowInput = {};
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
    const executionInput: WorkflowInput = {
      ...requestBody,
      doTranslate: requestBody.doTranslate ?? false,
      doSpeech: requestBody.doSpeech ?? false,
      targetLanguage: requestBody.targetLanguage ?? 'french',
      fileKey: requestBody.fileKey,
      userId: requestBody.userId || 'anonymous',
      timestamp: Date.now(),
      workflowId: workflowId, // Add the UUID to the input
    };

    // Start the Step Functions execution
    const startExecutionCommand = new StartExecutionCommand({
      stateMachineArn,
      input: JSON.stringify(executionInput),
      name: `Execution-${workflowId.substring(0, 8)}-${Date.now()}`,
    });

    const response = await sfnClient.send(startExecutionCommand);

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
