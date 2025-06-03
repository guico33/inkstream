// Types related to API interactions, specifically for the workflow service.
import type { WorkflowRecord, WorkflowStatus } from './workflow-types.js';

// Generic API Gateway Lambda response types
export interface ApiSuccessResponse<T = any> {
  statusCode: 200;
  headers: Record<string, string>;
  body: string; // JSON stringified T
}

export interface ApiGatewayErrorResponse {
  statusCode: 400 | 401 | 403 | 404 | 500;
  headers: Record<string, string>;
  body: string; // JSON stringified error response
}

export type ApiGatewayResponse<T = any> =
  | ApiSuccessResponse<T>
  | ApiGatewayErrorResponse;

// Specific response types for Start Workflow endpoint
export type StartWorkflowSuccessResponse = ApiSuccessResponse<WorkflowResponse>;
export type StartWorkflowErrorResponse = ApiGatewayErrorResponse;
export type StartWorkflowResult =
  | StartWorkflowSuccessResponse
  | StartWorkflowErrorResponse;

// Specific response types for Get Workflow endpoint
export type GetWorkflowSuccessResponse = ApiSuccessResponse<WorkflowResponse>;
export type GetWorkflowErrorResponse = ApiGatewayErrorResponse;
export type GetWorkflowResult =
  | GetWorkflowSuccessResponse
  | GetWorkflowErrorResponse;

// Specific response types for List User Workflows endpoint
export type ListUserWorkflowsSuccessResponse =
  ApiSuccessResponse<ListUserWorkflowsResponse>;
export type ListUserWorkflowsErrorResponse = ApiGatewayErrorResponse;
export type ListUserWorkflowsResult =
  | ListUserWorkflowsSuccessResponse
  | ListUserWorkflowsErrorResponse;

// Start Workflow API - matches backend implementation
export interface StartWorkflowParams {
  filename: string;
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
}

// Workflow Status API - matches backend implementation
export interface GetWorkflowParams {
  workflowId: string;
}

export interface WorkflowResponse extends Omit<WorkflowRecord, 'status'> {
  // Allow status to be more flexible for Step Functions integration
  status: WorkflowStatus;
  // Additional fields that might be added by combineWorkflowStatus
  execution?: {
    status: string;
    startDate?: string;
    stopDate?: string;
    error?: string;
    cause?: string;
  };
  cause?: string; // Additional error context from Step Functions
}

// List User Workflows API - matches backend implementation
export interface ListUserWorkflowsResponse {
  items: WorkflowRecord[];
  nextToken?: string;
}

// Error response type for API endpoints
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode?: number;
}
