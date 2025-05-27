import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.test
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') });

// Determine test execution mode based on environment variable
const RUN_TESTS_CONCURRENT = process.env.VITEST_CONCURRENT === 'true';
const testRunner = RUN_TESTS_CONCURRENT ? it.concurrent : it;

console.log(
  `Running workflow tests in ${
    RUN_TESTS_CONCURRENT ? 'CONCURRENT' : 'SEQUENTIAL'
  } mode`
);

// Types
interface WorkflowParams {
  filename: string;
  doTranslate: boolean;
  doSpeech: boolean;
  targetLanguage?: string;
}

interface WorkflowResponse {
  message: string;
  workflowId: string;
}

interface WorkflowStatus {
  workflowId: string;
  status: string;
  parameters: Record<string, any>;
  s3Paths: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

// Test configuration - map from .env.test variables
const API_GATEWAY_URL = process.env.API_GATEWAY_URL;
const S3_BUCKET = process.env.BUCKET_NAME; // Maps to BUCKET_NAME in .env.test
const AWS_REGION = process.env.AWS_REGION;
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_WEB_CLIENT_ID;
const TEST_USERNAME = process.env.TEST_USERNAME;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

// These will be set during test setup
let AUTH_TOKEN: string;
let USER_ID: string;

if (
  !API_GATEWAY_URL ||
  !S3_BUCKET ||
  !AWS_REGION ||
  !USER_POOL_ID ||
  !CLIENT_ID ||
  !TEST_USERNAME ||
  !TEST_PASSWORD
) {
  throw new Error(
    'Missing required environment variables: API_GATEWAY_URL, BUCKET_NAME, AWS_REGION, USER_POOL_ID, USER_POOL_WEB_CLIENT_ID, TEST_USERNAME, TEST_PASSWORD'
  );
}

const s3Client = new S3Client({ region: AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION });

// Test PDF file path
const TEST_PDF_PATH = path.join(__dirname, '..', 'test-files', 'sample.pdf');

// Test user management functions
async function deleteUserIfExists() {
  console.log(`Deleting user ${TEST_USERNAME} if it exists...`);
  try {
    await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: TEST_USERNAME,
      })
    );
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: TEST_USERNAME,
      })
    );
    console.log(`Deleted existing user: ${TEST_USERNAME}`);
  } catch (err: any) {
    if (err.name === 'UserNotFoundException') {
      console.log(`User ${TEST_USERNAME} does not exist, nothing to delete.`);
      return;
    }
    throw err;
  }
}

async function createTestUser(): Promise<string> {
  try {
    console.log(`Creating test user ${TEST_USERNAME}...`);
    const createUserResponse = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: TEST_USERNAME,
        UserAttributes: [
          { Name: 'email', Value: TEST_USERNAME },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      })
    );

    console.log('Setting password for test user...');
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: TEST_USERNAME,
        Password: TEST_PASSWORD,
        Permanent: true,
      })
    );

    console.log(`Created and set password for user: ${TEST_USERNAME}`);

    if (!createUserResponse.User?.Attributes) {
      throw new Error('User created but attributes not found.');
    }

    const subAttribute = createUserResponse.User.Attributes.find(
      (attr) => attr.Name === 'sub'
    );

    if (!subAttribute || !subAttribute.Value) {
      throw new Error('User created but sub attribute not found.');
    }

    console.log(`User sub: ${subAttribute.Value}`);
    return subAttribute.Value;
  } catch (err: any) {
    console.error('Error creating test user:', err);
    throw err;
  }
}

async function authenticateUser(): Promise<string> {
  try {
    console.log(`Authenticating user ${TEST_USERNAME}...`);
    const authResponse = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID!,
        AuthParameters: {
          USERNAME: TEST_USERNAME!,
          PASSWORD: TEST_PASSWORD!,
        },
      })
    );

    if (!authResponse.AuthenticationResult?.IdToken) {
      throw new Error('Authentication succeeded but no ID token received');
    }

    console.log('User authenticated successfully');
    return authResponse.AuthenticationResult.IdToken;
  } catch (err: any) {
    console.error('Error authenticating user:', err);
    throw err;
  }
}

// Helper functions
async function httpRequest(
  url: string,
  method: string,
  body?: any,
  authToken?: string
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function uploadTestFile(
  fileName: string,
  testName: string
): Promise<string> {
  if (!fs.existsSync(TEST_PDF_PATH)) {
    throw new Error(`Test PDF file not found at: ${TEST_PDF_PATH}`);
  }

  const fileContent = fs.readFileSync(TEST_PDF_PATH);
  const fileKey = `users/${USER_ID}/uploads/${fileName}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: fileKey,
      Body: fileContent,
      ContentType: 'application/pdf',
    })
  );

  console.log(
    `Uploaded test file for ${testName}: s3://${S3_BUCKET}/${fileKey}`
  );
  return fileKey;
}

async function deleteTestFile(fileKey: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: fileKey,
      })
    );
    console.log(`Deleted test file: s3://${S3_BUCKET}/${fileKey}`);
  } catch (error) {
    console.warn(`Failed to delete test file ${fileKey}:`, error);
  }
}

async function startWorkflow(
  params: WorkflowParams
): Promise<WorkflowResponse> {
  const startWorkflowUrl = `${API_GATEWAY_URL}/workflow/start`;
  const response = await httpRequest(
    startWorkflowUrl,
    'POST',
    params,
    AUTH_TOKEN
  );

  console.log('Workflow started:', response);

  if (!response || !response.workflowId) {
    throw new Error('Failed to get workflowId from response');
  }

  return response as WorkflowResponse;
}

async function getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
  const statusUrl = `${API_GATEWAY_URL}/workflow/status?workflowId=${encodeURIComponent(
    workflowId
  )}`;
  const response = await httpRequest(statusUrl, 'GET', undefined, AUTH_TOKEN);

  if (!response || !response.status) {
    throw new Error('Invalid workflow status response');
  }

  return response as WorkflowStatus;
}

async function pollWorkflowUntilComplete(
  workflowId: string,
  expectedFinalStatus: string,
  maxAttempts: number = 1800, // 3 minutes at 100ms intervals
  pollInterval: number = 100
): Promise<WorkflowStatus[]> {
  console.log(
    `Polling workflow ${workflowId} until status: ${expectedFinalStatus}`
  );

  const statusHistory: WorkflowStatus[] = [];
  let attempts = 0;
  let lastStatus: string | undefined;

  while (attempts < maxAttempts) {
    try {
      const status = await getWorkflowStatus(workflowId);

      // Only add to history if status changed
      if (status.status !== lastStatus) {
        statusHistory.push(status);
        console.log(
          `Status transition: ${lastStatus || 'START'} → ${status.status}`
        );
        lastStatus = status.status;
      }

      // Check if workflow failed - fail immediately, don't continue polling
      if (status.status === 'FAILED') {
        console.error(`Workflow failed with status: FAILED`);
        if (status.error) {
          console.error(`Failure reason: ${status.error}`);
        }
        throw new Error(`Workflow failed: ${status.error || 'Unknown error'}`);
      }

      // Check if workflow completed successfully
      if (status.status === expectedFinalStatus) {
        console.log(
          `Workflow completed with expected status: ${expectedFinalStatus}`
        );
        return statusHistory;
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      // Re-throw workflow failure errors immediately - don't treat as polling errors
      if (
        error instanceof Error &&
        error.message.includes('Workflow failed:')
      ) {
        throw error;
      }

      console.error(
        `Error polling workflow status (attempt ${attempts + 1}):`,
        error
      );
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(
    `Workflow did not complete within ${
      (maxAttempts * pollInterval) / 1000
    } seconds. Last status: ${lastStatus}`
  );
}

function validateStatusTransitions(
  statusHistory: WorkflowStatus[],
  expectedTransitions: string[]
): void {
  const actualStatuses = statusHistory.map((s) => s.status);

  console.log('Expected transitions:', expectedTransitions);
  console.log('Actual transitions:', actualStatuses);

  // Require exact match - same length and same statuses in same order
  expect(actualStatuses).toEqual(expectedTransitions);
}

// Test suite
describe('Workflow Integration Tests', () => {
  const uploadedFiles: string[] = [];

  beforeAll(async () => {
    console.log('Setting up integration tests...');
    console.log(`Using test PDF file: ${TEST_PDF_PATH}`);

    // Delete user if exists and create fresh user
    await deleteUserIfExists();
    USER_ID = await createTestUser();

    // Authenticate and get token
    AUTH_TOKEN = await authenticateUser();

    console.log('Test user setup complete');

    // Upload the same PDF file with different names for each test scenario
    const testScenarios = [
      'full-workflow-sample.pdf',
      'translation-only-sample.pdf',
      'speech-only-sample.pdf',
      'formatting-only-sample.pdf',
    ];

    for (const fileName of testScenarios) {
      const fileKey = await uploadTestFile(
        fileName,
        fileName.replace('-sample.pdf', '')
      );
      uploadedFiles.push(fileKey);
    }
  }, 60000); // 60 second timeout for setup

  afterAll(async () => {
    console.log('Cleaning up test files and user...');

    // Clean up uploaded files
    for (const fileKey of uploadedFiles) {
      await deleteTestFile(fileKey);
    }

    // Clean up test user
    await deleteUserIfExists();
    console.log('Test cleanup complete');
  });

  testRunner(
    'should complete full workflow with translation and speech conversion',
    async () => {
      const fileKey = uploadedFiles[0];
      const workflowParams: WorkflowParams = {
        filename: path.basename(fileKey!),
        doTranslate: true,
        doSpeech: true,
        targetLanguage: 'es',
      };

      // Start workflow
      const { workflowId } = await startWorkflow(workflowParams);

      // Poll until completion
      const statusHistory = await pollWorkflowUntilComplete(
        workflowId,
        'SUCCEEDED'
      );

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'TEXT_FORMATTING_COMPLETE',
        'TRANSLATING',
        'TRANSLATION_COMPLETE',
        'CONVERTING_TO_SPEECH',
        'SUCCEEDED',
      ];
      validateStatusTransitions(statusHistory, expectedTransitions);

      // Validate final status details
      const finalStatus = statusHistory[statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(finalStatus.parameters).toMatchObject({
        doTranslate: true,
        doSpeech: true,
        targetLanguage: 'es',
      });
      expect(finalStatus.s3Paths).toHaveProperty('originalFile');
      expect(finalStatus.s3Paths).toHaveProperty('formattedText');
      expect(finalStatus.s3Paths).toHaveProperty('translatedText');
      expect(finalStatus.s3Paths).toHaveProperty('audioFile');
    },
    300000
  ); // 5 minute timeout

  testRunner(
    'should complete workflow ending at translation (no speech)',
    async () => {
      const fileKey = uploadedFiles[1];
      const workflowParams: WorkflowParams = {
        filename: path.basename(fileKey!),
        doTranslate: true,
        doSpeech: false,
        targetLanguage: 'fr',
      };

      // Start workflow
      const { workflowId } = await startWorkflow(workflowParams);

      // Poll until completion - when doSpeech=false, translate-text function sets status to 'SUCCEEDED'
      const statusHistory = await pollWorkflowUntilComplete(
        workflowId,
        'SUCCEEDED'
      );

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'TEXT_FORMATTING_COMPLETE',
        'TRANSLATING',
        'SUCCEEDED',
      ];
      validateStatusTransitions(statusHistory, expectedTransitions);

      // Validate final status details - should be 'SUCCEEDED' when doSpeech=false
      const finalStatus = statusHistory[statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(finalStatus.parameters).toMatchObject({
        doTranslate: true,
        doSpeech: false,
        targetLanguage: 'fr',
      });
      expect(finalStatus.s3Paths).toHaveProperty('originalFile');
      expect(finalStatus.s3Paths).toHaveProperty('formattedText');
      expect(finalStatus.s3Paths).toHaveProperty('translatedText');
      expect(finalStatus.s3Paths).not.toHaveProperty('audioFile');
    },
    300000
  );

  testRunner(
    'should complete workflow ending at speech conversion (no translation)',
    async () => {
      const fileKey = uploadedFiles[2]!;
      const workflowParams: WorkflowParams = {
        filename: path.basename(fileKey),
        doTranslate: false,
        doSpeech: true,
      };

      // Start workflow
      const { workflowId } = await startWorkflow(workflowParams);

      // Poll until completion
      const statusHistory = await pollWorkflowUntilComplete(
        workflowId,
        'SUCCEEDED'
      );

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'TEXT_FORMATTING_COMPLETE',
        'CONVERTING_TO_SPEECH',
        'SUCCEEDED',
      ];
      validateStatusTransitions(statusHistory, expectedTransitions);

      // Validate final status details
      const finalStatus = statusHistory[statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(finalStatus.parameters).toMatchObject({
        doTranslate: false,
        doSpeech: true,
      });
      expect(finalStatus.s3Paths).toHaveProperty('originalFile');
      expect(finalStatus.s3Paths).toHaveProperty('formattedText');
      expect(finalStatus.s3Paths).not.toHaveProperty('translatedText');
      expect(finalStatus.s3Paths).toHaveProperty('audioFile');
    },
    300000
  );

  testRunner(
    'should complete workflow ending at text formatting (no translation or speech)',
    async () => {
      const fileKey = uploadedFiles[3]!; // Use formatting-only file
      const workflowParams: WorkflowParams = {
        filename: path.basename(fileKey),
        doTranslate: false,
        doSpeech: false,
      };

      // Start workflow
      const { workflowId } = await startWorkflow(workflowParams);

      // Poll until completion - when doTranslate=false AND doSpeech=false, format-text function sets status to 'SUCCEEDED'
      const statusHistory = await pollWorkflowUntilComplete(
        workflowId,
        'SUCCEEDED'
      );

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'SUCCEEDED',
      ];
      validateStatusTransitions(statusHistory, expectedTransitions);

      // Validate final status details - should be 'SUCCEEDED' when doTranslate=false AND doSpeech=false
      const finalStatus = statusHistory[statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(finalStatus.parameters).toMatchObject({
        doTranslate: false,
        doSpeech: false,
      });
      expect(finalStatus.s3Paths).toHaveProperty('originalFile');
      expect(finalStatus.s3Paths).toHaveProperty('formattedText');
      expect(finalStatus.s3Paths).not.toHaveProperty('translatedText');
      expect(finalStatus.s3Paths).not.toHaveProperty('audioFile');
    },
    300000
  );
});
