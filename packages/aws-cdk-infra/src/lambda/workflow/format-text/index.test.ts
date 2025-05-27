import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import * as utils from './utils';
import * as s3Utils from '../../../utils/s3-utils';
import * as workflowStateUtils from '../../../utils/workflow-state';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
  ProcessingError,
} from '../../../errors';

// Mock Bedrock and S3 utilities
vi.mock('./utils');
vi.mock('../../../utils/s3-utils');
vi.mock('../../../utils/workflow-state');

const mockedUtils = vi.mocked(utils);
const mockedS3Utils = vi.mocked(s3Utils);
const mockedWorkflowStateUtils = vi.mocked(workflowStateUtils);

async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

let handler: any;

describe('format-text Lambda handler', () => {
  beforeAll(async () => {
    vi.stubEnv('USER_WORKFLOWS_TABLE', 'WorkflowTable');
    handler = (await import('./index.js')).handler;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock workflow state functions to avoid DynamoDB errors
    mockedWorkflowStateUtils.updateWorkflowStatus.mockResolvedValue(undefined);
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
      textractMergedFileKey: 'input.json',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      timestamp: Date.now(),
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doTranslate: true,
      doSpeech: true,
    };
    const result = await callHandler(event);
    expect(result.formattedTextFileKey).toBe('user/formatted/file.txt');

    // Should call updateWorkflowStatus with 'TEXT_FORMATTING_COMPLETE' since doTranslate=true OR doSpeech=true (more steps to come)
    expect(mockedWorkflowStateUtils.updateWorkflowStatus).toHaveBeenCalledWith(
      'WorkflowTable',
      'user',
      'workflow-123',
      'TEXT_FORMATTING_COMPLETE',
      expect.objectContaining({
        s3Paths: expect.objectContaining({
          originalFile: 'file.txt',
          formattedText: 'user/formatted/file.txt',
        }),
      })
    );
  });

  it('sets TEXT_FORMATTING_COMPLETE status when workflow ends at formatting stage', async () => {
    mockedUtils.extractTextFromTextractS3.mockResolvedValue('hello world');
    mockedUtils.formatTextWithClaude.mockResolvedValue('formatted text');
    mockedS3Utils.generateUserS3Key.mockReturnValue('user/formatted/file.txt');
    mockedS3Utils.saveTextToS3.mockResolvedValue({
      bucket: 'bucket',
      key: 'user/formatted/file.txt',
    });

    const event = {
      textractMergedFileKey: 'input.json',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      timestamp: Date.now(),
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doTranslate: false,
      doSpeech: false,
    };
    const result = await callHandler(event);
    expect(result.formattedTextFileKey).toBe('user/formatted/file.txt');

    // Should call updateWorkflowStatus with 'SUCCEEDED' since doTranslate=false AND doSpeech=false (workflow is complete)
    expect(mockedWorkflowStateUtils.updateWorkflowStatus).toHaveBeenCalledWith(
      'WorkflowTable',
      'user',
      'workflow-123',
      'SUCCEEDED',
      expect.objectContaining({
        s3Paths: expect.objectContaining({
          originalFile: 'file.txt',
          formattedText: 'user/formatted/file.txt',
        }),
      })
    );
  });

  it('throws S3Error if getTextFromS3 fails', async () => {
    mockedUtils.extractTextFromTextractS3.mockRejectedValue(
      new Error('fail extract')
    );
    const event = {
      textractMergedFileKey: 'input.json',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      timestamp: Date.now(),
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doTranslate: false,
      doSpeech: false,
    };

    await expect(callHandler(event)).rejects.toThrow(S3Error);
    await expect(callHandler(event)).rejects.toThrow(
      'Failed to extract text from Textract output'
    );
  });

  it('throws ProcessingError if no text to format', async () => {
    // @ts-expect-error: purposely testing undefined return for error path
    mockedUtils.extractTextFromTextractS3.mockResolvedValue(undefined);
    const event = {
      textractMergedFileKey: 'input.json',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      timestamp: Date.now(),
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doTranslate: false,
      doSpeech: false,
    };

    await expect(callHandler(event)).rejects.toThrow(ProcessingError);
    await expect(callHandler(event)).rejects.toThrow(
      'No extracted text to format'
    );
  });

  it('throws ValidationError if storageBucket is missing', async () => {
    mockedUtils.extractTextFromTextractS3.mockResolvedValue('some text');
    const event = {
      textractMergedFileKey: 'input.json',
      originalFileKey: 'file.txt',
      userId: 'user',
      timestamp: Date.now(),
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doTranslate: false,
      doSpeech: false,
      // Missing storageBucket to test error
    };

    await expect(callHandler(event)).rejects.toThrow(ValidationError);
    await expect(callHandler(event)).rejects.toThrow(
      'storageBucket is required'
    );
  });

  it('throws ExternalServiceError if formatTextWithClaude throws', async () => {
    mockedUtils.extractTextFromTextractS3.mockResolvedValue('some text');
    mockedUtils.formatTextWithClaude.mockRejectedValue(
      new Error('fail format')
    );
    const event = {
      textractMergedFileKey: 'input.json',
      storageBucket: 'bucket',
      originalFileKey: 'file.txt',
      userId: 'user',
      timestamp: Date.now(),
      workflowId: 'workflow-123',
      workflowTableName: 'WorkflowTable',
      doTranslate: false,
      doSpeech: false,
    };

    await expect(callHandler(event)).rejects.toThrow(ExternalServiceError);
    await expect(callHandler(event)).rejects.toThrow(
      'Error processing text formatting'
    );
  });
});
