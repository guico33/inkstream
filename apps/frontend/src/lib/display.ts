import type { User } from './types/user-types';
import type { ProcessingStatus } from './types/file-processing-types';

export interface WorkflowOutputData {
  // Define the structure of your expected workflow output here
  // For example:
  // extractedText?: string;
  // translatedText?: string;
  // audioFileUrl?: string;
  [key: string]: unknown; // Allows for other properties, but be more specific if possible
}

export interface WorkflowStatusDetails {
  status?: string;
  output?: WorkflowOutputData | string; // string for cases where output might be a simple message
  error?: string;
  cause?: string;
}

interface S3Data {
  key: string;
  // Add other S3 data properties if needed
}

interface WorkflowStatusDisplayOptions {
  processingStatus: ProcessingStatus;
  errorMessage?: string | null;
  selectedFile?: File | null;
  workflowStatusDetails?: WorkflowStatusDetails | null;
  s3Data?: S3Data | null;
}

interface WorkflowDisplayResult {
  statusMessage: string;
  messageColor: string;
}

export const getUserDisplayName = (user: User | null) => {
  if (!user) {
    return '';
  }

  if (user.name && user.name !== 'undefined') {
    return user.name;
  } else if (user.given_name && user.family_name) {
    return `${user.given_name} ${user.family_name}`;
  } else if (user.given_name) {
    return user.given_name;
  } else {
    return user.email || '';
  }
};

export function getWorkflowDisplayInfo(
  options: WorkflowStatusDisplayOptions
): WorkflowDisplayResult {
  const {
    processingStatus,
    errorMessage,
    selectedFile,
    workflowStatusDetails,
    s3Data,
  } = options;

  let statusMessage = '';
  let messageColor = 'text-gray-600 dark:text-gray-300';

  if (errorMessage) {
    statusMessage = `Error: ${errorMessage}`;
    messageColor = 'text-red-600 dark:text-red-400';
  } else {
    switch (processingStatus) {
      case 'idle':
        statusMessage = 'Select a file to begin.';
        break;
      case 'selecting':
        statusMessage = selectedFile
          ? `Selected: ${selectedFile.name}`
          : 'Select a file.';
        break;
      case 'uploading':
        statusMessage = `Uploading: ${selectedFile?.name}...`;
        break;
      case 'starting_workflow':
        statusMessage = 'Starting workflow...';
        break;
      case 'workflow_running':
        statusMessage = `Processing: ${
          workflowStatusDetails?.status || 'Running'
        }`;
        if (workflowStatusDetails?.status === 'RUNNING' && s3Data?.key) {
          statusMessage += ` (File: ${s3Data.key.split('/').pop()})`;
        }
        break;
      case 'workflow_succeeded':
        statusMessage = 'Workflow completed successfully!';
        messageColor = 'text-green-600 dark:text-green-400';
        break;
      case 'workflow_failed':
        statusMessage = `Workflow failed: ${
          workflowStatusDetails?.error || 'Unknown error'
        }`;
        if (workflowStatusDetails?.cause) {
          statusMessage += ` Cause: ${workflowStatusDetails.cause}`;
        }
        messageColor = 'text-red-600 dark:text-red-400';
        break;
      default: {
        // Added braces for the default case
        const exhaustiveCheck: never = processingStatus; // This will now correctly error if a case is missed
        statusMessage = 'Ready.';
        console.warn(`Unhandled processing status: ${exhaustiveCheck}`);
        break;
      }
    }
  }
  return { statusMessage, messageColor };
}
