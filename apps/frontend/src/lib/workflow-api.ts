import type {
  GetWorkflowStatusParams,
  StartWorkflowParams,
  StartWorkflowResponse,
  WorkflowStatusResponse,
} from '@inkstream/shared';
import { ENV } from './constants'; // Updated import path for ENV

/**
 * Calls the backend API to start the Inkstream Step Functions workflow.
 */
export async function startInkstreamWorkflow({
  filename,
  doTranslate = false,
  doSpeech = false,
  targetLanguage = 'english',
}: Omit<StartWorkflowParams, 'idToken'> & {
  idToken?: string;
}): Promise<StartWorkflowResponse> {
  const endpoint = `${ENV.API_ENDPOINT_URL}/workflow/start`;

  console.log('[WorkflowAPI] Starting workflow for file:', {
    filename,
    doTranslate,
    doSpeech,
    targetLanguage,
  });

  // Get the current ID token for authentication
  const { authService } = await import('./auth/auth-service');
  const idToken = await authService.getIdToken();

  if (!idToken) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      filename,
      doTranslate,
      doSpeech,
      targetLanguage,
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
  workflowId,
}: GetWorkflowStatusParams): Promise<WorkflowStatusResponse> {
  const endpoint = `${ENV.API_ENDPOINT_URL}/workflow/${encodeURIComponent(
    workflowId
  )}`;

  console.log('[WorkflowAPI] Getting status for workflow:', workflowId);

  // Get the current ID token for authentication
  const { authService } = await import('./auth/auth-service');
  const idToken = await authService.getIdToken();

  if (!idToken) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

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
