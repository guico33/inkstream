import { Handler } from 'aws-lambda';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  DetectDocumentTextCommand,
} from '@aws-sdk/client-textract';
import {
  Block,
  JobStatus,
  GetDocumentTextDetectionCommandOutput,
} from '@aws-sdk/client-textract';

// Import utility functions
import { getTextFromS3 } from '../../utils/s3-utils';
import { getFileExtension } from '../../utils/file-utils';
import { formatErrorForLogging } from '../../utils/error-utils';

// Initialize Textract client
const textract = new TextractClient({});

function extractTextFromBlocks(blocks: Block[]): string {
  return blocks
    .filter((block) => block.BlockType === 'LINE' && block.Text)
    .map((block) => block.Text)
    .join('\n');
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

  try {
    // Get the file extension to determine how to process the file
    const rawFileExt = getFileExtension(fileKey);
    if (!rawFileExt) {
      throw new Error(`Could not determine file extension for file: ${fileKey}`);
    }
    const fileExt = rawFileExt.toLowerCase();
    let extractedText = '';

    if (fileExt === 'txt') {
      extractedText = await getTextFromS3(bucket, fileKey);
    } else if (fileExt === 'pdf') {
      extractedText = await extractTextFromPdf(bucket, fileKey);
    } else if (['jpeg', 'jpg', 'png'].includes(fileExt)) {
      extractedText = await extractTextFromImage(bucket, fileKey);
    } else {
      throw new Error(`Unsupported file type: ${fileExt}`);
    }

    return {
      ...event,
      extractedText,
      fileKey,
      fileType: fileExt,
    };
  } catch (error) {
    console.error('Error extracting text:', formatErrorForLogging('extract text', error));
    throw error; // Let AWS Lambda handle the error response
  }
};
