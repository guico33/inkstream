// Utility functions for process-textract-s3-event Lambda handler
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

/**
 * Extracts the jobId from the S3 key.
 */
export function extractJobIdFromKey(key: string): string | null {
  const match = key.match(/^textract-output\/(.+?)\//);
  return match ? match[1] ?? null : null;
}

/**
 * List all numbered Textract output files for a given jobId in the bucket.
 */
export async function listNumberedTextractFiles(
  s3: S3Client,
  bucket: string,
  jobId: string
): Promise<string[]> {
  const prefix = `textract-output/${jobId}/`;
  const listResp = await s3.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
  );
  return (listResp.Contents || [])
    .map((obj) => obj.Key)
    .filter(
      (key): key is string => !!key && /^[0-9]+$/.test(key.slice(prefix.length))
    );
}

/**
 * Get the expected number of pages from the first Textract output file.
 */
export async function getExpectedPagesFromFirstFile(
  s3: S3Client,
  bucket: string,
  numberedFiles: string[]
): Promise<number> {
  if (numberedFiles.length === 0) return 0;
  const getObj = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: numberedFiles[0] })
  );
  const body = await getObj.Body?.transformToString();
  if (body) {
    try {
      const json = JSON.parse(body);
      return json.DocumentMetadata?.Pages || 0;
    } catch (e) {
      console.error('Failed to parse JSON from Textract output:', e);
      return 0;
    }
  }
  return 0;
}

/**
 * Aggregate and merge all Textract output blocks for a job.
 */
export async function mergeTextractBlocks(
  s3: S3Client,
  bucket: string,
  numberedFiles: string[]
): Promise<any[]> {
  const results = [];
  for (const fileKey of numberedFiles) {
    const getObj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: fileKey })
    );
    const body = await getObj.Body?.transformToString();
    if (body) results.push({ key: fileKey, body });
  }
  let allBlocks: any[] = [];
  for (const part of results) {
    try {
      const json = JSON.parse(part.body);
      if (Array.isArray(json.Blocks)) {
        allBlocks = allBlocks.concat(json.Blocks);
      }
    } catch (e) {
      console.error(
        `Failed to parse JSON from Textract output for file ${part.key}:`,
        e
      );
    }
  }
  return allBlocks;
}

/**
 * Save merged Textract blocks to S3 for downstream processing.
 */
export async function saveMergedBlocksToS3(
  s3: S3Client,
  bucket: string,
  jobId: string,
  allBlocks: any[]
): Promise<string> {
  const mergedKey = `merged-textract-output/${jobId}/merged.json`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: mergedKey,
      Body: JSON.stringify({ Blocks: allBlocks }),
      ContentType: 'application/json',
    })
  );
  return mergedKey;
}
