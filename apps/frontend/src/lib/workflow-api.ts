// apps/frontend/src/lib/workflow-api.ts
import { ENV } from './constants'; // Updated import path for ENV
import type {
  StartWorkflowParams,
  StartWorkflowResponse,
  GetWorkflowStatusParams,
  WorkflowStatusResponse,
} from './types/api-types'; // Updated import path for API types

/**
 * Calls the backend API to start the Inkstream Step Functions workflow.
 */
export async function startInkstreamWorkflow({
  bucket,
  key,
  idToken,
}: StartWorkflowParams): Promise<StartWorkflowResponse> {
  // Ensure ENV.API_ENDPOINT_URL is defined in your env.ts and includes the base URL of your API Gateway
  const endpoint = `${ENV.API_ENDPOINT_URL}/workflow/start`; // Changed path

  console.log('[WorkflowAPI] Starting workflow for S3 object:', {
    bucket,
    key,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Assuming your API Gateway authorizer uses Bearer token
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      bucket, // The S3 bucket name
      key, // The S3 object key
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      '[WorkflowAPI] Failed to start workflow:',
      response.status,
      errorBody
    );
    throw new Error(
      `Failed to start workflow: ${response.status} ${errorBody}`
    );
  }

  const data: StartWorkflowResponse = await response.json();
  console.log('[WorkflowAPI] Workflow started successfully:', data);
  return data;
}

// --- New code for workflow status ---

/**
 * Calls the backend API to get the status of a Step Functions workflow execution.
 */
export async function getInkstreamWorkflowStatus({
  executionArn,
  idToken,
}: GetWorkflowStatusParams): Promise<WorkflowStatusResponse> {
  const endpoint = `${ENV.API_ENDPOINT_URL}/workflow/status`; // Changed path

  console.log('[WorkflowAPI] Getting status for execution:', executionArn);

  const response = await fetch(
    `${endpoint}?executionArn=${encodeURIComponent(executionArn)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      '[WorkflowAPI] Failed to get workflow status:',
      response.status,
      errorBody
    );
    throw new Error(
      `Failed to get workflow status: ${response.status} ${errorBody}`
    );
  }

  const data: WorkflowStatusResponse = await response.json();
  console.log('[WorkflowAPI] Workflow status received:', data);
  return data;
}
