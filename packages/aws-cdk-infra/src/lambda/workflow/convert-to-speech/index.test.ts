import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index';
import * as s3Utils from '../../../utils/s3-utils';
import * as responseUtils from '../../../utils/response-utils';
import * as errorUtils from '../../../utils/error-utils';
import * as utils from './utils';
import { PollyClient } from '@aws-sdk/client-polly';

vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/response-utils');
vi.mock('../../../utils/error-utils');
vi.mock('./utils');

const mockedS3Utils = vi.mocked(s3Utils);
const mockedResponseUtils = vi.mocked(responseUtils);
const mockedErrorUtils = vi.mocked(errorUtils);
const mockedUtils = vi.mocked(utils);

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('convert-to-speech Lambda handler', () => {
  const baseEvent = {
    fileKey: 'file.txt',
    formattedTextS3Path: { bucket: 'bucket', key: 'formatted.txt' },
    translatedTextS3Path: { bucket: 'bucket', key: 'translated.txt' },
    outputBucket: 'bucket',
    userId: 'user',
    targetLanguage: 'french',
  };
  const mockAudioS3 = { bucket: 'bucket', key: 'user/speech/file.mp3' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedUtils.textToSpeech.mockResolvedValue(mockAudioS3);
    mockedResponseUtils.createS3Response.mockImplementation(
      (s3Path, msg, data) => ({
        statusCode: 200,
        body: JSON.stringify({ message: msg, s3Path, ...data }),
        s3Path,
        ...data,
      })
    );
    mockedResponseUtils.createS3ErrorResponse.mockImplementation(
      (code, msg, err) => ({
        statusCode: code,
        body: JSON.stringify({
          message: msg,
          error:
            err && typeof err === 'object' && 'message' in err
              ? (err as any).message
              : String(err),
        }),
        s3Path: null,
      })
    );
    mockedErrorUtils.getErrorMessage.mockImplementation(
      (e: any) => e?.message || String(e)
    );
  });

  it('returns success when speech synthesis and saving succeeds', async () => {
    const result = await callHandler(baseEvent as any);
    expect(mockedS3Utils.getTextFromS3).toHaveBeenCalled();
    expect(mockedUtils.textToSpeech).toHaveBeenCalledWith(
      expect.any(PollyClient),
      'hello world',
      'french',
      'file.txt',
      'bucket',
      'user'
    );
    expect(result.statusCode).toBe(200);
    expect(result.s3Path).toEqual(mockAudioS3);
    expect(result.speechS3Path).toEqual(mockAudioS3);
  });

  it('returns error if getTextFromS3 throws', async () => {
    mockedS3Utils.getTextFromS3.mockRejectedValue(new Error('fail s3'));
    const result = await callHandler(baseEvent as any);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Error fetching translated text|Error fetching formatted text/
    );
    expect(result.speechError).toMatch(/Failed to fetch/);
  });

  it('returns error if no text to synthesize', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue(''); // Use empty string to simulate no text
    const result = await callHandler(baseEvent as any);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(
      /No text content for speech synthesis/
    );
    expect(result.speechError).toMatch(/No text content provided/);
  });

  it('returns error if outputBucket is missing', async () => {
    const badEvent = { ...baseEvent, outputBucket: undefined };
    const result = await callHandler(badEvent as any);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Output bucket not configured/
    );
    expect(result.speechError).toMatch(/Output bucket not configured/);
  });

  it('returns error if textToSpeech throws', async () => {
    mockedUtils.textToSpeech.mockRejectedValue(new Error('fail tts'));
    const result = await callHandler(baseEvent as any);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /Error processing speech synthesis/
    );
    expect(result.speechError).toMatch(/fail tts/);
  });
});
