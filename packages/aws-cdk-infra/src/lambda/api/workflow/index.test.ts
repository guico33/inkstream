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
import * as userWorkflowsDbUtils from '../../../utils/user-workflows-db-utils';
import { WorkflowRecord } from '@inkstream/shared';

describe('workflow Lambda handler', () => {
  let handler: any;

  beforeAll(async () => {
    // Dynamically import handler after setting env
    vitest.stubEnv('USER_WORKFLOWS_TABLE', 'test-user-workflows-table');
    handler = (await import('./index.js')).handler;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock getWorkflow
    vi.spyOn(userWorkflowsDbUtils, 'getWorkflow').mockResolvedValue(undefined);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const createMockEvent = (
    options: {
      workflowId?: string | null;
      userId?: string | null;
    } = {}
  ) => {
    // Use hasOwnProperty to distinguish between undefined passed explicitly vs not passed at all
    const workflowId = 'workflowId' in options ? options.workflowId : 'wf-123';
    const userId = 'userId' in options ? options.userId : 'user-123';

    const event: any = {
      requestContext: {
        authorizer: {
          jwt: {
            claims: {},
          },
        },
      },
      pathParameters: {},
    };

    // Only set userId if it's not null/undefined
    if (userId !== null && userId !== undefined) {
      event.requestContext.authorizer.jwt.claims.sub = userId;
    }

    // Only set workflowId if it's not null/undefined
    if (workflowId !== null && workflowId !== undefined) {
      event.pathParameters.workflowId = workflowId;
    }

    return event;
  };

  const createMockWorkflowRecord = (): WorkflowRecord => ({
    userId: 'user-123',
    workflowId: 'wf-123',
    status: 'SUCCEEDED',
    statusHistory: [
      {
        status: 'SUCCEEDED',
        timestamp: '2024-01-01T01:00:00.000Z',
      },
    ],
    parameters: {
      doTranslate: true,
      doSpeech: false,
      targetLanguage: 'spanish',
    },
    s3Paths: {
      originalFile: 'users/user-123/uploads/file.pdf',
      formattedText: 'users/user-123/formatted/file.txt',
      translatedText: 'users/user-123/translated/file.txt',
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T01:00:00.000Z',
  });

  it('returns 200 and workflow details when workflow is found', async () => {
    const mockWorkflow = createMockWorkflowRecord();
    vi.spyOn(userWorkflowsDbUtils, 'getWorkflow').mockResolvedValue(
      mockWorkflow
    );

    const event = createMockEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.workflowId).toBe('wf-123');
    expect(body.status).toBe('SUCCEEDED');
    expect(body.parameters).toEqual({
      doTranslate: true,
      doSpeech: false,
      targetLanguage: 'spanish',
    });
    expect(body.s3Paths).toEqual({
      originalFile: 'users/user-123/uploads/file.pdf',
      formattedText: 'users/user-123/formatted/file.txt',
      translatedText: 'users/user-123/translated/file.txt',
    });
    expect(body.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(body.updatedAt).toBe('2024-01-01T01:00:00.000Z');
  });

  it('returns 404 when workflow is not found', async () => {
    vi.spyOn(userWorkflowsDbUtils, 'getWorkflow').mockResolvedValue(undefined);

    const event = createMockEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Workflow not found');
    expect(body.workflowId).toBe('wf-123');
  });

  it('returns 400 when workflowId is missing from path parameters', async () => {
    const event = createMockEvent({ workflowId: undefined });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toBe('workflowId is required as path parameter');
  });

  it('returns 400 when workflowId is empty in path parameters', async () => {
    const event = createMockEvent({ workflowId: '' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toContain('workflowId cannot be empty');
  });

  it('returns 400 when userId is missing from JWT claims', async () => {
    const event = createMockEvent({ userId: undefined });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toBe('Invalid or missing userId in JWT claims');
  });

  it('returns 400 when userId is empty in JWT claims', async () => {
    const event = createMockEvent({ userId: '' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Validation error');
    expect(body.error).toBe('Invalid or missing userId in JWT claims');
  });

  it('returns 500 when DynamoDB query fails', async () => {
    vi.spyOn(userWorkflowsDbUtils, 'getWorkflow').mockRejectedValue(
      new Error('DynamoDB connection error')
    );

    const event = createMockEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Internal server error');
    expect(body.error).toContain('Failed to retrieve workflow from DynamoDB');
  });

  it('includes error field in response when workflow has an error', async () => {
    const mockWorkflow: WorkflowRecord = {
      ...createMockWorkflowRecord(),
      status: 'FAILED',
      error: 'Text formatting failed',
    };
    vi.spyOn(userWorkflowsDbUtils, 'getWorkflow').mockResolvedValue(
      mockWorkflow
    );

    const event = createMockEvent();
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('FAILED');
    expect(body.error).toBe('Text formatting failed');
  });

  it('calls getWorkflow with correct parameters', async () => {
    const getWorkflowSpy = vi
      .spyOn(userWorkflowsDbUtils, 'getWorkflow')
      .mockResolvedValue(createMockWorkflowRecord());

    const event = createMockEvent({
      workflowId: 'custom-workflow-id',
      userId: 'custom-user-id',
    });
    await handler(event);

    expect(getWorkflowSpy).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'custom-user-id',
      'custom-workflow-id'
    );
  });
});
