import { WorkflowRecord } from '@inkstream/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  combineWorkflowDetails,
  getStepFunctionsExecutionDetails,
  StepFunctionsExecutionDetails,
} from '../workflow-utils';
import { DescribeExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';

// Use vi.hoisted to ensure mocks are available before any imports
const { mockSfnSend, mockDescribeExecutionCommand } = vi.hoisted(() => {
  const mockSfnSend = vi.fn();
  const mockDescribeExecutionCommand = vi.fn();

  return {
    mockSfnSend,
    mockDescribeExecutionCommand,
  };
});

// Mock SFN Client
vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn().mockImplementation(() => ({
    send: mockSfnSend,
  })),
  DescribeExecutionCommand: mockDescribeExecutionCommand,
}));

describe('Workflow Utils Tests', () => {
  describe('combineWorkflowStatus', () => {
    const mockWorkflowRecord: WorkflowRecord = {
      userId: 'user-123',
      workflowId: 'wf-123',
      status: 'STARTING',
      statusHistory: [
        {
          status: 'STARTING',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      ],
      parameters: { doTranslate: true, targetLanguage: 'es' },
      s3Paths: { originalFile: 'test.pdf' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:30:00.000Z',
      error: undefined,
    };

    it('returns base status when execution details are null', () => {
      const result = combineWorkflowDetails(mockWorkflowRecord, null);

      expect(result).toEqual(mockWorkflowRecord);
    });

    it('combines workflow record with execution details when available', () => {
      const executionDetails: StepFunctionsExecutionDetails = {
        status: 'SUCCEEDED',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T01:00:00.000Z'),
        error: undefined,
        cause: undefined,
      };

      const result = combineWorkflowDetails(
        mockWorkflowRecord,
        executionDetails
      );

      expect(result).toEqual({
        ...mockWorkflowRecord,
        error: undefined,
        execution: {
          status: 'SUCCEEDED',
          startDate: '2024-01-01T00:00:00.000Z',
          stopDate: '2024-01-01T01:00:00.000Z',
          error: undefined,
          cause: undefined,
        },
      });
    });

    it('prefers Step Functions error details when execution has error', () => {
      const workflowWithError: WorkflowRecord = {
        ...mockWorkflowRecord,
        status: 'FAILED',
        error: 'DynamoDB error',
      };

      const executionDetails: StepFunctionsExecutionDetails = {
        status: 'FAILED',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T00:30:00.000Z'),
        error: 'ValidationError',
        cause: 'Input validation failed',
      };

      const result = combineWorkflowDetails(
        workflowWithError,
        executionDetails
      );

      expect(result).toEqual({
        ...workflowWithError,
        error: 'ValidationError', // Overridden by Step Functions error
        cause: 'Input validation failed',
        execution: {
          status: 'FAILED',
          startDate: '2024-01-01T00:00:00.000Z',
          stopDate: '2024-01-01T00:30:00.000Z',
          error: 'ValidationError',
          cause: 'Input validation failed',
        },
      });
    });

    it('handles empty parameters and s3Paths', () => {
      const workflowWithEmptyFields: WorkflowRecord = {
        userId: 'user-123',
        workflowId: 'wf-123',
        status: 'STARTING',
        statusHistory: [
          {
            status: 'STARTING',
            timestamp: '2024-01-01T00:00:00.000Z',
          },
        ],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const result = combineWorkflowDetails(workflowWithEmptyFields, null);

      expect(result).toEqual(workflowWithEmptyFields);
    });
  });

  describe('getStepFunctionsExecutionDetails', () => {
    const testExecutionArn =
      'arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution';

    const sfnClient = new SFNClient({});

    it('returns execution details when successful', async () => {
      const mockResponse = {
        status: 'SUCCEEDED',
        input: '{"key": "value"}',
        output: '{"result": "success"}',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T01:00:00.000Z'),
      };

      mockSfnSend.mockResolvedValue(mockResponse);

      const result = await getStepFunctionsExecutionDetails(
        sfnClient,
        testExecutionArn
      );

      expect(mockSfnSend).toHaveBeenCalledWith(
        expect.any(DescribeExecutionCommand)
      );
      expect(result).toEqual({
        status: 'SUCCEEDED',
        input: { key: 'value' },
        output: { result: 'success' },
        error: undefined,
        cause: undefined,
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T01:00:00.000Z'),
      });
    });

    it('returns execution details with error information when execution failed', async () => {
      const mockResponse = {
        status: 'FAILED',
        input: '{"key": "value"}',
        error: 'ValidationError',
        cause: 'Input validation failed',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T00:30:00.000Z'),
      };

      mockSfnSend.mockResolvedValue(mockResponse);

      const result = await getStepFunctionsExecutionDetails(
        sfnClient,
        testExecutionArn
      );

      expect(result).toEqual({
        status: 'FAILED',
        input: { key: 'value' },
        output: undefined,
        error: 'ValidationError',
        cause: 'Input validation failed',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T00:30:00.000Z'),
      });
    });

    it('handles invalid JSON in input/output gracefully', async () => {
      const mockResponse = {
        status: 'SUCCEEDED',
        input: 'invalid-json{',
        output: 'invalid-json}',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockSfnSend.mockResolvedValue(mockResponse);

      const result = await getStepFunctionsExecutionDetails(
        sfnClient,
        testExecutionArn
      );

      expect(result).toEqual({
        status: 'SUCCEEDED',
        input: undefined,
        output: undefined,
        error: undefined,
        cause: undefined,
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: undefined,
      });
    });

    it('returns null when SFN call fails', async () => {
      mockSfnSend.mockRejectedValue(new Error('SFN service error'));

      const result = await getStepFunctionsExecutionDetails(
        sfnClient,
        testExecutionArn
      );

      expect(result).toBeNull();
    });

    it('handles missing input/output fields', async () => {
      const mockResponse = {
        status: 'RUNNING',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockSfnSend.mockResolvedValue(mockResponse);

      const result = await getStepFunctionsExecutionDetails(
        sfnClient,
        testExecutionArn
      );

      expect(result).toEqual({
        status: 'RUNNING',
        input: undefined,
        output: undefined,
        error: undefined,
        cause: undefined,
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: undefined,
      });
    });
  });
});
