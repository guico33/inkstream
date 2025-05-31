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
import * as workflowStateUtils from '../../../utils/workflow-state';
import { WorkflowRecord } from '@inkstream/shared';

describe('user-workflows Lambda handler', () => {
  let handler: any;

  beforeAll(async () => {
    // Dynamically import handler after setting env
    vitest.stubEnv('USER_WORKFLOWS_TABLE', 'test-user-workflows-table');
    handler = (await import('./index.js')).handler;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const mockEvent = {
    httpMethod: 'GET',
    path: '/user-workflows',
    queryStringParameters: null,
    headers: {},
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user-123',
          },
        },
      },
    },
  } as any;

  it('should return user workflows successfully', async () => {
    const mockWorkflows: WorkflowRecord[] = [
      {
        userId: 'test-user-123',
        workflowId: 'workflow-1',
        status: 'SUCCEEDED',
        statusHistory: [
          { status: 'SUCCEEDED', timestamp: '2024-01-01T00:00:00Z' },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        userId: 'test-user-123',
        workflowId: 'workflow-2',
        status: 'FAILED',
        statusHistory: [
          { status: 'FAILED', timestamp: '2024-01-02T00:00:00Z' },
        ],
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
    ];

    vi.spyOn(workflowStateUtils, 'listWorkflows').mockResolvedValue(
      mockWorkflows
    );

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(mockWorkflows);
    expect(result.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(workflowStateUtils.listWorkflows).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'test-user-123'
    );
  });

  it('should return empty array when user has no workflows', async () => {
    vi.spyOn(workflowStateUtils, 'listWorkflows').mockResolvedValue([]);

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should return empty array when listWorkflows returns undefined', async () => {
    vi.spyOn(workflowStateUtils, 'listWorkflows').mockResolvedValue(undefined);

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('should handle missing user ID in JWT', async () => {
    const eventWithoutUserId = {
      ...mockEvent,
      requestContext: {
        authorizer: {
          jwt: {
            claims: {},
          },
        },
      },
    };

    const result = await handler(eventWithoutUserId);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      message: 'Validation error',
      error: 'Invalid or missing userId in JWT claims',
    });
  });

  it('should handle database errors', async () => {
    vi.spyOn(workflowStateUtils, 'listWorkflows').mockRejectedValue(
      new Error('Database connection failed')
    );

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({
      message: 'Internal server error',
    });
  });
});
