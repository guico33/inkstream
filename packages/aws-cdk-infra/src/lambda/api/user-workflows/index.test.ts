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

    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockResolvedValue({
      items: mockWorkflows,
      nextToken: undefined,
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: mockWorkflows,
      nextToken: undefined,
    });
    expect(result.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(userWorkflowsDbUtils.listWorkflowsWithSorting).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'test-user-123',
      {
        limit: undefined,
        nextToken: undefined,
        sortBy: 'updatedAt',
      }
    );
  });

  it('should return empty array when user has no workflows', async () => {
    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockResolvedValue({
      items: [],
      nextToken: undefined,
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [],
      nextToken: undefined,
    });
  });

  it('should return empty array when listWorkflowsWithSorting returns undefined', async () => {
    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockResolvedValue({
      items: [],
      nextToken: undefined,
    });

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [],
      nextToken: undefined,
    });
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
    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockRejectedValue(new Error('Database connection failed'));

    const result = await handler(mockEvent);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({
      message: 'Internal server error',
    });
  });

  it('should handle pagination with limit and nextToken', async () => {
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
    ];

    const eventWithPagination = {
      ...mockEvent,
      queryStringParameters: {
        limit: '10',
        nextToken: 'eyJsYXN0S2V5IjoidGVzdCJ9',
      },
    };

    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockResolvedValue({
      items: mockWorkflows,
      nextToken: 'eyJuZXh0S2V5IjoidGVzdCJ9',
    });

    const result = await handler(eventWithPagination);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: mockWorkflows,
      nextToken: 'eyJuZXh0S2V5IjoidGVzdCJ9',
    });
    expect(userWorkflowsDbUtils.listWorkflowsWithSorting).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'test-user-123',
      {
        limit: 10,
        nextToken: 'eyJsYXN0S2V5IjoidGVzdCJ9',
        sortBy: 'updatedAt',
      }
    );
  });

  it('should handle sortBy=createdAt parameter', async () => {
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
    ];

    const eventWithSortBy = {
      ...mockEvent,
      queryStringParameters: {
        sortBy: 'createdAt',
      },
    };

    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockResolvedValue({
      items: mockWorkflows,
      nextToken: undefined,
    });

    const result = await handler(eventWithSortBy);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: mockWorkflows,
      nextToken: undefined,
    });
    expect(userWorkflowsDbUtils.listWorkflowsWithSorting).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'test-user-123',
      {
        limit: undefined,
        nextToken: undefined,
        sortBy: 'createdAt',
      }
    );
  });

  it('should handle sortBy=updatedAt parameter explicitly', async () => {
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
    ];

    const eventWithSortBy = {
      ...mockEvent,
      queryStringParameters: {
        sortBy: 'updatedAt',
      },
    };

    vi.spyOn(
      userWorkflowsDbUtils,
      'listWorkflowsWithSorting'
    ).mockResolvedValue({
      items: mockWorkflows,
      nextToken: undefined,
    });

    const result = await handler(eventWithSortBy);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: mockWorkflows,
      nextToken: undefined,
    });
    expect(userWorkflowsDbUtils.listWorkflowsWithSorting).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'test-user-123',
      {
        limit: undefined,
        nextToken: undefined,
        sortBy: 'updatedAt',
      }
    );
  });

  it('should validate limit parameter bounds', async () => {
    const eventWithInvalidLimit = {
      ...mockEvent,
      queryStringParameters: {
        limit: '150', // Exceeds max of 100
      },
    };

    const result = await handler(eventWithInvalidLimit);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      message: 'Validation error',
    });
  });

  it('should validate sortBy parameter values', async () => {
    const eventWithInvalidSortBy = {
      ...mockEvent,
      queryStringParameters: {
        sortBy: 'invalidSort',
      },
    };

    const result = await handler(eventWithInvalidSortBy);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      message: 'Validation error',
    });
  });

  it('should reject when sortBy and status are used together', async () => {
    const eventWithBothParams = {
      ...mockEvent,
      queryStringParameters: {
        sortBy: 'createdAt',
        status: 'SUCCEEDED',
      },
    };

    const result = await handler(eventWithBothParams);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({
      message: 'Validation error',
      error:
        'sortBy parameter cannot be used with status filtering. Use either sortBy for sorting or status for filtering, but not both.',
    });
  });

  it('should handle status filtering parameter', async () => {
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
    ];

    const eventWithStatusFilter = {
      ...mockEvent,
      queryStringParameters: {
        status: 'SUCCEEDED',
      },
    };

    vi.spyOn(userWorkflowsDbUtils, 'listWorkflowsByStatus').mockResolvedValue({
      items: mockWorkflows,
      nextToken: undefined,
    });

    const result = await handler(eventWithStatusFilter);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: mockWorkflows,
      nextToken: undefined,
    });
    expect(userWorkflowsDbUtils.listWorkflowsByStatus).toHaveBeenCalledWith(
      'test-user-workflows-table',
      'test-user-123',
      'SUCCEEDED',
      {
        limit: undefined,
        nextToken: undefined,
      }
    );
  });
});
