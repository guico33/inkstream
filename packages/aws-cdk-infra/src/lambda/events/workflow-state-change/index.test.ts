import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBridgeEvent } from 'aws-lambda';
import * as workflowStateUtils from '../../../utils/workflow-state';

// Mock the workflow-state module
vi.mock('../../../utils/workflow-state');

describe('workflow-state-change Lambda', () => {
  let handler: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up environment variables
    vi.stubEnv('USER_WORKFLOWS_TABLE', 'test-workflows-table');

    // Import handler after env vars are set
    handler = (await import('./index.js')).handler;

    // Mock the updateWorkflowStatus function
    vi.spyOn(workflowStateUtils, 'updateWorkflowStatus').mockResolvedValue(
      undefined
    );
  });

  const createMockEvent = (
    status: string,
    workflowId = 'test-workflow-id',
    userId = 'test-user-id',
    error?: string,
    cause?: string
  ): EventBridgeEvent<string, any> => ({
    version: '0',
    id: 'event-id',
    'detail-type': 'Step Functions Execution Status Change',
    source: 'aws.states',
    account: '123456789012',
    time: '2024-01-01T00:00:00Z',
    region: 'us-east-1',
    resources: [],
    detail: {
      executionArn: `arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:${workflowId}`,
      stateMachineArn:
        'arn:aws:states:us-east-1:123456789012:stateMachine:TestStateMachine',
      name: workflowId,
      status,
      startDate: Date.now(),
      stopDate: Date.now(),
      input: JSON.stringify({ userId, originalFileKey: 'test-file.pdf' }),
      output: JSON.stringify({ result: 'success' }),
      error,
      cause,
    },
  });

  it('ignores SUCCEEDED status as it is handled by step lambdas', async () => {
    const event = createMockEvent('SUCCEEDED');

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });

  it('ignores FAILED status as it is handled by step lambdas', async () => {
    const event = createMockEvent(
      'FAILED',
      'test-workflow-id',
      'test-user-id',
      'ValidationError',
      'Input validation failed'
    );

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });

  it('updates workflow status to TIMED_OUT for timed out execution', async () => {
    const event = createMockEvent('TIMED_OUT');

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).toHaveBeenCalledWith(
      'test-workflows-table',
      'test-user-id',
      'arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:test-workflow-id',
      'TIMED_OUT',
      {
        error: 'Workflow timed out',
        cause: 'Step Functions execution exceeded timeout limit',
      }
    );
  });

  it('updates workflow status to FAILED for aborted execution', async () => {
    const event = createMockEvent('ABORTED');

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).toHaveBeenCalledWith(
      'test-workflows-table',
      'test-user-id',
      'arn:aws:states:us-east-1:123456789012:execution:TestStateMachine:test-workflow-id',
      'FAILED',
      {
        error: 'Workflow aborted',
        cause: 'Step Functions execution was manually stopped',
      }
    );
  });

  it('ignores non-terminal states', async () => {
    const event = createMockEvent('RUNNING');

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });

  it('handles missing userId gracefully', async () => {
    const event = createMockEvent('FAILED');
    event.detail.input = JSON.stringify({ otherField: 'value' }); // No userId

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });

  it('handles invalid JSON input gracefully', async () => {
    const event = createMockEvent('FAILED');
    event.detail.input = 'invalid-json{';

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });

  it('handles missing input gracefully', async () => {
    const event = createMockEvent('FAILED');
    delete event.detail.input;

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });

  it('does not throw when updateWorkflowStatus fails', async () => {
    const event = createMockEvent('TIMED_OUT');

    vi.spyOn(workflowStateUtils, 'updateWorkflowStatus').mockRejectedValue(
      new Error('DynamoDB error')
    );

    // Should not throw
    await expect(handler(event)).resolves.toBeUndefined();
  });

  it('ignores non-terminal statuses like RUNNING', async () => {
    const event = createMockEvent('RUNNING');

    await handler(event);

    expect(workflowStateUtils.updateWorkflowStatus).not.toHaveBeenCalled();
  });
});
