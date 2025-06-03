import { APIGatewayProxyEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalServiceError, ValidationError } from '../../../errors';

// Use vi.hoisted to ensure mocks are available before any imports
const { mockSfnSend, mockDescribeExecutionCommand, mockGetWorkflow } =
  vi.hoisted(() => {
    const mockSfnSend = vi.fn();
    const mockDescribeExecutionCommand = vi.fn();
    const mockGetWorkflow = vi.fn();

    return {
      mockSfnSend,
      mockDescribeExecutionCommand,
      mockGetWorkflow,
    };
  });

// Mock SFN Client
vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn().mockImplementation(() => ({
    send: mockSfnSend,
  })),
  DescribeExecutionCommand: mockDescribeExecutionCommand,
}));

// Mock workflow state utils
vi.mock('../../../utils/user-workflows-db-utils', () => ({
  getWorkflow: mockGetWorkflow,
}));

import { extractWorkflowId, getWorkflowFromDatabase } from './utils';

describe('workflow utility functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractWorkflowId', () => {
    it('extracts workflowId from valid path parameters', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          workflowId: 'wf-123',
        },
      };

      const result = extractWorkflowId(event as APIGatewayProxyEvent);
      expect(result).toBe('wf-123');
    });

    it('throws ValidationError when pathParameters is null', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: null,
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'workflowId is required as path parameter'
      );
    });

    it('throws ValidationError when workflowId is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          otherParam: 'value',
        },
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'workflowId is required as path parameter'
      );
    });

    it('throws ValidationError when workflowId is empty string', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          workflowId: '',
        },
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid path parameters: workflowId: workflowId cannot be empty'
      );
    });

    it('throws ValidationError when workflowId is not a string', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          workflowId: null as any,
        },
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
    });

    it('handles Zod validation errors with multiple error messages', () => {
      // Create a spy on the PathParametersSchema.parse method
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          workflowId: null as any,
        },
      };

      // The function should handle the Zod error and convert it to ValidationError
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid path parameters'
      );
    });
  });

  describe('getWorkflowFromDatabase', () => {
    it('returns workflow record when found', async () => {
      const mockWorkflow = {
        userId: 'user-123',
        workflowId: 'wf-123',
        status: 'SUCCEEDED',
        parameters: { doTranslate: true },
        s3Paths: { originalFile: 'test.pdf' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T01:00:00.000Z',
      };

      mockGetWorkflow.mockResolvedValue(mockWorkflow);

      const result = await getWorkflowFromDatabase(
        'test-table',
        'user-123',
        'wf-123'
      );

      expect(mockGetWorkflow).toHaveBeenCalledWith(
        'test-table',
        'user-123',
        'wf-123'
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('returns undefined when workflow not found', async () => {
      mockGetWorkflow.mockResolvedValue(undefined);

      const result = await getWorkflowFromDatabase(
        'test-table',
        'user-123',
        'wf-123'
      );

      expect(result).toBeUndefined();
    });

    it('throws ExternalServiceError when DynamoDB call fails', async () => {
      const dynamoError = new Error('DynamoDB connection failed');
      mockGetWorkflow.mockRejectedValue(dynamoError);

      await expect(
        getWorkflowFromDatabase('test-table', 'user-123', 'wf-123')
      ).rejects.toThrow(ExternalServiceError);

      try {
        await getWorkflowFromDatabase('test-table', 'user-123', 'wf-123');
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toBe(
          '[DynamoDB] Failed to retrieve workflow from DynamoDB: DynamoDB connection failed'
        );
        expect((error as ExternalServiceError).service).toBe('DynamoDB');
        expect((error as ExternalServiceError).cause).toBe(dynamoError);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockGetWorkflow.mockRejectedValue('string error');

      await expect(
        getWorkflowFromDatabase('test-table', 'user-123', 'wf-123')
      ).rejects.toThrow(ExternalServiceError);

      try {
        await getWorkflowFromDatabase('test-table', 'user-123', 'wf-123');
      } catch (error) {
        expect(error).toBeInstanceOf(ExternalServiceError);
        expect((error as ExternalServiceError).message).toBe(
          '[DynamoDB] Failed to retrieve workflow from DynamoDB: string error'
        );
      }
    });
  });
});
