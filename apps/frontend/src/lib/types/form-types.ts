// Types for dashboard components to ensure type safety
// Provides strongly typed interfaces for workflow data

import { type WorkflowResponse, type WorkflowStatus } from '@inkstream/shared';

// Extended workflow interface for dashboard use
export interface DashboardWorkflow extends WorkflowResponse {
  createdAt: string;
  updatedAt?: string;
  status: WorkflowStatus;
  s3Data?: {
    formattedTextKey?: string;
    translatedTextKey?: string;
    audioFileKey?: string;
  };
}

// Form data for workflow parameters
export interface WorkflowFormData {
  doTranslate: boolean;
  doSpeech: boolean;
  targetLanguage: string;
}
