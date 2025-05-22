import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from '@aws-sdk/client-sfn';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

// NOTE: aws-sdk-client-mock and AWS SDK v3 modular packages can have type incompatibilities due to multiple @smithy/types versions.
// Workaround: Only mock the client classes actually instantiated in the Lambda, and use 'as any' to suppress type errors.
// See: https://github.com/m-radzikowski/aws-sdk-client-mock/issues/191

// Remove ddbMock (DynamoDBClient) as only DynamoDBDocumentClient is used
// const ddbMock = mockClient(DynamoDBClient);
const ddbDocMock = mockClient(DynamoDBDocumentClient as any);
const sfnMock = mockClient(SFNClient as any);
const s3Mock = mockClient(S3Client as any);

const bucket = 'test-bucket';
const jobId = 'job-123';
const s3Path = `textract-output/${jobId}/1`;

function makeS3Event(key: string) {
  return {
    Records: [
      {
        s3: {
          bucket: { name: bucket },
          object: { key },
        },
      },
    ],
  };
}

// Minimal mock Context for Lambda handler
const mockContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'test',
  getRemainingTimeInMillis: () => 1000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
} as any;

let handler: any;
beforeAll(async () => {
  vi.stubEnv('AWS_ACCOUNT_ID', 'test');
  // Dynamically import the handler after env var is set
  handler = (await import('./index.js')).handler;
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('process-textract-s3-event Lambda', () => {
  beforeEach(() => {
    ddbDocMock.reset();
    sfnMock.reset();
    s3Mock.reset();
  });

  it('ignores .s3_access_check files', async () => {
    const event = makeS3Event('textract-output/job-123/.s3_access_check');
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
  });

  it('ignores non-numbered files', async () => {
    const event = makeS3Event('textract-output/job-123/foo.txt');
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
  });

  it('warns and skips if JobId cannot be extracted', async () => {
    const event = makeS3Event('bad-prefix/1');
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
  });

  it('warns and skips if no TaskToken in DynamoDB', async () => {
    ddbDocMock.on(GetCommand as any).resolves({ Item: undefined } as any);
    const event = makeS3Event(s3Path);
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
  });

  it('returns done if not last part', async () => {
    ddbDocMock.on(GetCommand as any).resolves({
      Item: {
        TaskToken: 'token',
        FileType: 'pdf',
        WorkflowId: 'wf',
        UserId: 'user',
      },
    } as any);
    s3Mock
      .on(ListObjectsV2Command as any)
      .resolves({ Contents: [{ Key: s3Path }] } as any);
    s3Mock.on(GetObjectCommand as any).resolves({
      Body: {
        transformToString: async () =>
          JSON.stringify({ DocumentMetadata: { Pages: 2 } }),
      },
    } as any);
    const event = makeS3Event(s3Path);
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
  });

  it('aggregates, merges, uploads, and sends task success for last part', async () => {
    ddbDocMock.on(GetCommand as any).resolves({
      Item: {
        TaskToken: 'token',
        FileType: 'pdf',
        WorkflowId: 'wf',
        UserId: 'user',
      },
    } as any);
    s3Mock
      .on(ListObjectsV2Command as any)
      .resolves({ Contents: [{ Key: s3Path }] } as any);
    s3Mock.on(GetObjectCommand as any).resolves({
      Body: {
        transformToString: async () =>
          JSON.stringify({
            DocumentMetadata: { Pages: 1 },
            Blocks: [{ BlockType: 'LINE' }],
          }),
      },
    } as any);
    s3Mock.on(PutObjectCommand as any).resolves({} as any);
    sfnMock.on(SendTaskSuccessCommand as any).resolves({} as any);
    ddbDocMock.on(DeleteCommand as any).resolves({} as any);
    const event = makeS3Event(s3Path);
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
    expect(s3Mock.commandCalls(PutObjectCommand as any).length).toBe(1);
    expect(sfnMock.commandCalls(SendTaskSuccessCommand as any).length).toBe(1);
    expect(ddbDocMock.commandCalls(DeleteCommand as any).length).toBe(1);
  });

  it('sends task failure if SendTaskSuccessCommand fails', async () => {
    ddbDocMock.on(GetCommand as any).resolves({
      Item: {
        TaskToken: 'token',
        FileType: 'pdf',
        WorkflowId: 'wf',
        UserId: 'user',
      },
    } as any);
    s3Mock
      .on(ListObjectsV2Command as any)
      .resolves({ Contents: [{ Key: s3Path }] } as any);
    s3Mock.on(GetObjectCommand as any).resolves({
      Body: {
        transformToString: async () =>
          JSON.stringify({
            DocumentMetadata: { Pages: 1 },
            Blocks: [{ BlockType: 'LINE' }],
          }),
      },
    } as any);
    s3Mock.on(PutObjectCommand as any).resolves({} as any);
    sfnMock
      .on(SendTaskSuccessCommand as any)
      .rejects(new Error('fail success'));
    sfnMock.on(SendTaskFailureCommand as any).resolves({} as any);
    ddbDocMock.on(DeleteCommand as any).resolves({} as any);
    const event = makeS3Event(s3Path);
    const result = await handler(event as any, mockContext, () => {});
    expect(result).toEqual({ status: 'done' });
    expect(sfnMock.commandCalls(SendTaskFailureCommand as any).length).toBe(1);
  });
});
