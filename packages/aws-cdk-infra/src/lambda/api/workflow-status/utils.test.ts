import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';
import { ValidationError, ExternalServiceError } from '../../../errors';

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
vi.mock('../../../utils/workflow-state', () => ({
  getWorkflow: mockGetWorkflow,
}));

import { DescribeExecutionCommand } from '@aws-sdk/client-sfn';
import {
  getStepFunctionsExecutionDetails,
  combineWorkflowStatus,
  extractWorkflowId,
  extractUserId,
  getWorkflowFromDatabase,
  handleError,
  StepFunctionsExecutionDetails,
} from './utils';
import { WorkflowRecord } from '../../../utils/workflow-state';

describe('workflow-status utility functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getStepFunctionsExecutionDetails', () => {
    const testExecutionArn =
      'arn:aws:states:us-east-1:123456789012:execution:MyStateMachine:test-execution';

    it('returns execution details when successful', async () => {
      const mockResponse = {
        status: 'SUCCEEDED',
        input: '{"key": "value"}',
        output: '{"result": "success"}',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        stopDate: new Date('2024-01-01T01:00:00.000Z'),
      };

      mockSfnSend.mockResolvedValue(mockResponse);

      const result = await getStepFunctionsExecutionDetails(testExecutionArn);

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

      const result = await getStepFunctionsExecutionDetails(testExecutionArn);

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

      const result = await getStepFunctionsExecutionDetails(testExecutionArn);

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

      const result = await getStepFunctionsExecutionDetails(testExecutionArn);

      expect(result).toBeNull();
    });

    it('handles missing input/output fields', async () => {
      const mockResponse = {
        status: 'RUNNING',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
      };

      mockSfnSend.mockResolvedValue(mockResponse);

      const result = await getStepFunctionsExecutionDetails(testExecutionArn);

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
      const result = combineWorkflowStatus(mockWorkflowRecord, null);

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

      const result = combineWorkflowStatus(
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

      const result = combineWorkflowStatus(workflowWithError, executionDetails);

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

      const result = combineWorkflowStatus(workflowWithEmptyFields, null);

      expect(result).toEqual(workflowWithEmptyFields);
    });
  });

  describe('extractWorkflowId', () => {
    it('extracts workflowId from valid query parameters', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          workflowId: 'wf-123',
        },
      };

      const result = extractWorkflowId(event as APIGatewayProxyEvent);
      expect(result).toBe('wf-123');
    });

    it('throws ValidationError when queryStringParameters is null', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: null,
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'workflowId is required as query parameter'
      );
    });

    it('throws ValidationError when workflowId is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          otherParam: 'value',
        },
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'workflowId is required as query parameter'
      );
    });

    it('throws ValidationError when workflowId is empty string', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          workflowId: '',
        },
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid query parameters: workflowId: workflowId cannot be empty'
      );
    });

    it('throws ValidationError when workflowId is not a string', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          workflowId: null as any,
        },
      };

      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
    });

    it('handles Zod validation errors with multiple error messages', () => {
      // Create a spy on the QueryParametersSchema.parse method
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          workflowId: null as any,
        },
      };

      // The function should handle the Zod error and convert it to ValidationError
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractWorkflowId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid query parameters'
      );
    });
  });

  describe('extractUserId', () => {
    it('extracts userId from valid JWT claims', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: 'user-123',
              },
            },
          },
        } as any,
      };

      const result = extractUserId(event as APIGatewayProxyEvent);
      expect(result).toBe('user-123');
    });

    it('throws ValidationError when requestContext is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {};

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when authorizer is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {} as any,
      };

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when jwt is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {},
        } as any,
      };

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when claims is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            jwt: {},
          },
        } as any,
      };

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when sub is missing', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                other: 'value',
              },
            },
          },
        } as any,
      };

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when sub is not a string', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: 123,
              },
            },
          },
        } as any,
      };

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when sub is empty string', () => {
      const event: Partial<APIGatewayProxyEvent> = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: '',
              },
            },
          },
        } as any,
      };

      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        ValidationError
      );
      expect(() => extractUserId(event as APIGatewayProxyEvent)).toThrow(
        'Invalid or missing userId in JWT claims'
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

  describe('handleError', () => {
    it('handles ValidationError with 400 status', () => {
      const error = new ValidationError('Invalid input parameter');

      const result = handleError(error);

      expect(result).toEqual({
        statusCode: 400,
        body: JSON.stringify({
          message: 'Validation error',
          error: 'Invalid input parameter',
        }),
      });
    });

    it('handles ZodError with 400 status and formatted messages', () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['workflowId'],
          message: 'Expected string, received number',
        },
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['userId'],
          message: 'String must contain at least 1 character(s)',
        },
      ]);

      const result = handleError(zodError);

      expect(result).toEqual({
        statusCode: 400,
        body: JSON.stringify({
          message: 'Environment configuration error',
          error:
            'workflowId: Expected string, received number, userId: String must contain at least 1 character(s)',
        }),
      });
    });

    it('handles ExternalServiceError with 500 status', () => {
      const error = new ExternalServiceError(
        'DynamoDB operation failed',
        'DynamoDB'
      );

      const result = handleError(error);

      expect(result).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to get workflow status',
          error: '[DynamoDB] DynamoDB operation failed',
        }),
      });
    });

    it('handles generic Error with 500 status', () => {
      const error = new Error('Unexpected error occurred');

      const result = handleError(error);

      expect(result).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to get workflow status',
          error: 'Unexpected error occurred',
        }),
      });
    });

    it('handles non-Error exceptions with 500 status', () => {
      const error = 'String error';

      const result = handleError(error);

      expect(result).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to get workflow status',
          error: 'Unknown error',
        }),
      });
    });

    it('handles null/undefined errors', () => {
      const result1 = handleError(null);
      const result2 = handleError(undefined);

      expect(result1).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to get workflow status',
          error: 'Unknown error',
        }),
      });

      expect(result2).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to get workflow status',
          error: 'Unknown error',
        }),
      });
    });

    it('handles object errors without message', () => {
      const error = { code: 'SOME_ERROR', details: 'Complex error object' };

      const result = handleError(error);

      expect(result).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to get workflow status',
          error: 'Unknown error',
        }),
      });
    });
  });
});
