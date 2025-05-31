import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterAll,
  beforeAll,
  vitest,
} from 'vitest';
import { SFNClient } from '@aws-sdk/client-sfn';
import * as workflowStateUtils from '../../../utils/workflow-state';

describe('start-workflow Lambda handler', () => {
  let handler: any;
  let sfnSendSpy: any;

  beforeAll(async () => {
    // Dynamically import handler after setting env
    vitest.stubEnv('STATE_MACHINE_ARN', 'test-arn');
    vitest.stubEnv('USER_WORKFLOWS_TABLE', 'test-table');
    vitest.stubEnv('STORAGE_BUCKET', 'test-bucket');
    handler = (await import('./index.js')).handler;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock createWorkflow and updateWorkflowStatus
    vi.spyOn(workflowStateUtils, 'createWorkflow').mockResolvedValue(undefined);
    vi.spyOn(workflowStateUtils, 'updateWorkflowStatus').mockResolvedValue(
      undefined
    );
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
    expect(body.message).toMatch(/Workflow started successfully/);
    expect(body.workflowId).toBeDefined();
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
    const createWorkflowSpy = vi.spyOn(workflowStateUtils, 'createWorkflow');
    const event = {
      body: JSON.stringify({
        filename: 'file.txt',
        doTranslate: true,
        doSpeech: false,
        targetLanguage: 'es',
      }),
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    await handler(event);
    expect(createWorkflowSpy).toHaveBeenCalledWith(
      'test-table',
      expect.objectContaining({
        userId: 'user',
        status: 'STARTING',
        parameters: {
          doTranslate: true,
          doSpeech: false,
          targetLanguage: 'es',
        },
        // ...other expected fields if needed
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
    const createWorkflowSpy = vi.spyOn(workflowStateUtils, 'createWorkflow');
    const event = {
      body: JSON.stringify({ filename: 'file.txt' }), // Only required field
      requestContext: { authorizer: { jwt: { claims: { sub: 'user' } } } },
    };
    await handler(event);
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
    vi.spyOn(workflowStateUtils, 'createWorkflow').mockRejectedValue(
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
