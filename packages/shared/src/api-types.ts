// Types related to API interactions, specifically for the workflow service.
import type { WorkflowRecord } from './workflow-types.js';

// Start Workflow API - matches backend implementation
export interface StartWorkflowParams {
  filename: string;
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
}

export interface StartWorkflowResponse {
  message: string;
  workflowId: string;
}

// Workflow Status API - matches backend implementation
export interface GetWorkflowParams {
  workflowId: string;
}

export interface WorkflowStatusResponse extends WorkflowRecord {
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
