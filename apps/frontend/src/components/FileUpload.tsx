// S3FileUpload.tsx
// React component for uploading files to S3 using Cognito credentials.
// Uses shadcn/ui components for a modern UI and displays upload status.
// Integrates with FileProcessingContext to manage the end-to-end workflow.

import { useRef, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useAuth } from '@/lib/contexts/auth-context';
import { useFileProcessing } from '@/lib/contexts/file-processing-context'; // Import the context hook
import { getWorkflowDisplayInfo } from '@/lib/display'; // Import the new display function
import { FileDownload } from './FileDownload'; // Import the new download component

export function S3FileUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const {
    selectFile,
    processSelectedFile,
    resetProcessing,
    selectedFile,
    processingStatus,
    uploadProgress,
    errorMessage,
    workflowStatusDetails,
    s3Data,
    workflowData,
  } = useFileProcessing(); // Use the context

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    selectFile(file);
  };

  const handleUpload = async () => {
    if (selectedFile) {
      await processSelectedFile();
    }
  };

  const handleReset = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the file input
    }
    resetProcessing();
  };

  // Effect to clear file input if selectedFile becomes null from context (e.g. after reset)
  useEffect(() => {
    if (!selectedFile && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [selectedFile]);

  if (!user) {
    return (
      <div className="mt-8 text-gray-600 dark:text-gray-300">
        Please sign in to upload and process files.
      </div>
    );
  }

  const isProcessing = [
    'uploading',
    'starting_workflow',
    'workflow_running',
  ].includes(processingStatus);

  // Use the new utility function to get status message and color
  const { statusMessage, messageColor } = getWorkflowDisplayInfo({
    processingStatus,
    errorMessage,
    selectedFile,
    workflowStatusDetails,
    s3Data,
  });

  return (
    <div className="flex flex-col gap-4 items-start w-full max-w-md mt-8 p-6 border rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Process Your File</h2>
      <label htmlFor="file-upload" className="font-medium">
        1. Select a file
      </label>
      <Input
        id="file-upload"
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={isProcessing}
        className="w-full cursor-pointer"
        accept=".pdf,.jpg,.jpeg,.png,.txt" // Add more file types as needed
      />

      {selectedFile && (
        <Button
          onClick={handleUpload}
          disabled={isProcessing || !selectedFile}
          className="w-full mt-2 hover:cursor-pointer disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Processing...' : '2. Upload and Start Workflow'}
        </Button>
      )}

      {((processingStatus !== 'idle' && processingStatus !== 'selecting') ||
        errorMessage) && (
        <Button
          onClick={handleReset}
          variant="outline"
          className="w-full mt-2"
          disabled={
            processingStatus === 'uploading' ||
            processingStatus === 'starting_workflow'
          }
        >
          Reset / Clear
        </Button>
      )}

      {(processingStatus === 'uploading' ||
        (isProcessing && uploadProgress > 0)) && (
        <div className="w-full mt-2">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-sm text-center mt-1">{uploadProgress}% uploaded</p>
        </div>
      )}

      {statusMessage && (
        <div
          className={`mt-4 text-sm p-3 border rounded-md w-full ${
            messageColor.includes('red')
              ? 'border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900'
              : messageColor.includes('green')
              ? 'border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900'
              : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
          }`}
        >
          <p className={messageColor}>{statusMessage}</p>
          {workflowData?.workflowId && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">
              Workflow ID: {workflowData.workflowId}
            </p>
          )}
        </div>
      )}

      {/* Show download component when workflow is completed successfully */}
      {processingStatus === 'workflow_succeeded' &&
        workflowStatusDetails &&
        workflowStatusDetails.status === 'SUCCEEDED' && (
          <FileDownload workflowStatus={workflowStatusDetails} />
        )}
    </div>
  );
}
