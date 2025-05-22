import { handler } from './index';
import { mockClient } from 'aws-sdk-client-mock';
import {
  TextractClient,
  StartDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import * as jobTokenUtils from '../../../utils/textract-job-tokens';

const textractMock = mockClient(TextractClient as any);
const ddbMock = mockClient(DynamoDBClient as any);

// Helper to DRY up handler invocation
async function callHandler(event: any) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('start-textract-job Lambda', () => {
  beforeEach(() => {
    textractMock.reset();
    ddbMock.reset();
  });

  it('should start a Textract job and store JobId in DynamoDB', async () => {
    // Arrange
    const jobId = 'test-job-id';
    const s3Path = { bucket: 'bucket', key: 'file.pdf' };
    const event = {
      s3Path,
      fileType: 'pdf',
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
    };
    (textractMock.on as any)(StartDocumentTextDetectionCommand).resolves({
      JobId: jobId,
    });
    const putJobTokenSpy = vi
      .spyOn(jobTokenUtils, 'putJobToken')
      .mockResolvedValue(undefined);

    // Act
    const result = await callHandler(event);

    // Assert
    expect(result).toEqual({ jobId });
    expect(
      (textractMock.commandCalls as any)(StartDocumentTextDetectionCommand)
        .length
    ).toBe(1);
    expect(putJobTokenSpy).toHaveBeenCalledTimes(1);
    expect(putJobTokenSpy.mock.calls?.[0]?.[1]).toMatchObject({
      JobId: jobId,
      TaskToken: 'token',
      FileType: 'pdf',
      WorkflowId: 'wf-1',
      UserId: 'user-1',
      S3Input: s3Path,
    });
  });

  it('should throw if s3Path is missing', async () => {
    const event = {
      fileType: 'pdf',
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
    };
    await expect(callHandler(event)).rejects.toThrow(
      'Missing s3Path (bucket/key) in event'
    );
  });

  it('should throw if taskToken is missing', async () => {
    const event = {
      s3Path: { bucket: 'bucket', key: 'file.pdf' },
      fileType: 'pdf',
      workflowId: 'wf-1',
      userId: 'user-1',
    };
    await expect(callHandler(event)).rejects.toThrow(
      'Missing taskToken in event'
    );
  });

  it('should throw if Textract does not return a JobId', async () => {
    const event = {
      s3Path: { bucket: 'bucket', key: 'file.pdf' },
      fileType: 'pdf',
      taskToken: 'token',
      workflowId: 'wf-1',
      userId: 'user-1',
    };
    (textractMock.on as any)(StartDocumentTextDetectionCommand).resolves({});
    await expect(callHandler(event)).rejects.toThrow(
      'Textract did not return a JobId'
    );
  });

  // Add more tests for DynamoDB failure, etc. as needed
});
