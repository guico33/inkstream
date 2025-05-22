import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listNumberedTextractFiles,
  getExpectedPagesFromFirstFile,
  mergeTextractBlocks,
  saveMergedBlocksToS3,
} from './utils';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

function mockS3SendImpl(handlers: Record<string, any>) {
  return vi.fn(async (command) => {
    if (command instanceof ListObjectsV2Command) {
      return handlers.ListObjectsV2Command?.(command) ?? {};
    }
    if (command instanceof GetObjectCommand) {
      return handlers.GetObjectCommand?.(command) ?? {};
    }
    if (command instanceof PutObjectCommand) {
      return handlers.PutObjectCommand?.(command) ?? {};
    }
    return {};
  });
}

describe('process-textract-s3-event utils', () => {
  let s3: S3Client;

  beforeEach(() => {
    s3 = new S3Client({});
  });

  it('listNumberedTextractFiles returns only numbered files', async () => {
    const send = mockS3SendImpl({
      ListObjectsV2Command: () => ({
        Contents: [
          { Key: 'textract-output/job-1/1' },
          { Key: 'textract-output/job-1/2' },
          { Key: 'textract-output/job-1/foo' },
          { Key: 'other/job-1/1' },
        ],
      }),
    });
    s3.send = send as any;
    const files = await listNumberedTextractFiles(s3, 'bucket', 'job-1');
    expect(files).toEqual([
      'textract-output/job-1/1',
      'textract-output/job-1/2',
    ]);
  });

  it('getExpectedPagesFromFirstFile returns page count from JSON', async () => {
    const send = mockS3SendImpl({
      GetObjectCommand: () => ({
        Body: {
          transformToString: async () =>
            JSON.stringify({ DocumentMetadata: { Pages: 5 } }),
        },
      }),
    });
    s3.send = send as any;
    const pages = await getExpectedPagesFromFirstFile(s3, 'bucket', ['file1']);
    expect(pages).toBe(5);
  });

  it('getExpectedPagesFromFirstFile returns 0 if no files', async () => {
    const send = mockS3SendImpl({});
    s3.send = send as any;
    const pages = await getExpectedPagesFromFirstFile(s3, 'bucket', []);
    expect(pages).toBe(0);
  });

  it('mergeTextractBlocks merges all Blocks arrays', async () => {
    const send = mockS3SendImpl({
      GetObjectCommand: vi
        .fn()
        .mockResolvedValueOnce({
          Body: {
            transformToString: async () => JSON.stringify({ Blocks: [1, 2] }),
          },
        })
        .mockResolvedValueOnce({
          Body: {
            transformToString: async () => JSON.stringify({ Blocks: [3] }),
          },
        }),
    });
    s3.send = send as any;
    const blocks = await mergeTextractBlocks(s3, 'bucket', ['file1', 'file2']);
    expect(blocks).toEqual([1, 2, 3]);
  });

  it('saveMergedBlocksToS3 puts merged blocks and returns key', async () => {
    const send = mockS3SendImpl({
      PutObjectCommand: vi.fn().mockResolvedValue({}),
    });
    s3.send = send as any;
    const key = await saveMergedBlocksToS3(s3, 'bucket', 'job-1', [1, 2, 3]);
    expect(key).toBe('merged-textract-output/job-1/merged.json');
  });
});
