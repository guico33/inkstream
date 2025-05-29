import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  createWorkflow,
  getWorkflow,
  updateWorkflowStatus,
  listWorkflows,
  WorkflowRecord,
} from '../workflow-state';

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
    expect(result).toEqual([
      expect.objectContaining({ workflowId: 'wf-1' }),
      expect.objectContaining({ workflowId: 'wf-2' }),
    ]);
  });
});
