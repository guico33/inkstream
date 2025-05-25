import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index';
import * as s3Utils from '../../../utils/s3-utils';
import * as errorUtils from '../../../utils/error-utils';
import * as workflowState from '../../../utils/workflow-state';
import * as utils from './utils';
import { PollyClient } from '@aws-sdk/client-polly';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
} from '../../../errors';

vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/error-utils');
vi.mock('../../../utils/workflow-state');
vi.mock('./utils');

const mockedS3Utils = vi.mocked(s3Utils);
const mockedErrorUtils = vi.mocked(errorUtils);
const mockedWorkflowState = vi.mocked(workflowState);
const mockedUtils = vi.mocked(utils);

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('convert-to-speech Lambda handler', () => {
  const baseEvent = {
    storageBucket: 'test-bucket',
    originalFileKey: 'document.pdf',
    userId: 'user123',
    targetLanguage: 'french',
    workflowId: 'workflow-123',
    workflowTableName: 'workflows-table',
    translatedTextFileKey: 'user123/translated/document.txt',
    formattedTextFileKey: 'user123/formatted/document.txt',
  };
  const mockAudioS3 = {
    bucket: 'test-bucket',
    key: 'user123/speech/document.mp3',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedUtils.textToSpeech.mockResolvedValue(mockAudioS3);
    mockedWorkflowState.updateWorkflowStatus.mockResolvedValue(undefined);
    mockedErrorUtils.getErrorMessage.mockImplementation(
      (e: any) => e?.message || String(e)
    );
  });

  it('returns success when speech synthesis and saving succeeds', async () => {
    const result = await callHandler(baseEvent as any);
    expect(mockedS3Utils.getTextFromS3).toHaveBeenCalledWith(
      'test-bucket',
      'user123/translated/document.txt'
    );
    expect(mockedUtils.textToSpeech).toHaveBeenCalledWith(
      expect.any(PollyClient),
      'hello world',
      'french',
      'document.pdf',
      'test-bucket',
      'user123'
    );
    expect(result.message).toBe('Speech synthesis completed successfully');
    expect(result.speechFileKey).toBe(mockAudioS3.key);
  });

  it('throws S3Error if getTextFromS3 throws', async () => {
    mockedS3Utils.getTextFromS3.mockRejectedValue(
      new Error('S3 connection failed')
    );

    await expect(callHandler(baseEvent as any)).rejects.toThrow(S3Error);
    await expect(callHandler(baseEvent as any)).rejects.toThrow(
      'Failed to fetch translated text: S3 connection failed'
    );
  });

  it('throws ValidationError if no text content is available', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('');

    await expect(callHandler(baseEvent as any)).rejects.toThrow(
      ValidationError
    );
    await expect(callHandler(baseEvent as any)).rejects.toThrow(
      'No text content provided for speech synthesis'
    );
  });

  it('throws ValidationError if both text file keys are missing', async () => {
    const badEvent = {
      ...baseEvent,
      translatedTextFileKey: undefined,
      formattedTextFileKey: undefined,
    };

    await expect(callHandler(badEvent as any)).rejects.toThrow(ValidationError);
    await expect(callHandler(badEvent as any)).rejects.toThrow(
      'Either translatedTextFileKey or formattedTextFileKey must be provided'
    );
  });

  it('throws ExternalServiceError if textToSpeech throws', async () => {
    mockedUtils.textToSpeech.mockRejectedValue(
      new Error('Polly service error')
    );

    await expect(callHandler(baseEvent as any)).rejects.toThrow(
      ExternalServiceError
    );
    await expect(callHandler(baseEvent as any)).rejects.toThrow(
      'Error processing speech synthesis: Polly service error'
    );
  });
});
