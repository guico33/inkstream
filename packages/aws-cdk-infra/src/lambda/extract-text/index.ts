import { Handler } from 'aws-lambda';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  Block,
  JobStatus,
  GetDocumentTextDetectionCommandOutput,
} from '@aws-sdk/client-textract';

const textract = new TextractClient({});
const s3 = new S3Client({});

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function extractTextFromBlocks(blocks: Block[]): string {
  return blocks
    .filter((block) => block.BlockType === 'LINE' && block.Text)
    .map((block) => block.Text)
    .join('\n');
}

function extractTextFromTxt(bucket: string, fileKey: string): Promise<string> {
  return s3
    .send(new GetObjectCommand({ Bucket: bucket, Key: fileKey }))
    .then((obj) => streamToString(obj.Body as Readable));
}

async function extractTextFromPdf(
  bucket: string,
  fileKey: string
): Promise<string> {
  const startRes = await textract.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: fileKey } },
    })
  );
  const jobId = startRes.JobId;
  if (!jobId) throw new Error('Textract did not return a JobId');
  let status: JobStatus = 'IN_PROGRESS';
  let result: GetDocumentTextDetectionCommandOutput | undefined = undefined;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    result = await textract.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId })
    );
    status = result.JobStatus || status;
    if (status === 'SUCCEEDED') break;
    if (status === 'FAILED') throw new Error('Textract job failed');
  }
  if (status !== 'SUCCEEDED' || !result) {
    throw new Error('Textract job timed out');
  }
  return extractTextFromBlocks(result.Blocks || []);
}

async function extractTextFromImage(
  bucket: string,
  fileKey: string
): Promise<string> {
  const res = await textract.send(
    new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: bucket, Name: fileKey } },
    })
  );
  return extractTextFromBlocks(res?.Blocks || []);
}

export const handler: Handler = async (event) => {
  console.log('Extract Lambda invoked with event:', JSON.stringify(event));

  const bucket = process.env.BUCKET_NAME;
  const fileKey = event.fileKey || event.s3Key || event.key;

  if (!bucket) {
    throw new Error('Missing BUCKET_NAME in environment variables');
  }

  if (!fileKey) {
    throw new Error('Missing fileKey in event');
  }

  const fileExt = fileKey.split('.').pop()?.toLowerCase();
  let extractedText = '';

  if (fileExt === 'txt') {
    extractedText = await extractTextFromTxt(bucket, fileKey);
  } else if (fileExt === 'pdf') {
    extractedText = await extractTextFromPdf(bucket, fileKey);
  } else if (['jpeg', 'jpg', 'png'].includes(fileExt || '')) {
    extractedText = await extractTextFromImage(bucket, fileKey);
  } else {
    throw new Error('Unsupported file type: ' + fileExt);
  }

  return {
    ...event,
    extractedText,
    fileKey,
    fileType: fileExt,
  };
};
