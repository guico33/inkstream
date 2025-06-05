// Types related to workflow processing and state management

import { workflowStatusCategories, workflowStatuses } from './constants';

export type WorkflowStatus = (typeof workflowStatuses)[number];

export interface WorkflowParameters {
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
}

export type S3PathOutputFileKey =
  | 'formattedText'
  | 'translatedText'
  | 'audioFile';

export type WorkflowS3Paths = {
  originalFile: string;
} & {
  [key in S3PathOutputFileKey]?: string;
};

export interface WorkflowStatusHistoryEntry {
  status: WorkflowStatus;
  timestamp: string;
  error?: string;
}

export interface WorkflowRecord {
  userId: string;
  workflowId: string;
  status: WorkflowStatus;
  statusCategory: WorkflowStatusCategory;
  statusCategoryCreatedAt: string;
  statusHistory: WorkflowStatusHistoryEntry[];
  parameters?: WorkflowParameters;
  s3Paths: WorkflowS3Paths;
  createdAt: string;
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

export type WorkflowStatusCategory = (typeof workflowStatusCategories)[number];

export type OutputFileType = 'formatted' | 'translated' | 'audio';
