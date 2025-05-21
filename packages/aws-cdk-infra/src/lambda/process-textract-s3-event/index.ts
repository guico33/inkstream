import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from '@aws-sdk/client-sfn';
import { Handler, S3Event } from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

const accountId = process.env.AWS_ACCOUNT_ID;
if (!accountId) throw new Error('AWS_ACCOUNT_ID env var is required');
const DYNAMODB_TABLE_NAME = `dev-inkstream-textract-job-tokens-${accountId}`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});
const s3 = new S3Client({});

function extractJobIdFromKey(key: string): string | null {
  const match = key.match(/^textract-output\/(.+?)\//);
  return match ? match[1] : null;
}

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
    if (!/^[0-9]+$/.test(lastPart)) {
      console.log(`Ignoring non-Textract output file: ${key}`);
      continue;
    }
    const jobId = extractJobIdFromKey(key);
    if (!jobId) {
      console.warn(`Could not extract JobId from key: ${key}`);
      continue;
    }
    // Lookup TaskToken in DynamoDB
    const ddbResp = await ddb.send(
      new GetCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Key: { JobId: jobId },
      })
    );
    const item = ddbResp.Item;
    if (!item || !item.TaskToken) {
      console.warn(`No TaskToken found in DynamoDB for JobId: ${jobId}`);
      continue;
    }
    // List all numbered files for this job
    const prefix = `textract-output/${jobId}/`;
    const listResp = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
    );
    const numberedFiles = (listResp.Contents || [])
      .map((obj) => obj.Key)
      .filter(
        (key): key is string =>
          !!key && /^[0-9]+$/.test(key.slice(prefix.length)) // Corrected regex
      );
    // Get total expected pages from the first file
    let expectedPages = 0;
    if (numberedFiles.length > 0) {
      const getObj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: numberedFiles[0] })
      );
      const body = await getObj.Body?.transformToString();
      if (body) {
        try {
          const json = JSON.parse(body);
          expectedPages = json.DocumentMetadata?.Pages || 0;
        } catch {}
      }
    }
    // If this event is not for the last file, return early
    if (parseInt(lastPart, 10) !== expectedPages && expectedPages > 0) {
      console.log(
        `Not the last Textract part (got ${lastPart}, expected ${expectedPages}). Will process when last part arrives.`
      );
      continue;
    }
    // Aggregate all Textract output parts for this job
    const results = [];
    for (const fileKey of numberedFiles) {
      const getObj = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: fileKey })
      );
      const body = await getObj.Body?.transformToString();
      if (body) results.push({ key: fileKey, body });
    }
    // Merge all Blocks arrays
    let allBlocks: any[] = [];
    for (const part of results) {
      try {
        const json = JSON.parse(part.body);
        if (Array.isArray(json.Blocks)) {
          allBlocks = allBlocks.concat(json.Blocks);
        }
      } catch (e) {
        console.warn(`Failed to parse Textract part ${part.key}:`, e);
      }
    }
    // Save merged blocks to a new S3 file for downstream processing
    const mergedKey = `merged-textract-output/${jobId}/merged.json`; // Changed output path
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: mergedKey,
        Body: JSON.stringify({ Blocks: allBlocks }),
        ContentType: 'application/json',
      })
    );
    // Prepare result payload for Step Function
    const result = {
      s3Path: { bucket, key: mergedKey },
      fileType: item.FileType,
      workflowId: item.WorkflowId,
      userId: item.UserId,
      jobId,
    };
    try {
      await sfn.send(
        new SendTaskSuccessCommand({
          taskToken: item.TaskToken,
          output: JSON.stringify(result),
        })
      );
      console.log(`Sent task success for JobId: ${jobId}`);
    } catch (err) {
      console.error(`Failed to send task success for JobId: ${jobId}`, err);
      try {
        await sfn.send(
          new SendTaskFailureCommand({
            taskToken: item.TaskToken,
            error: 'TextractJobFailed',
            cause: (err as Error).message,
          })
        );
      } catch (failErr) {
        console.error('Failed to send task failure:', failErr);
      }
    }
    // Clean up DynamoDB entry
    await ddb.send(
      new DeleteCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Key: { JobId: jobId },
      })
    );
  }
  return { status: 'done' };
};
