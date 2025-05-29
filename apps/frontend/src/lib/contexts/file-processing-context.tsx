import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { uploadFileToS3 } from '../aws-s3';
import { useAuth } from './auth-context';
import {
  getInkstreamWorkflowStatus,
  startInkstreamWorkflow,
} from '../workflow-api';
import { POLLING_INTERVAL } from '../constants';
import type {
  StartWorkflowResponse,
  WorkflowStatusResponse,
} from '../types/api-types'; // Combined import
import type { ProcessingStatus } from '../types/file-processing-types'; // Added import

interface FileProcessingState {
  selectedFile: File | null;
  uploadProgress: number;
  s3Data: { bucket: string; key: string } | null;
  workflowData: StartWorkflowResponse | null;
  processingStatus: ProcessingStatus; // Changed to use imported type
  errorMessage: string | null;
  workflowStatusDetails: WorkflowStatusResponse | null;
}

interface FileProcessingContextType extends FileProcessingState {
  selectFile: (file: File | null) => void;
  processSelectedFile: () => Promise<void>;
  resetProcessing: () => void;
}

const FileProcessingContext = createContext<
  FileProcessingContextType | undefined
>(undefined);

const initialState: FileProcessingState = {
  selectedFile: null,
  uploadProgress: 0,
  s3Data: null,
  workflowData: null,
  processingStatus: 'idle',
  errorMessage: null,
  workflowStatusDetails: null,
};

// Define the provider component
interface FileProcessingProviderProps {
  children: ReactNode;
}

export function FileProcessingProvider({
  children,
}: FileProcessingProviderProps) {
  const [state, setState] = useState<FileProcessingState>(initialState);
  const { user, getIdToken } = useAuth();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      console.log('[FileProcessingContext] Polling cleared.');
    }
  }, []);

  const selectFile = useCallback(
    (file: File | null) => {
      clearPolling();
      setState({
        ...initialState,
        selectedFile: file,
        processingStatus: file ? 'selecting' : 'idle',
      });
    },
    [clearPolling]
  );

  const pollWorkflowStatus = useCallback(
    async (executionArn: string, idToken: string) => {
      if (!idToken) {
        console.warn(
          '[FileProcessingContext] No idToken provided for polling attempt.'
        );
        clearPolling();
        setState((prev) => ({
          ...prev,
          processingStatus: 'workflow_failed', // Treat as a failure of the process
          errorMessage:
            'Authentication token missing during status check. Please try again or sign in.',
        }));
        return;
      }
      try {
        console.log(
          '[FileProcessingContext] Polling for status of:',
          executionArn
        );
        const statusResponse = await getInkstreamWorkflowStatus({
          executionArn,
          idToken: idToken,
        });

        setState((prev) => ({
          ...prev,
          workflowStatusDetails: statusResponse,
          errorMessage: null, // Clear previous error on successful poll
        }));

        switch (statusResponse.status) {
          case 'RUNNING':
            setState((prev) => ({
              ...prev,
              processingStatus: 'workflow_running',
            }));
            break;
          case 'SUCCEEDED':
            clearPolling();
            setState((prev) => ({
              ...prev,
              processingStatus: 'workflow_succeeded',
            }));
            console.log(
              '[FileProcessingContext] Workflow succeeded:',
              statusResponse.output
            );
            break;
          case 'FAILED':
          case 'TIMED_OUT':
          case 'ABORTED':
            clearPolling();
            setState((prev) => ({
              ...prev,
              processingStatus: 'workflow_failed',
              errorMessage:
                statusResponse.cause ||
                statusResponse.error ||
                `Workflow ${statusResponse.status.toLowerCase()}`,
            }));
            console.error(
              '[FileProcessingContext] Workflow failed or stopped:',
              statusResponse
            );
            break;
          default:
            console.warn(
              '[FileProcessingContext] Unknown workflow status from API:',
              statusResponse.status
            );
            // Keep polling if status is unknown, or decide on a strategy
            setState((prev) => ({
              ...prev,
              processingStatus: 'workflow_running', // Assume it might still be running
            }));
            break;
        }
      } catch (error) {
        console.error(
          '[FileProcessingContext] Error polling workflow status:',
          error
        );
        // If the error is critical (e.g., auth error), stop polling.
        // Otherwise, the interval will retry.
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('401') || errorMessage.includes('403')) {
          clearPolling();
          setState((prev) => ({
            ...prev,
            processingStatus: 'workflow_failed',
            errorMessage:
              'Authorization error while checking status. Please sign in again.',
          }));
        } else {
          // For other errors, set a general message but let polling continue for a few tries
          // Or implement a max retry / backoff strategy later
          setState((prev) => ({
            ...prev,
            errorMessage,
            // Keep status as 'workflow_running' to allow further polling attempts for transient errors
          }));
        }
      }
    },
    [clearPolling] // `clearPolling` is stable due to its own useCallback
  );

  const processSelectedFile = useCallback(async () => {
    if (!state.selectedFile || !user) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'No file selected or user not authenticated.',
        processingStatus: 'workflow_failed', // Or a more general 'error' state
      }));
      return;
    }

    // Get fresh ID token
    const idToken = await getIdToken();
    if (!idToken) {
      setState((prev) => ({
        ...prev,
        errorMessage: 'Unable to get authentication token.',
        processingStatus: 'workflow_failed',
      }));
      return;
    }

    clearPolling(); // Clear any previous polling

    setState((prev) => ({
      ...prev,
      processingStatus: 'uploading',
      uploadProgress: 0,
      errorMessage: null,
      s3Data: null,
      workflowData: null,
      workflowStatusDetails: null,
    }));

    try {
      const s3UploadResult = await uploadFileToS3({
        file: state.selectedFile,
        user,
      });

      setState((prev) => ({
        ...prev,
        s3Data: s3UploadResult,
        uploadProgress: 100,
        processingStatus: 'starting_workflow',
      }));

      const workflowStartResult = await startInkstreamWorkflow({
        bucket: s3UploadResult.bucket,
        key: s3UploadResult.key,
        idToken: idToken,
      });

      setState((prev) => ({
        ...prev,
        workflowData: workflowStartResult,
        processingStatus: 'workflow_running',
        errorMessage: null,
      }));
      console.log(
        '[FileProcessingContext] Workflow initiated:',
        workflowStartResult
      );

      if (workflowStartResult.executionArn) {
        const arn = workflowStartResult.executionArn;
        const token = idToken; // Capture token at this point for the polling session

        // Initial immediate poll
        pollWorkflowStatus(arn, token);

        pollingIntervalRef.current = setInterval(() => {
          // It's generally better to get the freshest token if possible,
          // but for simplicity in this iteration, we use the token captured at the start of this process.
          // If token expiration becomes an issue during long polling sessions, this needs refinement.
          pollWorkflowStatus(arn, token);
        }, POLLING_INTERVAL);
      } else {
        console.error(
          '[FileProcessingContext] No execution ARN or idToken to start polling.'
        );
        setState((prev) => ({
          ...prev,
          processingStatus: 'workflow_failed',
          errorMessage: 'Failed to get execution details for status polling.',
        }));
      }
    } catch (error) {
      console.error(
        '[FileProcessingContext] Error during file processing:',
        error
      );
      clearPolling(); // Stop polling on general processing error
      setState((prev) => ({
        ...prev,
        errorMessage: error instanceof Error ? error.message : String(error),
        processingStatus: 'workflow_failed',
      }));
    }
  }, [state.selectedFile, user, getIdToken, pollWorkflowStatus, clearPolling]);

  const resetProcessing = useCallback(() => {
    clearPolling();
    setState(initialState);
  }, [clearPolling]);

  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  const contextValue: FileProcessingContextType = {
    ...state,
    selectFile,
    processSelectedFile,
    resetProcessing,
  };

  return (
    <FileProcessingContext.Provider value={contextValue}>
      {children}
    </FileProcessingContext.Provider>
  );
}

// Export the context for use in the separate hook file
export { FileProcessingContext };
