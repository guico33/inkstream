import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index';
import * as utils from './utils';
import * as s3Utils from '../../../utils/s3-utils';

// Mock Bedrock and S3 utilities
vi.mock('./utils');
vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/response-utils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, any>),
    createS3Response: vi.fn((s3Path, msg, data) => ({
      statusCode: 200,
      body: JSON.stringify({ message: msg, s3Path, ...data }),
      s3Path,
      ...data,
    })),
    createS3ErrorResponse: vi.fn((code, msg, err) => ({
      statusCode: code,
      body: JSON.stringify({
        message: msg,
        error: err?.message || String(err),
      }),
      s3Path: null,
    })),
  };
});

const mockedUtils = vi.mocked(utils);
const mockedS3Utils = vi.mocked(s3Utils);

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('format-text Lambda handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when formatting and saving succeeds', async () => {
    mockedUtils.extractTextFromTextractS3.mockResolvedValue('hello world');
    mockedUtils.formatTextWithClaude.mockResolvedValue('formatted text');
    mockedS3Utils.generateUserS3Key.mockReturnValue('user/formatted/file.txt');
    mockedS3Utils.saveTextToS3.mockResolvedValue({
      bucket: 'bucket',
      key: 'user/formatted/file.txt',
    });

    const event = {
      textractOutputS3Path: { bucket: 'bucket', key: 'input.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(200);
    expect(result.s3Path).toEqual({
      bucket: 'bucket',
      key: 'user/formatted/file.txt',
    });
    expect(JSON.parse(result.body).formattedTextLength).toBe(
      'formatted text'.length
    );
  });

  it('returns error if getTextFromS3 throws', async () => {
    mockedUtils.extractTextFromTextractS3.mockRejectedValue(
      new Error('fail extract')
    );
    const event = {
      textractOutputS3Path: { bucket: 'bucket', key: 'input.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(/Failed to extract text/);
    expect(JSON.parse(result.body).error).toMatch(/fail extract/);
  });

  it('returns error if no text to format', async () => {
    // @ts-expect-error: purposely testing undefined return for error path
    mockedUtils.extractTextFromTextractS3.mockResolvedValue(undefined);
    const event = {
      textractOutputS3Path: { bucket: 'bucket', key: 'input.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/No extracted text/);
  });

  it('returns error if outputBucket is missing', async () => {
    mockedUtils.extractTextFromTextractS3.mockResolvedValue('some text');
    const event = {
      textractOutputS3Path: { bucket: 'bucket', key: 'input.json' },
      fileKey: 'file.txt',
      userId: 'user',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Output bucket not configured/
    );
  });

  it('returns error if formatTextWithClaude throws', async () => {
    mockedUtils.extractTextFromTextractS3.mockResolvedValue('some text');
    mockedUtils.formatTextWithClaude.mockRejectedValue(
      new Error('fail format')
    );
    const event = {
      textractOutputS3Path: { bucket: 'bucket', key: 'input.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Error processing text formatting/
    );
    expect(JSON.parse(result.body).error).toMatch(/fail format/);
  });
});
