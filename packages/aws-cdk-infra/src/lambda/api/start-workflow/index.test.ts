import { SFNClient } from '@aws-sdk/client-sfn';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  vitest,
} from 'vitest';
import * as userWorkflowsDbUtils from '../../../utils/user-workflows-db-utils';

// IMPORTANT: Mock workflow-utils with a factory BEFORE importing the handler
vi.mock('../../../utils/workflow-utils', () => ({
  getStepFunctionsExecutionDetails: vi.fn().mockResolvedValue({
    status: 'RUNNING',
    startDate: '2024-01-01T00:00:00.000Z', // <-- string, not Date
    stopDate: undefined,
    error: undefined,
    cause: undefined,
    input: undefined,
    output: undefined,
  }),
  combineWorkflowDetails: vi.fn((workflowRecord) => {
    console.log('MOCK combineWorkflowDetails called');
    return {
      ...workflowRecord,
      execution: {
        status: 'RUNNING',
        startDate: '2024-01-01T00:00:00.000Z',
      },
    };
  }),
}));

vi.mock('../../../utils/user-workflows-db-utils');

const mockedUserWorkflowsDbUtils = vi.mocked(userWorkflowsDbUtils);

describe('start-workflow Lambda handler', () => {
  let handler: any;
  let sfnSendSpy: any;

  beforeAll(async () => {
    // Dynamically import handler after setting env and mocks
    vitest.stubEnv('STATE_MACHINE_ARN', 'test-arn');
    vitest.stubEnv('USER_WORKFLOWS_TABLE', 'test-table');
    vitest.stubEnv('STORAGE_BUCKET', 'test-bucket');

    const module = await import('./index.js');
    handler = module.handler;
  });

  beforeEach(async () => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Mock createWorkflow to return a proper WorkflowRecord
    mockedUserWorkflowsDbUtils.createWorkflow.mockResolvedValue({
      userId: 'user',
      workflowId: 'arn:aws:states:...',
      status: 'STARTING',
      statusHistory: [
        {
          status: 'STARTING',
          timestamp: new Date().toISOString(),
        },
      ],
      parameters: {
        doTranslate: false,
        doSpeech: false,
        targetLanguage: 'english',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      s3Paths: {
        originalFile: 'users/user/uploads/file.txt',
      },
    });

    // Mock SFNClient.send
    sfnSendSpy = vi.spyOn(SFNClient.prototype, 'send');
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and workflowId on success', async () => {
    sfnSendSpy.mockResolvedValue({
      executionArn: 'arn:aws:states:...',
      startDate: '2024-01-01T00:00:00.000Z',
    });
    const event = {
      body: JSON.stringify({ filename: 'file.txt' }), // Use filename instead of fileKey
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // The response should now contain the combined workflow details
    expect(body.userId).toBe('user');
    expect(body.workflowId).toBe('arn:aws:states:...');
    expect(body.status).toBe('STARTING');
    expect(body.execution).toBeDefined();
  });

  it('returns 500 if SFNClient.send throws', async () => {
    sfnSendSpy.mockRejectedValue(new Error('fail sfn'));
    const event = {
      body: JSON.stringify({ filename: 'file.txt' }), // Use filename instead of fileKey
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Internal server error');
  });

  it('calls createWorkflow with correct arguments', async () => {
    sfnSendSpy.mockResolvedValue({
      executionArn: 'arn:aws:states:...',
      startDate: '2024-01-01T00:00:00.000Z',
    });
    const createWorkflowSpy = vi.spyOn(userWorkflowsDbUtils, 'createWorkflow');
    const event = {
      body: JSON.stringify({
        filename: 'file.txt',
        doTranslate: true,
        doSpeech: false,
        targetLanguage: 'es',
      }),
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(createWorkflowSpy).toHaveBeenCalledWith(
      'test-table',
      expect.objectContaining({
        userId: 'user',
        workflowId: 'arn:aws:states:...',
        status: 'STARTING',
        parameters: {
          doTranslate: true,
          doSpeech: false,
          targetLanguage: 'es',
        },
        s3Paths: {
          originalFile: 'users/user/uploads/file.txt',
        },
      })
    );
  });

  // New test cases for Zod validation and error handling
  it('returns 400 for missing request body', async () => {
    const event = {
      body: null,
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON in request body', async () => {
    const event = {
      body: 'invalid json',
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toBe('Invalid request body format - must be valid JSON');
  });

  it('returns 400 for missing filename in request body', async () => {
    const event = {
      body: JSON.stringify({ doTranslate: true }),
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toContain('filename is required');
  });

  it('returns 400 for empty filename in request body', async () => {
    const event = {
      body: JSON.stringify({ filename: '' }),
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toContain('filename cannot be empty');
  });

  it('returns 400 for missing userId in JWT claims', async () => {
    const event = {
      body: JSON.stringify({ filename: 'file.txt' }),
      requestContext: { authorizer: { jwt: { claims: {} } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toBe('Invalid or missing userId in JWT claims');
  });

  it('uses default values for optional fields', async () => {
    sfnSendSpy.mockResolvedValue({
      executionArn: 'arn:aws:states:...',
      startDate: '2024-01-01T00:00:00.000Z',
    });
    const createWorkflowSpy = vi.spyOn(userWorkflowsDbUtils, 'createWorkflow');
    const event = {
      body: JSON.stringify({ filename: 'file.txt' }), // Only required field
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(createWorkflowSpy).toHaveBeenCalledWith(
      'test-table',
      expect.objectContaining({
        parameters: {
          doTranslate: false,
          doSpeech: false,
          targetLanguage: 'english',
        },
      })
    );
  });

  it('returns 500 if createWorkflow fails', async () => {
    sfnSendSpy.mockResolvedValue({
      executionArn: 'arn:aws:states:...',
      startDate: '2024-01-01T00:00:00.000Z',
    });
    vi.spyOn(userWorkflowsDbUtils, 'createWorkflow').mockRejectedValue(
      new Error('DynamoDB error')
    );
    const event = {
      body: JSON.stringify({ filename: 'file.txt' }),
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Internal server error');
    expect(body.error).toContain(
      'Failed to create workflow record in DynamoDB'
    );
  });
});
