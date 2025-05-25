import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from '@aws-sdk/client-sfn';
import { Handler, S3Event } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import {
  listNumberedTextractFiles,
  getExpectedPagesFromFirstFile,
  mergeTextractBlocks,
  saveMergedBlocksToS3,
  extractJobIdFromKey,
} from './utils';
import {
  deleteJobToken,
  getJobToken,
} from '../../../utils/textract-job-tokens';

const accountId = process.env.AWS_ACCOUNT_ID;
if (!accountId) throw new Error('AWS_ACCOUNT_ID env var is required');
const DYNAMODB_TABLE_NAME = `dev-inkstream-textract-job-tokens-${accountId}`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});
const s3 = new S3Client({});

export const handler: Handler = async (event: S3Event) => {
  console.log('Received S3 event:', JSON.stringify(event));
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    // Ignore .s3_access_check files
    if (key.endsWith('.s3_access_check')) {
      console.log(`Ignoring S3 access check file: ${key}`);
      continue;
    }
    // Only process files that are numbers (e.g., .../1, .../2, .../3)
    const keyParts = key.split('/');
    const lastPart = keyParts[keyParts.length - 1];
    if (!lastPart || !/^[0-9]+$/.test(lastPart)) {
      console.log(`Ignoring non-Textract output file: ${key}`);
      continue;
    }
    const textractJobId = extractJobIdFromKey(key);
    if (!textractJobId) {
      console.warn(`Could not extract JobId from key: ${key}`);
      continue;
    }
    // Lookup TaskToken in DynamoDB
    const jobTokenItem = await getJobToken(
      DYNAMODB_TABLE_NAME,
      textractJobId,
      ddb
    );

    if (!jobTokenItem || !jobTokenItem.taskToken) {
      console.warn(
        `No TaskToken found in DynamoDB for JobId: ${textractJobId}`
      );
      continue;
    }
    // List all numbered files for this job
    const numberedFiles = await listNumberedTextractFiles(
      s3,
      bucket,
      textractJobId
    );
    // Get total expected pages from the first file
    const expectedPages = await getExpectedPagesFromFirstFile(
      s3,
      bucket,
      numberedFiles
    );
    // If this event is not for the last file, return early
    if (parseInt(lastPart, 10) !== expectedPages && expectedPages > 0) {
      console.log(
        `Not the last Textract part (got ${lastPart}, expected ${expectedPages}). Will process when last part arrives.`
      );
      continue;
    }
    // Aggregate all Textract output parts for this job
    const allBlocks = await mergeTextractBlocks(s3, bucket, numberedFiles);
    // Save merged blocks to a new S3 file for downstream processing
    const textractMergedFileKey = await saveMergedBlocksToS3(
      s3,
      bucket,
      textractJobId,
      allBlocks
    );
    // Prepare result payload for Step Function
    const result = { textractMergedFileKey };
    try {
      await sfn.send(
        new SendTaskSuccessCommand({
          taskToken: jobTokenItem.taskToken,
          output: JSON.stringify(result),
        })
      );
      console.log(`Sent task success for JobId: ${textractJobId}`);
    } catch (err) {
      console.error(
        `Failed to send task success for JobId: ${textractJobId}`,
        err
      );
      try {
        await sfn.send(
          new SendTaskFailureCommand({
            taskToken: jobTokenItem.taskToken,
            error: 'TextractJobFailed',
            cause: (err as Error).message,
          })
        );
      } catch (failErr) {
        console.error('Failed to send task failure:', failErr);
      }
    }
    // Clean up DynamoDB entry
    await deleteJobToken(DYNAMODB_TABLE_NAME, textractJobId, ddb);
  }
  return { status: 'done' };
};
