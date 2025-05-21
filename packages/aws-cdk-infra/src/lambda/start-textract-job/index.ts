import {
  TextractClient,
  StartDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Handler } from 'aws-lambda';

const textract = new TextractClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Remove getAccountId and use AWS_ACCOUNT_ID directly
const accountId = process.env.AWS_ACCOUNT_ID;
const DYNAMODB_TABLE_NAME = `dev-inkstream-textract-job-tokens-${accountId}`;
const OUTPUT_S3_BUCKET_NAME = `dev-inkstream-storage-${accountId}`;

export const handler: Handler = async (event) => {
  console.log('Received event:', JSON.stringify(event));
  const { s3Path, fileType, taskToken, workflowId, userId } = event;

  if (!s3Path || !s3Path.bucket || !s3Path.key) {
    throw new Error('Missing s3Path (bucket/key) in event');
  }
  if (!taskToken) {
    throw new Error('Missing taskToken in event');
  }

  // Start Textract job
  try {
    console.log('Starting Textract job with:', {
      bucket: s3Path.bucket,
      key: s3Path.key,
      outputBucket: OUTPUT_S3_BUCKET_NAME,
    });
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: s3Path.bucket,
          Name: s3Path.key,
        },
      },
      OutputConfig: {
        S3Bucket: OUTPUT_S3_BUCKET_NAME,
        S3Prefix: 'textract-output',
      },
      // NotificationChannel: { ... } // Optional: SNS for direct failure notification
    });

    const startResp = await textract.send(startCommand);
    console.log('Textract start response:', JSON.stringify(startResp));
    const jobId = startResp.JobId;
    if (!jobId) throw new Error('Textract did not return a JobId');

    // Store JobId -> TaskToken mapping in DynamoDB
    const now = Math.floor(Date.now() / 1000);
    const ttl = now + 60 * 60 * 6; // 6 hours TTL
    await ddb.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Item: {
          JobId: jobId,
          TaskToken: taskToken,
          FileType: fileType,
          WorkflowId: workflowId,
          UserId: userId,
          S3Input: s3Path,
          ExpirationTime: ttl,
        },
      })
    );
    console.log('Stored JobId and TaskToken in DynamoDB:', jobId);
    return { jobId };
  } catch (err) {
    console.error('Error starting Textract job:', err);
    throw err;
  }
};
