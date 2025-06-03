import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import * as s3Utils from '../../../utils/s3-utils';
import * as userWorkflowsDbUtils from '../../../utils/user-workflows-db-utils';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
  ProcessingError,
} from '../../../errors';

vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/user-workflows-db-utils');

// Mock the AI provider factory
const mockAIProvider = {
  formatText: vi.fn(),
  translateText: vi.fn(),
};

vi.mock('../../shared/ai-providers/ai-provider-factory', () => ({
  getAiProvider: vi.fn(() => Promise.resolve(mockAIProvider)),
  AIProviderFactory: {
    createFromEnvironment: vi.fn(() => mockAIProvider),
  },
}));

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

let handler: any;

describe('translate-text Lambda handler', () => {
  const mockedS3Utils = vi.mocked(s3Utils);
  const mockedUserWorkflowsDbUtils = vi.mocked(userWorkflowsDbUtils);

  beforeAll(async () => {
    vi.stubEnv('USER_WORKFLOWS_TABLE', 'WorkflowTable');
    handler = (await import('./index.js')).handler;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset AI provider mocks
    mockAIProvider.formatText.mockReset();
    mockAIProvider.translateText.mockReset();
  });

  it('returns success when translation and saving succeeds', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockAIProvider.translateText.mockResolvedValue('bonjour le monde');
    mockedS3Utils.generateUserS3Key.mockReturnValue('user/translated/file.txt');
    mockedS3Utils.saveTextToS3.mockResolvedValue({
      bucket: 'bucket',
      key: 'user/translated/file.txt',
    });
    mockedUserWorkflowsDbUtils.updateWorkflowStatus.mockResolvedValue(
      undefined
    );

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doSpeech: true,
      timestamp: Date.now(),
    };
    const result = await callHandler(event);
    expect(result.message).toBe('Text translation successful');
    expect(result.translatedTextFileKey).toBe('user/translated/file.txt');

    // Should call updateWorkflowStatus with 'TRANSLATION_COMPLETE' since doSpeech=true (more steps to come)
    expect(
      mockedUserWorkflowsDbUtils.updateWorkflowStatus
    ).toHaveBeenCalledWith(
      'WorkflowTable',
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

  it('sets TRANSLATION_COMPLETE status when workflow ends at translation stage', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockAIProvider.translateText.mockResolvedValue('bonjour le monde');
    mockedS3Utils.generateUserS3Key.mockReturnValue('user/translated/file.txt');
    mockedS3Utils.saveTextToS3.mockResolvedValue({
      bucket: 'bucket',
      key: 'user/translated/file.txt',
    });
    mockedUserWorkflowsDbUtils.updateWorkflowStatus.mockResolvedValue(
      undefined
    );

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doSpeech: false,
      timestamp: Date.now(),
    };
    const result = await callHandler(event);
    expect(result.message).toBe('Text translation successful');
    expect(result.translatedTextFileKey).toBe('user/translated/file.txt');

    // Should call updateWorkflowStatus with 'SUCCEEDED' since doSpeech=false (workflow complete)
    expect(
      mockedUserWorkflowsDbUtils.updateWorkflowStatus
    ).toHaveBeenCalledWith(
      'WorkflowTable',
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

  it('throws S3Error if getTextFromS3 fails', async () => {
    mockedS3Utils.getTextFromS3.mockRejectedValue(new Error('fail s3'));
    mockedUserWorkflowsDbUtils.updateWorkflowStatus.mockResolvedValue(
      undefined
    );

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
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
    mockedUserWorkflowsDbUtils.updateWorkflowStatus.mockResolvedValue(
      undefined
    );

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
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
      workflowTableName: 'WorkflowTable',
      doSpeech: false,
      timestamp: Date.now(),
      // Missing storageBucket to test error
    };

    await expect(callHandler(event)).rejects.toThrow(ValidationError);
    await expect(callHandler(event)).rejects.toThrow(
      'storageBucket is required'
    );
  });

  it('throws ExternalServiceError if AI provider translation fails', async () => {
    mockedS3Utils.getTextFromS3.mockResolvedValue('hello world');
    mockAIProvider.translateText.mockRejectedValue(new Error('fail translate'));
    mockedUserWorkflowsDbUtils.updateWorkflowStatus.mockResolvedValue(
      undefined
    );

    const event = {
      formattedTextFileKey: 'formatted.txt',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      targetLanguage: 'French',
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      timestamp: Date.now(),
    };

    await expect(callHandler(event)).rejects.toThrow(ExternalServiceError);
    await expect(callHandler(event)).rejects.toThrow(
      'Error processing text translation'
    );
  });
});
