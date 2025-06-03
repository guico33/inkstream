import { mockClient } from 'aws-sdk-client-mock';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  describe,
  beforeEach,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
} from 'vitest';
import * as jobTokenDbUtils from '../../../utils/textract-job-tokens-db-utils';
import * as userWorkflowsDbUtils from '../../../utils/user-workflows-db-utils';
import { ValidationError } from '../../../errors';

const textractMock = mockClient(TextractClient as any);
const ddbMock = mockClient(DynamoDBClient as any);

let handler: any;

describe('start-textract-job Lambda', () => {
  beforeAll(async () => {
    vi.stubEnv('TEXTRACT_JOB_TOKENS_TABLE', 'test-textract-job-tokens-table');
    vi.stubEnv('OUTPUT_S3_BUCKET_NAME', 'test-bucket');
    vi.stubEnv('USER_WORKFLOWS_TABLE', 'WorkflowTable');
    handler = (await import('./index.js')).handler;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    textractMock.reset();
    ddbMock.reset();
  });

  it('should start a Textract job and store JobId in DynamoDB', async () => {
    const jobId = 'test-job-id';
    const originalFileKey = 'users/user-1/uploads/file.pdf';
    const event = {
      originalFileKey,
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
      storageBucket: 'test-bucket',
      timestamp: Date.now(),
      doTranslate: false,
      doSpeech: false,
      targetLanguage: 'english',
    };
    (textractMock.on as any)(StartDocumentTextDetectionCommand).resolves({
      JobId: jobId,
    });
    const putJobTokenSpy = vi
      .spyOn(jobTokenDbUtils, 'putJobToken')
      .mockResolvedValue(undefined);
    const updateWorkflowStatusSpy = vi
      .spyOn(userWorkflowsDbUtils, 'updateWorkflowStatus')
      .mockResolvedValue(undefined);

    const result = await handler(event);

    expect(result).toEqual({
      message: 'Textract job started successfully',
      jobId,
    });
    expect(
      (textractMock.commandCalls as any)(StartDocumentTextDetectionCommand)
        .length
    ).toBe(1);
    expect(putJobTokenSpy).toHaveBeenCalledTimes(1);
    expect(putJobTokenSpy.mock.calls?.[0]?.[1]).toMatchObject({
      jobId,
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
      s3Input: {
        bucket: 'test-bucket',
        key: originalFileKey,
      },
    });
    expect(updateWorkflowStatusSpy).toHaveBeenCalledWith(
      'WorkflowTable',
      'user-1',
      'wf-1',
      'EXTRACTING_TEXT'
    );
  });

  it('should throw ValidationError if workflowId is missing', async () => {
    const event = {
      originalFileKey: 'users/user-1/uploads/file.pdf',
      taskToken: 'token',
      userId: 'user-1',
      storageBucket: 'test-bucket',
      timestamp: Date.now(),
    };
    await expect(handler(event)).rejects.toThrow(ValidationError);
    await expect(handler(event)).rejects.toThrow('workflowId is required');
  });

  it('should throw ValidationError if fileKey is missing', async () => {
    const event = {
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
      storageBucket: 'test-bucket',
      timestamp: Date.now(),
    };
    await expect(handler(event)).rejects.toThrow(ValidationError);
    await expect(handler(event)).rejects.toThrow('originalFileKey is required');
  });

  it('should throw ValidationError if taskToken is missing', async () => {
    const event = {
      originalFileKey: 'users/user-1/uploads/file.pdf',
      workflowId: 'wf-1',
      userId: 'user-1',
      storageBucket: 'test-bucket',
      timestamp: Date.now(),
    };
    await expect(handler(event)).rejects.toThrow(ValidationError);
    await expect(handler(event)).rejects.toThrow('taskToken is required');
  });

  it('should throw if Textract does not return a JobId', async () => {
    const event = {
      originalFileKey: 'users/user-1/uploads/file.pdf',
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
      storageBucket: 'test-bucket',
      timestamp: Date.now(),
    };
    (textractMock.on as any)(StartDocumentTextDetectionCommand).resolves({});

    await expect(handler(event)).rejects.toThrow(
      'Textract did not return a JobId'
    );
  });
});
