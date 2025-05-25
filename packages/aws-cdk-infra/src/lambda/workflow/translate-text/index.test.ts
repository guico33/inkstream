import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index';
import * as utils from './utils';
import * as s3Utils from '../../../utils/s3-utils';
import * as workflowState from '../../../utils/workflow-state';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
  ProcessingError,
} from '../../../errors';

vi.mock('./utils');
vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/workflow-state');

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('translate-text Lambda handler', () => {
  const mockedUtils = vi.mocked(utils);
  const mockedS3Utils = vi.mocked(s3Utils);
  const mockedWorkflowState = vi.mocked(workflowState);

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
    mockedWorkflowState.updateWorkflowStatus.mockResolvedValue(undefined);

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'workflows-table',
      doSpeech: true,
      timestamp: Date.now(),
    };
    const result = await callHandler(event);
    expect(result.message).toBe('Text translation successful');
    expect(result.translatedTextFileKey).toBe('user/translated/file.txt');

    // Should call updateWorkflowStatus with 'SUCCEEDED' since doSpeech=true
    expect(mockedWorkflowState.updateWorkflowStatus).toHaveBeenCalledWith(
      'workflows-table',
      'user',
      'workflow-123',
      'SUCCEEDED',
      expect.objectContaining({
        s3Paths: expect.objectContaining({
          originalFile: 'file.txt',
          translatedText: 'user/translated/file.txt',
        }),
      })
    );
  });

  it('sets TRANSLATION_COMPLETE status when workflow ends at translation stage', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedUtils.translateTextWithClaude.mockResolvedValue('bonjour le monde');
    mockedS3Utils.generateUserS3Key.mockReturnValue('user/translated/file.txt');
    mockedS3Utils.saveTextToS3.mockResolvedValue({
      bucket: 'bucket',
      key: 'user/translated/file.txt',
    });
    mockedWorkflowState.updateWorkflowStatus.mockResolvedValue(undefined);

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'workflows-table',
      doSpeech: false,
      timestamp: Date.now(),
    };
    const result = await callHandler(event);
    expect(result.message).toBe('Text translation successful');
    expect(result.translatedTextFileKey).toBe('user/translated/file.txt');

    // Should call updateWorkflowStatus with 'TRANSLATION_COMPLETE' since doSpeech=false
    expect(mockedWorkflowState.updateWorkflowStatus).toHaveBeenCalledWith(
      'workflows-table',
      'user',
      'workflow-123',
      'TRANSLATION_COMPLETE',
      expect.objectContaining({
        s3Paths: expect.objectContaining({
          originalFile: 'file.txt',
          translatedText: 'user/translated/file.txt',
        }),
      })
    );
  });

  it('throws S3Error if getTextFromS3 fails', async () => {
    mockedS3Utils.getTextFromS3.mockRejectedValue(new Error('fail s3'));
    mockedWorkflowState.updateWorkflowStatus.mockResolvedValue(undefined);

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'workflows-table',
      doSpeech: false,
      timestamp: Date.now(),
    };

    await expect(callHandler(event)).rejects.toThrow(S3Error);
    await expect(callHandler(event)).rejects.toThrow(
      'Error fetching formatted text from S3'
    );
  });

  it('throws ProcessingError if no text to translate', async () => {
    // @ts-expect-error: purposely testing undefined return for error path
    mockedS3Utils.getTextFromS3.mockResolvedValue(undefined);
    mockedWorkflowState.updateWorkflowStatus.mockResolvedValue(undefined);

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'workflows-table',
      doSpeech: false,
      timestamp: Date.now(),
    };

    await expect(callHandler(event)).rejects.toThrow(ProcessingError);
    await expect(callHandler(event)).rejects.toThrow(
      'No text content to translate'
    );
  });

  it('throws ValidationError if storageBucket is missing', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');

    const event = {
      formattedTextFileKey: 'formatted.txt',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'workflows-table',
      doSpeech: false,
      timestamp: Date.now(),
      // Missing storageBucket to test error
    };

    await expect(callHandler(event)).rejects.toThrow(ValidationError);
    await expect(callHandler(event)).rejects.toThrow(
      'storageBucket is required'
    );
  });

  it('throws ExternalServiceError if translateTextWithClaude fails', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockedUtils.translateTextWithClaude.mockRejectedValue(
      new Error('fail translate')
    );
    mockedWorkflowState.updateWorkflowStatus.mockResolvedValue(undefined);

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'workflows-table',
      timestamp: Date.now(),
    };

    await expect(callHandler(event)).rejects.toThrow(ExternalServiceError);
    await expect(callHandler(event)).rejects.toThrow(
      'Error processing text translation'
    );
  });
});
