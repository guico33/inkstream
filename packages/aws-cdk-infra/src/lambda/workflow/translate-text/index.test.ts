import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index';
import * as utils from './utils';
import * as s3Utils from '../../../utils/s3-utils';
import * as responseUtils from '../../../utils/response-utils';

vi.mock('./utils');
vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/response-utils');

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('translate-text Lambda handler', () => {
  const mockedUtils = vi.mocked(utils);
  const mockedS3Utils = vi.mocked(s3Utils);
  const mockedResponseUtils = vi.mocked(responseUtils);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when translation and saving succeeds', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedUtils.translateTextWithClaude.mockResolvedValue('bonjour le monde');
    mockedS3Utils.generateUserS3Key.mockReturnValue('user/translated/file.txt');
    mockedS3Utils.saveTextToS3.mockResolvedValue({
      bucket: 'bucket',
      key: 'user/translated/file.txt',
    });
    mockedResponseUtils.createS3Response.mockImplementation(
      (s3Path, msg, data) => ({
        statusCode: 200,
        body: JSON.stringify({ message: msg, s3Path, ...data }),
        s3Path,
        ...data,
      })
    );

    const event = {
      formattedTextS3Path: { bucket: 'bucket', key: 'formatted.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(200);
    expect(result.s3Path).toEqual({
      bucket: 'bucket',
      key: 'user/translated/file.txt',
    });
    expect(JSON.parse(result.body).translatedTextLength).toBe(
      'bonjour le monde'.length
    );
    expect(result.translatedTextS3Path).toEqual({
      bucket: 'bucket',
      key: 'user/translated/file.txt',
    });
  });

  it('returns error if getTextFromS3 throws', async () => {
    mockedS3Utils.getTextFromS3.mockRejectedValue(new Error('fail s3'));
    mockedResponseUtils.createS3ErrorResponse.mockImplementation(
      (code, msg, err) => ({
        statusCode: code,
        body: JSON.stringify({
          message: msg,
          error: (err && (err as Error).message) || String(err),
        }),
        s3Path: null,
      })
    );
    const event = {
      formattedTextS3Path: { bucket: 'bucket', key: 'formatted.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Error fetching formatted text/
    );
    expect(result.translationError).toMatch(/Failed to fetch text from S3/);
  });

  it('returns error if no text to translate', async () => {
    // @ts-expect-error: purposely testing undefined return for error path
    mockedS3Utils.getTextFromS3.mockResolvedValue(undefined);
    mockedResponseUtils.createS3ErrorResponse.mockImplementation(
      (code, msg, err) => ({
        statusCode: code,
        body: JSON.stringify({
          message: msg,
          error: (err && (err as Error).message) || String(err),
        }),
        s3Path: null,
      })
    );
    const event = {
      formattedTextS3Path: { bucket: 'bucket', key: 'formatted.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(
      /No text content to translate/
    );
    expect(result.translationError).toMatch(/No text content provided/);
  });

  it('returns error if outputBucket is missing', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedResponseUtils.createS3ErrorResponse.mockImplementation(
      (code, msg, err) => ({
        statusCode: code,
        body: JSON.stringify({
          message: msg,
          error: (err && (err as Error).message) || String(err),
        }),
        s3Path: null,
      })
    );
    const event = {
      formattedTextS3Path: { bucket: 'bucket', key: 'formatted.json' },
      fileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Output bucket not configured/
    );
    expect(result.translationError).toMatch(/Output bucket not configured/);
  });

  it('returns error if translateTextWithClaude throws', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedUtils.translateTextWithClaude.mockRejectedValue(
      new Error('fail translate')
    );
    mockedResponseUtils.createS3ErrorResponse.mockImplementation(
      (code, msg, err) => ({
        statusCode: code,
        body: JSON.stringify({
          message: msg,
          error: (err && (err as Error).message) || String(err),
        }),
        s3Path: null,
      })
    );
    const event = {
      formattedTextS3Path: { bucket: 'bucket', key: 'formatted.json' },
      outputBucket: 'bucket',
      fileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
    };
    const result = await callHandler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Error processing text translation/
    );
    expect(result.translationError).toMatch(/fail translate/);
  });
});
