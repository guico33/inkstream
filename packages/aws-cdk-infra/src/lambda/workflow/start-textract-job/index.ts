import {
  TextractClient,
  StartDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { Handler } from 'aws-lambda';
import { z } from 'zod';
import {
  putJobToken,
  TextractJobTokenItem,
} from '../../../utils/textract-job-tokens';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { updateWorkflowStatus } from '../../../utils/workflow-state';
import { WorkflowCommonState } from '@inkstream/shared';
import { ValidationError } from '../../../errors';

const textract = new TextractClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Zod schema for input validation
const StartTextractJobEventSchema = z.object({
  originalFileKey: z
    .string({
      required_error: 'originalFileKey is required',
      invalid_type_error: 'originalFileKey must be a string',
    })
    .min(1, 'originalFileKey cannot be empty'),
  taskToken: z
    .string({
      required_error: 'taskToken is required',
      invalid_type_error: 'taskToken must be a string',
    })
    .min(1, 'taskToken cannot be empty'),
  workflowId: z
    .string({
      required_error: 'workflowId is required',
      invalid_type_error: 'workflowId must be a string',
    })
    .min(1, 'workflowId cannot be empty'),
  userId: z
    .string({
      required_error: 'userId is required',
      invalid_type_error: 'userId must be a string',
    })
    .min(1, 'userId cannot be empty'),
  storageBucket: z
    .string({
      required_error: 'storageBucket is required',
      invalid_type_error: 'storageBucket must be a string',
    })
    .min(1, 'storageBucket cannot be empty'),
  timestamp: z.number().optional(),
});

interface StartTextractJobEvent extends WorkflowCommonState {
  taskToken: string; // Step Function task token
  workflowId: string; // Unique workflow ID
}

export const handler: Handler = async (event: StartTextractJobEvent) => {
  console.log('Received event:', JSON.stringify(event));

  const textractJobTokensTable = process.env.TEXTRACT_JOB_TOKENS_TABLE;
  const userWorkflowsTable = process.env.USER_WORKFLOWS_TABLE;

  if (!textractJobTokensTable)
    throw new Error(
      'TEXTRACT_JOB_TOKENS_TABLE environment variable is not set'
    );

  if (!userWorkflowsTable)
    throw new Error('USER_WORKFLOWS_TABLE environment variable is not set');

  // Validate input using Zod schema
  try {
    StartTextractJobEventSchema.parse(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(firstError?.message || 'Validation failed');
    }
    throw new ValidationError('Invalid input format');
  }

  const { originalFileKey, taskToken, workflowId, userId, storageBucket } =
    event;

  // Start Textract job
  try {
    console.log('Starting Textract job with:', {
      bucket: storageBucket,
      key: originalFileKey,
    });
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: storageBucket,
          Name: originalFileKey,
        },
      },
      OutputConfig: {
        S3Bucket: storageBucket,
        S3Prefix: 'textract-output',
      },
    });

    const startResp = await textract.send(startCommand);
    console.log('Textract start response:', JSON.stringify(startResp));
    const jobId = startResp.JobId;
    if (!jobId) throw new Error('Textract did not return a JobId');

    // Store JobId -> TaskToken mapping in DynamoDB
    const now = Math.floor(Date.now() / 1000);
    const ttl = now + 60 * 60 * 6; // 6 hours TTL
    const jobToken: TextractJobTokenItem = {
      jobId,
      taskToken,
      workflowId,
      userId,
      s3Input: {
        bucket: storageBucket,
        key: originalFileKey,
      },
      expirationTime: ttl.toString(),
    };
    await putJobToken(textractJobTokensTable, jobToken, ddb);
    console.log('Stored JobId and TaskToken in DynamoDB:', jobId);

    // --- Update workflow state in user-workflows table ---
    const userWorkflowTable = process.env.USER_WORKFLOWS_TABLE;
    if (userWorkflowTable && userId && workflowId) {
      // Only update s3Paths for step-specific outputs, not originalFile
      await updateWorkflowStatus(
        userWorkflowTable,
        userId,
        workflowId,
        'EXTRACTING_TEXT'
      );
      console.log(
        'Updated workflow status to EXTRACTING_TEXT in user-workflows table'
      );
    }
    // --- End workflow state update ---

    return { message: `Textract job started successfully`, jobId };
  } catch (err) {
    console.error('Error starting Textract job:', err);
    throw err;
  }
};
