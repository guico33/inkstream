import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterAll,
  beforeAll,
} from 'vitest';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import * as workflowState from '../../../utils/workflow-state';

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

let mockSend: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockSend = vi.fn();
  vi.spyOn(SFNClient.prototype, 'send').mockImplementation(mockSend);
});

let handler: any;

// Helper to import handler after spies are set up
async function importHandler() {
  return (await import('./index.js')).handler;
}

beforeAll(() => {
  vi.stubEnv('USER_WORKFLOWS_TABLE', 'test-table');
  vi.stubEnv(
    'STATE_MACHINE_ARN',
    'arn:aws:states:us-east-1:123456789012:stateMachine:test'
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('start-workflow Lambda handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 if no body is provided', async () => {
    handler = await importHandler();
    const event = { body: undefined } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(
      /Invalid request body format/
    );
  });

  it('returns 400 if body is invalid JSON', async () => {
    handler = await importHandler();
    const event = { body: '{invalidJson' } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(
      /Invalid request body format/
    );
  });

  it('returns 500 if STATE_MACHINE_ARN is not set', async () => {
    process.env.STATE_MACHINE_ARN = '';
    handler = await importHandler();
    const event = {
      body: JSON.stringify({ fileKey: 'file.txt', userId: 'user' }),
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /STATE_MACHINE_ARN environment variable is not set/
    );
    process.env.STATE_MACHINE_ARN =
      'arn:aws:states:us-east-1:123456789012:stateMachine:test';
  });

  it('returns 200 and executionArn on success', async () => {
    const createWorkflowSpy = vi
      .spyOn(workflowState, 'createWorkflow')
      .mockResolvedValueOnce();
    handler = await importHandler();
    mockSend.mockResolvedValueOnce({
      executionArn: 'arn:aws:states:execution:123',
      startDate: '2025-05-22T00:00:00Z',
    });
    const event = {
      body: JSON.stringify({ fileKey: 'file.txt', userId: 'user' }),
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/Workflow started successfully/);
    expect(body.executionArn).toBe('arn:aws:states:execution:123');
    expect(body.startDate).toBe('2025-05-22T00:00:00Z');
    expect(mockSend).toHaveBeenCalledWith(expect.any(StartExecutionCommand));
    createWorkflowSpy.mockRestore();
  });

  it('returns 500 if SFNClient.send throws', async () => {
    const createWorkflowSpy = vi
      .spyOn(workflowState, 'createWorkflow')
      .mockResolvedValueOnce();
    handler = await importHandler();
    mockSend.mockRejectedValueOnce(new Error('sfn error'));
    const event = {
      body: JSON.stringify({ fileKey: 'file.txt', userId: 'user' }),
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/Failed to start workflow/);
    expect(body.error).toMatch(
      /sfn error|Step Functions did not return an executionArn/
    );
    createWorkflowSpy.mockRestore();
  });

  it('calls createWorkflow with correct arguments', async () => {
    const createWorkflowSpy = vi
      .spyOn(workflowState, 'createWorkflow')
      .mockResolvedValueOnce();
    handler = await importHandler();
    mockSend.mockResolvedValueOnce({
      executionArn: 'arn:aws:states:execution:123',
      startDate: '2025-05-22T00:00:00Z',
    });
    const event = {
      body: JSON.stringify({
        fileKey: 'file.txt',
        userId: 'user',
        doTranslate: true,
        doSpeech: false,
        targetLanguage: 'es',
      }),
    } as any;
    await handler(event);
    expect(createWorkflowSpy).toHaveBeenCalledWith(
      'test-table',
      expect.objectContaining({
        userId: 'user',
        workflowId: 'test-uuid',
        status: 'STARTING',
        parameters: {
          doTranslate: true,
          doSpeech: false,
          targetLanguage: 'es',
        },
      })
    );
    createWorkflowSpy.mockRestore();
  });
});
