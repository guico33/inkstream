import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  SFNClient,
  StartExecutionCommand,
  StartExecutionCommandOutput,
} from '@aws-sdk/client-sfn';
import { z } from 'zod';
import { createWorkflow } from '../../../utils/workflow-state';
import { WorkflowCommonState } from '../../../types/workflow';
import { ValidationError, ExternalServiceError } from '../../../errors';

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

type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log(
    'Start Workflow Lambda invoked with event:',
    JSON.stringify(event)
  );

  try {
    // Validate and parse request body
    const requestBody = validateRequestBody(event.body);

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
    await createWorkflowRecord(
      env.USER_WORKFLOWS_TABLE,
      userId,
      workflowId,
      executionInput,
      fileKey
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Workflow started successfully',
        workflowId,
      }),
    };
  } catch (error: unknown) {
    console.error('Error starting workflow:', error);
    return handleError(error);
  }
};

/**
 * Validates and parses the request body
 */
function validateRequestBody(body: string | null): WorkflowInput {
  if (!body) {
    throw new ValidationError('Request body is required');
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    throw new ValidationError(
      'Invalid request body format - must be valid JSON'
    );
  }

  try {
    return WorkflowInputSchema.parse(parsedBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      throw new ValidationError(
        `Invalid request body: ${errorMessages.join(', ')}`
      );
    }
    throw new ValidationError('Invalid request body');
  }
}

/**
 * Extracts and validates user ID from JWT claims
 */
function extractUserId(event: APIGatewayProxyEvent): string {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    throw new ValidationError('Invalid or missing userId in JWT claims');
  }

  return userId;
}

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
): Promise<void> {
  const nowIso = new Date().toISOString();

  try {
    await createWorkflow(userWorkflowsTable, {
      userId,
      workflowId,
      status: 'STARTING',
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

/**
 * Handles different error types and returns appropriate HTTP responses
 */
function handleError(error: unknown): APIGatewayProxyResult {
  if (error instanceof ValidationError) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Validation error',
        error: error.message,
      }),
    };
  }

  if (error instanceof z.ZodError) {
    const errorMessages = error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`
    );
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Environment configuration error',
        error: errorMessages.join(', '),
      }),
    };
  }

  if (error instanceof ExternalServiceError) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to start workflow',
        error: error.message,
      }),
    };
  }

  // Generic error handling
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  return {
    statusCode: 500,
    body: JSON.stringify({
      message: 'Failed to start workflow',
      error: errorMessage,
    }),
  };
}
