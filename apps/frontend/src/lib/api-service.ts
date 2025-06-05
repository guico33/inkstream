// API service layer using axios
// Provides centralized HTTP client with auth integration and error handling

import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { useAuth } from './contexts/auth-context';
import {
  uploadFileToS3,
  downloadWorkflowFile,
  getDownloadFileName,
} from './aws-s3';
import { ENV } from './constants/env';
import { API_PATHS } from './constants/api-endpoints';
import type { User } from './types/user-types';
import {
  type StartWorkflowParams,
  type GetWorkflowParams,
  type WorkflowResponse,
  type ListUserWorkflowsResponse,
  type WorkflowStatusCategory,
  type S3PathOutputFileKey,
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
      console.log('🔑 API Interceptor: Getting auth token...');
      const token = await getIdToken();
      console.log(
        '🔑 API Interceptor: Token received:',
        token ? `${token.substring(0, 20)}...` : 'NULL'
      );
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔑 API Interceptor: Authorization header set');
    } catch (error) {
      console.error('🔑 API Interceptor: Failed to get auth token:', error);
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

  async startWorkflow(params: StartWorkflowParams): Promise<WorkflowResponse> {
    const response: AxiosResponse<WorkflowResponse> = await this.client.post(
      API_PATHS.START_WORKFLOW,
      params
    );
    return response.data;
  }

  async startWorkflowWithFile(
    params: StartWorkflowWithFileParams
  ): Promise<WorkflowResponse> {
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

  async getWorkflow(params: GetWorkflowParams): Promise<WorkflowResponse> {
    const response: AxiosResponse<WorkflowResponse> = await this.client.get(
      `${API_PATHS.WORKFLOW}/${params.workflowId}`
    );
    return response.data;
  }

  async listUserWorkflows(params?: {
    limit?: number;
    nextToken?: string;
    sortBy?: 'createdAt' | 'updatedAt';
    status?: string;
    statusCategory?: WorkflowStatusCategory;
  }): Promise<ListUserWorkflowsResponse> {
    console.log('API Service: Making request to /user-workflows');
    const response: AxiosResponse<ListUserWorkflowsResponse> =
      await this.client.get(API_PATHS.USER_WORKFLOWS, { params });
    console.log(
      'API Service: Received response from /user-workflows:',
      response.data?.items?.length || 0,
      'workflows'
    );
    return response.data;
  }

  async downloadWorkflowResult(
    workflowId: string,
    outputFileType: S3PathOutputFileKey
  ): Promise<string> {
    // Get workflow status to find result paths
    const status = await this.getWorkflow({ workflowId });

    if (!status.s3Paths) {
      throw new Error('No result files available for download');
    }

    let resultPath: string | undefined;

    switch (outputFileType) {
      case 'formattedText':
        resultPath = status.s3Paths.formattedText;
        break;
      case 'translatedText':
        resultPath = status.s3Paths.translatedText;
        break;
      case 'audioFile':
        resultPath = status.s3Paths.audioFile;
        break;
    }

    if (!resultPath) {
      throw new Error(`No ${outputFileType} file available for download`);
    }

    const downloadedFilename = await downloadWorkflowFile({
      s3Path: resultPath,
      filename: getDownloadFileName({
        originalFilePath: status.s3Paths.originalFile,
        outputFileType,
      }),
    });

    return downloadedFilename;
  }
}

// Hook to get API service instance
export const useWorkflowApi = () => {
  const { getIdToken, user } = useAuth();

  const getToken = async (): Promise<string> => {
    console.log('🔑 useWorkflowApi: Getting token from auth context...');
    const token = await getIdToken();
    console.log(
      '🔑 useWorkflowApi: Token received:',
      token ? `${token.substring(0, 20)}...` : 'NULL'
    );
    if (!token) {
      console.error('🔑 useWorkflowApi: No authentication token available');
      throw new Error('No authentication token available');
    }
    return token;
  };

  const getUser = () => user;

  return new WorkflowApiService(getToken, getUser);
};
