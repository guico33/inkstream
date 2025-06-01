// API service layer using axios
// Provides centralized HTTP client with auth integration and error handling

import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { useAuth } from './contexts/auth-context';
import { uploadFileToS3, downloadWorkflowFile } from './aws-s3';
import { ENV } from './constants/env';
import { API_PATHS } from './constants/api-endpoints';
import type { User } from './types/user-types';
import {
  type StartWorkflowParams,
  type StartWorkflowResponse,
  type GetWorkflowParams,
  type WorkflowStatusResponse,
} from '@inkstream/shared';

// Extended params for file upload + workflow start
export interface StartWorkflowWithFileParams {
  file: File;
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
}

// Create axios instance
const createApiClient = (getIdToken: () => Promise<string>): AxiosInstance => {
  const client = axios.create({
    baseURL: ENV.API_ENDPOINT_URL,
    timeout: 30000, // 30 second timeout
  });

  // Request interceptor to add auth token
  client.interceptors.request.use(async (config) => {
    try {
      const token = await getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw error;
    }
    return config;
  });

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      console.error('API Error:', error);
      return Promise.reject(error);
    }
  );

  return client;
};

export class WorkflowApiService {
  private client: AxiosInstance;
  private getUser: () => User | null;

  constructor(getIdToken: () => Promise<string>, getUser: () => User | null) {
    this.client = createApiClient(getIdToken);
    this.getUser = getUser;
  }

  async startWorkflow(
    params: StartWorkflowParams
  ): Promise<StartWorkflowResponse> {
    const response: AxiosResponse<StartWorkflowResponse> =
      await this.client.post(API_PATHS.START_WORKFLOW, params);
    return response.data;
  }

  async startWorkflowWithFile(
    params: StartWorkflowWithFileParams
  ): Promise<StartWorkflowResponse> {
    const user = this.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // First upload file to S3
    const { filename } = await uploadFileToS3({
      file: params.file,
      user,
    });

    // Then start workflow with S3 filename
    const workflowParams: StartWorkflowParams = {
      filename,
      doTranslate: params.doTranslate,
      doSpeech: params.doSpeech,
      targetLanguage: params.targetLanguage,
    };

    return this.startWorkflow(workflowParams);
  }

  async getWorkflow(
    params: GetWorkflowParams
  ): Promise<WorkflowStatusResponse> {
    const response: AxiosResponse<WorkflowStatusResponse> =
      await this.client.get(`${API_PATHS.WORKFLOW}/${params.workflowId}`);
    return response.data;
  }

  async listUserWorkflows(): Promise<WorkflowStatusResponse[]> {
    console.log('API Service: Making request to /user-workflows');
    const response: AxiosResponse<WorkflowStatusResponse[]> =
      await this.client.get(API_PATHS.USER_WORKFLOWS);
    console.log(
      'API Service: Received response from /user-workflows:',
      response.data?.length || 0,
      'workflows'
    );
    return response.data;
  }

  async downloadWorkflowResult(
    workflowId: string,
    resultType: 'formatted' | 'translated' | 'audio' = 'formatted',
    filename?: string
  ): Promise<void> {
    // Get workflow status to find result paths
    const status = await this.getWorkflow({ workflowId });

    if (!status.s3Paths) {
      throw new Error('No result files available for download');
    }

    let resultPath: string | undefined;
    let defaultFilename: string;

    switch (resultType) {
      case 'formatted':
        resultPath = status.s3Paths.formattedText;
        defaultFilename = `workflow-${workflowId}-formatted.txt`;
        break;
      case 'translated':
        resultPath = status.s3Paths.translatedText;
        defaultFilename = `workflow-${workflowId}-translated.txt`;
        break;
      case 'audio':
        resultPath = status.s3Paths.audioFile;
        defaultFilename = `workflow-${workflowId}-audio.mp3`;
        break;
    }

    if (!resultPath) {
      throw new Error(`No ${resultType} file available for download`);
    }

    await downloadWorkflowFile({
      s3Path: resultPath,
      filename: filename || defaultFilename,
    });
  }

  async downloadAllWorkflowResults(workflowId: string): Promise<void> {
    // Get workflow status to find result paths
    const status = await this.getWorkflow({ workflowId });

    if (!status.s3Paths) {
      throw new Error('No result files available for download');
    }

    const downloads: Array<{ path: string; filename: string }> = [];

    if (status.s3Paths.formattedText) {
      downloads.push({
        path: status.s3Paths.formattedText,
        filename: `workflow-${workflowId}-formatted.txt`,
      });
    }

    if (status.s3Paths.translatedText) {
      downloads.push({
        path: status.s3Paths.translatedText,
        filename: `workflow-${workflowId}-translated.txt`,
      });
    }

    if (status.s3Paths.audioFile) {
      downloads.push({
        path: status.s3Paths.audioFile,
        filename: `workflow-${workflowId}-audio.mp3`,
      });
    }

    if (downloads.length === 0) {
      throw new Error('No result files available for download');
    }

    // Download all result files
    for (const download of downloads) {
      await downloadWorkflowFile({
        s3Path: download.path,
        filename: download.filename,
      });
    }
  }
}

// Hook to get API service instance
export const useWorkflowApi = () => {
  const { getIdToken, user } = useAuth();

  const getToken = async (): Promise<string> => {
    const token = await getIdToken();
    if (!token) {
      throw new Error('No authentication token available');
    }
    return token;
  };

  const getUser = () => user;

  return new WorkflowApiService(getToken, getUser);
};
