import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  createWorkflow,
  getWorkflow,
  updateWorkflowStatus,
  listWorkflows,
  listWorkflowsByCreatedAt,
  listWorkflowsByUpdatedAt,
} from '../workflow-state';
import { WorkflowRecord } from '@inkstream/shared';

const TABLE_NAME = 'test-table';
const userId = 'user-1';
const workflowId = 'wf-1';
const baseRecord: WorkflowRecord = {
  userId,
  workflowId,
  status: 'STARTING',
  parameters: { doTranslate: true, doSpeech: false, targetLanguage: 'fr' },
  s3Paths: {
    originalFile: 's3://bucket/original.txt',
    formattedText: 's3://bucket/fmt.txt',
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  statusHistory: [
    {
      status: 'STARTING',
      timestamp: '2024-01-01T00:00:00.000Z',
    },
  ],
};

let sendSpy: any;

beforeEach(() => {
  sendSpy = vi.spyOn(DynamoDBDocumentClient.prototype, 'send');
});
afterEach(() => {
  sendSpy.mockRestore();
});

describe('workflow-state DynamoDB utilities', () => {
  it('createWorkflow puts a new item', async () => {
    sendSpy.mockResolvedValueOnce({});
    await expect(
      createWorkflow(TABLE_NAME, baseRecord)
    ).resolves.toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.Item.userId).toBe(userId);
    expect(callArg.input.Item.workflowId).toBe(workflowId);
  });

  it('getWorkflow returns the item if found', async () => {
    sendSpy.mockResolvedValueOnce({
      Item: {
        ...baseRecord,
        _et: 'WORKFLOW',
        _ct: baseRecord.createdAt,
        _md: baseRecord.updatedAt,
      },
    });
    const result = await getWorkflow(TABLE_NAME, userId, workflowId);
    expect(result).toMatchObject(baseRecord);
  });

  it('getWorkflow returns undefined if not found', async () => {
    sendSpy.mockResolvedValueOnce({});
    const result = await getWorkflow(TABLE_NAME, userId, workflowId);
    expect(result).toBeUndefined();
  });

  it('updateWorkflowStatus updates the item', async () => {
    sendSpy.mockResolvedValueOnce({});
    await expect(
      updateWorkflowStatus(TABLE_NAME, userId, workflowId, 'SUCCEEDED', {
        error: undefined,
      })
    ).resolves.toBeUndefined();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    // The update uses ExpressionAttributeValues and ExpressionAttributeNames
    expect(callArg.input.ExpressionAttributeValues[':s_1']).toBe('SUCCEEDED');
    expect(callArg.input.Key.userId).toBe(userId);
    expect(callArg.input.Key.workflowId).toBe(workflowId);
  });

  it('listWorkflows returns items for the user', async () => {
    const items = [
      {
        ...baseRecord,
        _et: 'WORKFLOW',
        _ct: baseRecord.createdAt,
        _md: baseRecord.updatedAt,
      },
      {
        ...baseRecord,
        workflowId: 'wf-2',
        _et: 'WORKFLOW',
        _ct: baseRecord.createdAt,
        _md: baseRecord.updatedAt,
      },
    ];
    sendSpy.mockResolvedValueOnce({ Items: items });
    const result = await listWorkflows(TABLE_NAME, userId);
    expect(result.items).toEqual([
      expect.objectContaining({ workflowId: 'wf-1' }),
      expect.objectContaining({ workflowId: 'wf-2' }),
    ]);
    expect(result.nextToken).toBeUndefined();
  });

  it('listWorkflows returns empty array when no items found', async () => {
    sendSpy.mockResolvedValueOnce({ Items: [] });
    const result = await listWorkflows(TABLE_NAME, userId);
    expect(result.items).toEqual([]);
    expect(result.nextToken).toBeUndefined();
  });

  it('listWorkflows supports pagination with limit and nextToken', async () => {
    const lastEvaluatedKey = { userId: 'user-1', workflowId: 'wf-1' };
    sendSpy.mockResolvedValueOnce({
      Items: [{ ...baseRecord, _et: 'WORKFLOW' }],
      LastEvaluatedKey: lastEvaluatedKey,
    });

    const nextToken = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString(
      'base64'
    );
    const result = await listWorkflows(TABLE_NAME, userId, {
      limit: 10,
      nextToken: nextToken,
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextToken).toBeDefined();

    // Verify the query was called with correct pagination parameters
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.Limit).toBe(10);
    expect(callArg.input.ExclusiveStartKey).toEqual(lastEvaluatedKey);
  });

  it('listWorkflows handles DynamoDB errors gracefully', async () => {
    const error = new Error('DynamoDB connection failed');
    sendSpy.mockRejectedValueOnce(error);

    await expect(listWorkflows(TABLE_NAME, userId)).rejects.toThrow(
      'DynamoDB connection failed'
    );
  });

  it('listWorkflowsByCreatedAt returns items sorted by creation date', async () => {
    const items = [
      {
        ...baseRecord,
        workflowId: 'wf-1',
        createdAt: '2024-01-03T00:00:00.000Z',
        _et: 'WORKFLOW',
        _ct: '2024-01-03T00:00:00.000Z',
        _md: '2024-01-03T00:00:00.000Z',
      },
      {
        ...baseRecord,
        workflowId: 'wf-2',
        createdAt: '2024-01-02T00:00:00.000Z',
        _et: 'WORKFLOW',
        _ct: '2024-01-02T00:00:00.000Z',
        _md: '2024-01-02T00:00:00.000Z',
      },
      {
        ...baseRecord,
        workflowId: 'wf-3',
        createdAt: '2024-01-01T00:00:00.000Z',
        _et: 'WORKFLOW',
        _ct: '2024-01-01T00:00:00.000Z',
        _md: '2024-01-01T00:00:00.000Z',
      },
    ];
    sendSpy.mockResolvedValueOnce({ Items: items });
    const result = await listWorkflowsByCreatedAt(TABLE_NAME, userId);

    expect(result.items).toEqual([
      expect.objectContaining({
        workflowId: 'wf-1',
        createdAt: '2024-01-03T00:00:00.000Z',
      }),
      expect.objectContaining({
        workflowId: 'wf-2',
        createdAt: '2024-01-02T00:00:00.000Z',
      }),
      expect.objectContaining({
        workflowId: 'wf-3',
        createdAt: '2024-01-01T00:00:00.000Z',
      }),
    ]);
    expect(result.nextToken).toBeUndefined();

    // Verify the query was called with correct parameters
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.IndexName).toBe('CreatedAtIndex');
    expect(callArg.input.KeyConditionExpression).toContain('#c0_1 = :c0_1');
    expect(callArg.input.ExpressionAttributeNames['#c0_1']).toBe('userId');
    expect(callArg.input.ExpressionAttributeValues[':c0_1']).toBe(userId);
    expect(callArg.input.ScanIndexForward).toBe(false); // reverse order
  });

  it('listWorkflowsByCreatedAt returns empty array when no items found', async () => {
    sendSpy.mockResolvedValueOnce({ Items: [] });
    const result = await listWorkflowsByCreatedAt(TABLE_NAME, userId);
    expect(result.items).toEqual([]);
    expect(result.nextToken).toBeUndefined();
  });

  it('listWorkflowsByUpdatedAt returns items sorted by last modified date', async () => {
    const items = [
      {
        ...baseRecord,
        workflowId: 'wf-1',
        updatedAt: '2024-01-03T00:00:00.000Z',
        _et: 'WORKFLOW',
        _ct: '2024-01-01T00:00:00.000Z',
        _md: '2024-01-03T00:00:00.000Z',
      },
      {
        ...baseRecord,
        workflowId: 'wf-2',
        updatedAt: '2024-01-02T00:00:00.000Z',
        _et: 'WORKFLOW',
        _ct: '2024-01-01T00:00:00.000Z',
        _md: '2024-01-02T00:00:00.000Z',
      },
      {
        ...baseRecord,
        workflowId: 'wf-3',
        updatedAt: '2024-01-01T00:00:00.000Z',
        _et: 'WORKFLOW',
        _ct: '2024-01-01T00:00:00.000Z',
        _md: '2024-01-01T00:00:00.000Z',
      },
    ];
    sendSpy.mockResolvedValueOnce({ Items: items });
    const result = await listWorkflowsByUpdatedAt(TABLE_NAME, userId);

    expect(result.items).toEqual([
      expect.objectContaining({
        workflowId: 'wf-1',
        updatedAt: '2024-01-03T00:00:00.000Z',
      }),
      expect.objectContaining({
        workflowId: 'wf-2',
        updatedAt: '2024-01-02T00:00:00.000Z',
      }),
      expect.objectContaining({
        workflowId: 'wf-3',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    ]);
    expect(result.nextToken).toBeUndefined();

    // Verify the query was called with correct parameters
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.IndexName).toBe('UpdatedAtIndex');
    expect(callArg.input.KeyConditionExpression).toContain('#c0_1 = :c0_1');
    expect(callArg.input.ExpressionAttributeNames['#c0_1']).toBe('userId');
    expect(callArg.input.ExpressionAttributeValues[':c0_1']).toBe(userId);
    expect(callArg.input.ScanIndexForward).toBe(false); // reverse order
  });

  it('listWorkflowsByUpdatedAt returns empty array when no items found', async () => {
    sendSpy.mockResolvedValueOnce({ Items: [] });
    const result = await listWorkflowsByUpdatedAt(TABLE_NAME, userId);
    expect(result).toEqual({
      items: [],
      nextToken: undefined,
    });
  });

  it('listWorkflowsByCreatedAt handles DynamoDB errors gracefully', async () => {
    const error = new Error('DynamoDB connection failed');
    sendSpy.mockRejectedValueOnce(error);

    await expect(listWorkflowsByCreatedAt(TABLE_NAME, userId)).rejects.toThrow(
      'DynamoDB connection failed'
    );
  });

  it('listWorkflowsByUpdatedAt handles DynamoDB errors gracefully', async () => {
    const error = new Error('DynamoDB connection failed');
    sendSpy.mockRejectedValueOnce(error);

    await expect(listWorkflowsByUpdatedAt(TABLE_NAME, userId)).rejects.toThrow(
      'DynamoDB connection failed'
    );
  });

  it('listWorkflowsByCreatedAt queries the correct GSI with proper parameters', async () => {
    sendSpy.mockResolvedValueOnce({ Items: [] });
    await listWorkflowsByCreatedAt(TABLE_NAME, 'test-user-123');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const callArg = sendSpy.mock.calls[0]?.[0] as any;

    // Verify it's using the CreatedAtIndex GSI
    expect(callArg.input.IndexName).toBe('CreatedAtIndex');
    // Verify it's querying for the correct user
    expect(callArg.input.KeyConditionExpression).toContain('#c0_1 = :c0_1');
    expect(callArg.input.ExpressionAttributeNames['#c0_1']).toBe('userId');
    expect(callArg.input.ExpressionAttributeValues[':c0_1']).toBe(
      'test-user-123'
    );
    // Verify reverse sorting (most recent first)
    expect(callArg.input.ScanIndexForward).toBe(false);
    // Verify maxPages option for complete results
    expect(callArg.input.Limit).toBeUndefined(); // Should query all pages
  });

  it('listWorkflowsByUpdatedAt queries the correct GSI with proper parameters', async () => {
    sendSpy.mockResolvedValueOnce({ Items: [] });
    await listWorkflowsByUpdatedAt(TABLE_NAME, 'test-user-456');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const callArg = sendSpy.mock.calls[0]?.[0] as any;

    // Verify it's using the UpdatedAtIndex GSI
    expect(callArg.input.IndexName).toBe('UpdatedAtIndex');
    // Verify it's querying for the correct user
    expect(callArg.input.KeyConditionExpression).toContain('#c0_1 = :c0_1');
    expect(callArg.input.ExpressionAttributeNames['#c0_1']).toBe('userId');
    expect(callArg.input.ExpressionAttributeValues[':c0_1']).toBe(
      'test-user-456'
    );
    // Verify reverse sorting (most recently updated first)
    expect(callArg.input.ScanIndexForward).toBe(false);
    // Verify maxPages option for complete results
    expect(callArg.input.Limit).toBeUndefined(); // Should query all pages
  });

  // Pagination tests for listWorkflowsByCreatedAt
  it('listWorkflowsByCreatedAt supports pagination with limit', async () => {
    const mockItems = [
      {
        ...baseRecord,
        workflowId: 'wf-1',
        createdAt: '2024-01-03T00:00:00.000Z',
      },
      {
        ...baseRecord,
        workflowId: 'wf-2',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ];
    const mockLastEvaluatedKey = {
      userId: 'user-1',
      createdAt: '2024-01-02T00:00:00.000Z',
    };

    sendSpy.mockResolvedValueOnce({
      Items: mockItems,
      LastEvaluatedKey: mockLastEvaluatedKey,
    });

    const result = await listWorkflowsByCreatedAt(TABLE_NAME, userId, {
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.nextToken).toBeDefined();
    expect(result.nextToken).toBe(
      Buffer.from(JSON.stringify(mockLastEvaluatedKey)).toString('base64')
    );

    // Verify limit was set in query options
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.Limit).toBe(2);
  });

  it('listWorkflowsByCreatedAt supports pagination with nextToken', async () => {
    const exclusiveStartKey = {
      userId: 'user-1',
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    const nextToken = Buffer.from(JSON.stringify(exclusiveStartKey)).toString(
      'base64'
    );

    sendSpy.mockResolvedValueOnce({ Items: [] });

    await listWorkflowsByCreatedAt(TABLE_NAME, userId, { nextToken });

    // Verify exclusiveStartKey was set in query options
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.ExclusiveStartKey).toEqual(exclusiveStartKey);
  });

  it('listWorkflowsByCreatedAt handles pagination with both limit and nextToken', async () => {
    const exclusiveStartKey = {
      userId: 'user-1',
      createdAt: '2024-01-02T00:00:00.000Z',
    };
    const nextToken = Buffer.from(JSON.stringify(exclusiveStartKey)).toString(
      'base64'
    );
    const mockItems = [
      {
        ...baseRecord,
        workflowId: 'wf-3',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    sendSpy.mockResolvedValueOnce({
      Items: mockItems,
      LastEvaluatedKey: undefined, // No more items
    });

    const result = await listWorkflowsByCreatedAt(TABLE_NAME, userId, {
      limit: 1,
      nextToken,
    });

    expect(result.items).toHaveLength(1);
    expect(result.nextToken).toBeUndefined(); // No more pages

    // Verify both limit and exclusiveStartKey were set
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.Limit).toBe(1);
    expect(callArg.input.ExclusiveStartKey).toEqual(exclusiveStartKey);
  });

  // Pagination tests for listWorkflowsByUpdatedAt
  it('listWorkflowsByUpdatedAt supports pagination with limit', async () => {
    const mockItems = [
      {
        ...baseRecord,
        workflowId: 'wf-1',
        updatedAt: '2024-01-03T00:00:00.000Z',
      },
      {
        ...baseRecord,
        workflowId: 'wf-2',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ];
    const mockLastEvaluatedKey = {
      userId: 'user-1',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };

    sendSpy.mockResolvedValueOnce({
      Items: mockItems,
      LastEvaluatedKey: mockLastEvaluatedKey,
    });

    const result = await listWorkflowsByUpdatedAt(TABLE_NAME, userId, {
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.nextToken).toBeDefined();
    expect(result.nextToken).toBe(
      Buffer.from(JSON.stringify(mockLastEvaluatedKey)).toString('base64')
    );

    // Verify limit was set in query options
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.Limit).toBe(2);
  });

  it('listWorkflowsByUpdatedAt supports pagination with nextToken', async () => {
    const exclusiveStartKey = {
      userId: 'user-1',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    const nextToken = Buffer.from(JSON.stringify(exclusiveStartKey)).toString(
      'base64'
    );

    sendSpy.mockResolvedValueOnce({ Items: [] });

    await listWorkflowsByUpdatedAt(TABLE_NAME, userId, { nextToken });

    // Verify exclusiveStartKey was set in query options
    const callArg = sendSpy.mock.calls[0]?.[0] as any;
    expect(callArg.input.ExclusiveStartKey).toEqual(exclusiveStartKey);
  });

  it('listWorkflowsByUpdatedAt handles edge case with invalid nextToken gracefully', async () => {
    const invalidNextToken = 'invalid-base64-token';

    await expect(
      listWorkflowsByUpdatedAt(TABLE_NAME, userId, {
        nextToken: invalidNextToken,
      })
    ).rejects.toThrow();
  });

  it('listWorkflowsByCreatedAt handles edge case with invalid nextToken gracefully', async () => {
    const invalidNextToken = 'invalid-base64-token';

    await expect(
      listWorkflowsByCreatedAt(TABLE_NAME, userId, {
        nextToken: invalidNextToken,
      })
    ).rejects.toThrow();
  });
});
