// Types related to workflow processing and state management

import { workflowStatuses } from './constants';

export type WorkflowStatus = (typeof workflowStatuses)[number];

export interface WorkflowParameters {
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
}

export interface WorkflowS3Paths {
  originalFile: string;
  formattedText?: string;
  translatedText?: string;
  audioFile?: string;
}

export interface WorkflowStatusHistoryEntry {
  status: WorkflowStatus;
  timestamp: string;
  error?: string;
}

export interface WorkflowRecord {
  userId: string;
  workflowId: string;
  status: WorkflowStatus;
  statusHistory: WorkflowStatusHistoryEntry[];
  parameters?: WorkflowParameters;
  s3Paths?: WorkflowS3Paths;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
}

// Type for workflow common state passed between Step Functions
export type WorkflowCommonState = {
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
  storageBucket: string;
  originalFileKey: string;
  userId: string;
  timestamp: number;
};
