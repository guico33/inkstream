// Tests for DynamoDB Toolbox utilities for the Textract Job Tokens table
import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  TextractJobToken,
  putJobToken,
  getJobToken,
} from '../textract-job-tokens';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const ddbDocMock = mockClient(DynamoDBDocumentClient as any);

describe('textract-job-tokens utils', () => {
  const tableName = 'test-table';
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const jobToken: TextractJobToken = {
    JobId: 'job-1',
    TaskToken: 'token-1',
    FileType: 'pdf',
    WorkflowId: 'wf-1',
    UserId: 'user-1',
    S3Input: { bucket: 'bucket', key: 'file.pdf' },
    ExpirationTime: '1234567890',
  };

  beforeEach(() => {
    ddbDocMock.reset();
  });

  it('putJobToken issues a PutCommand with correct item', async () => {
    ddbDocMock.on(PutCommand as any).resolves({});
    await expect(
      putJobToken(tableName, jobToken, documentClient)
    ).resolves.toBeUndefined();
    const call = ddbDocMock.commandCalls(PutCommand as any)[0];
    expect(call?.args?.[0]?.input?.Item).toMatchObject(jobToken);
    expect(call?.args?.[0]?.input?.TableName).toBe(tableName);
  });

  it('getJobToken issues a GetCommand and returns the item', async () => {
    // Add required internal attributes for DynamoDB-Toolbox formatting
    ddbDocMock.on(GetCommand as any).resolves({
      // @ts-ignore: allow Item property for test mock
      Item: {
        ...jobToken,
        _et: 'JOBTOKEN',
        _ct: '2024-01-01T00:00:00.000Z', // required by dynamodb-toolbox
        _md: '2024-01-01T00:00:00.000Z', // required by dynamodb-toolbox
      },
    });
    const result = await getJobToken(tableName, jobToken.JobId, documentClient);
    // The returned item will include _et, but our function returns as TextractJobToken (without _et)
    // So we can check that the main fields match
    expect(result).toMatchObject(jobToken);
    const call = ddbDocMock.commandCalls(GetCommand as any)[0];
    expect(call?.args?.[0]?.input?.Key).toEqual({ JobId: jobToken.JobId });
    expect(call?.args?.[0]?.input?.TableName).toBe(tableName);
  });

  it('getJobToken returns undefined if no item found', async () => {
    // @ts-ignore: allow Item property for test mock
    ddbDocMock.on(GetCommand as any).resolves({ Item: undefined });
    const result = await getJobToken(tableName, jobToken.JobId, documentClient);
    expect(result).toBeUndefined();
  });
});
