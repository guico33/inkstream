// apps/frontend/src/lib/types/api-types.ts
// Types related to API interactions, specifically for the workflow service.

export interface StartWorkflowParams {
  bucket: string;
  key: string;
  idToken: string;
}

export interface StartWorkflowResponse {
  executionArn: string;
  startDate: string; // Or Date, depending on how your API returns it
  // Add other relevant fields from your API response if any (e.g., initial status)
}

export interface GetWorkflowStatusParams {
  executionArn: string;
  idToken: string;
}

export interface WorkflowStatusResponse {
  executionArn: string;
  status: string; // e.g., 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'ABORTED'
  startDate: string; // ISO 8601 string
  stopDate?: string; // ISO 8601 string, present if terminal
  output?: string; // JSON string of the output, present if SUCCEEDED
  error?: string; // Error name, present if FAILED
  cause?: string; // Error cause, present if FAILED
  // Add any other fields your /workflow-status endpoint returns
}
