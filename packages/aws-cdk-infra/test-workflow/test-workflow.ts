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
import { SFNClient, StopExecutionCommand } from '@aws-sdk/client-sfn';
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

// Test configuration - map from .env.test variables
const API_GATEWAY_URL = process.env.API_GATEWAY_URL;
const S3_BUCKET = process.env.BUCKET_NAME; // Maps to BUCKET_NAME in .env.test
const AWS_REGION = process.env.AWS_REGION;
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_WEB_CLIENT_ID;
const TEST_USERNAME = process.env.TEST_USERNAME;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

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
  !TEST_PASSWORD ||
  !STATE_MACHINE_ARN
) {
  throw new Error(
    'Missing required environment variables: API_GATEWAY_URL, BUCKET_NAME, AWS_REGION, USER_POOL_ID, USER_POOL_WEB_CLIENT_ID, TEST_USERNAME, TEST_PASSWORD, STATE_MACHINE_ARN'
  );
}

const s3Client = new S3Client({ region: AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION });
const sfnClient = new SFNClient({ region: AWS_REGION });

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

async function getWorkflowRecord(workflowId: string): Promise<any> {
  const statusUrl = `${API_GATEWAY_URL}/workflow/${encodeURIComponent(
    workflowId
  )}`;
  const response = await httpRequest(statusUrl, 'GET', undefined, AUTH_TOKEN);

  if (!response || !response.statusHistory) {
    throw new Error('Invalid workflow record response');
  }

  return response;
}

async function stopStepFunctionsExecution(workflowId: string): Promise<void> {
  console.log(`Stopping Step Functions execution: ${workflowId}`);

  try {
    await sfnClient.send(
      new StopExecutionCommand({
        executionArn: workflowId,
        error: 'TestAbort',
        cause: 'Manually aborted for integration testing',
      })
    );
    console.log(`Successfully stopped execution: ${workflowId}`);
  } catch (error) {
    console.error('Failed to stop execution:', error);
    throw error;
  }
}

async function pollWorkflowUntilComplete(
  workflowId: string,
  expectedFinalStatus: string,
  maxAttempts: number = 60, // 3 minutes max at 3s interval
  pollInterval: number = 3000 // 3 seconds
): Promise<any> {
  console.log(
    `Polling workflow ${workflowId} until status: ${expectedFinalStatus}`
  );
  let attempts = 0;
  let lastStatus: string | undefined;

  while (attempts < maxAttempts) {
    try {
      console.log(`Polling attempt ${attempts + 1}...`);
      const record = await getWorkflowRecord(workflowId);
      const status = record.status;

      if (status !== lastStatus) {
        console.log(`Status transition: ${lastStatus || 'START'} → ${status}`);
        lastStatus = status;
      }

      if (status === 'FAILED') {
        throw new Error(`Workflow failed: ${record.error || 'Unknown error'}`);
      }

      if (status === expectedFinalStatus) {
        return record;
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
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
  statusHistory: { status: string }[],
  expectedTransitions: string[]
): void {
  const actualStatuses = statusHistory.map((s) => s.status);

  console.log('Expected transitions:', expectedTransitions);
  console.log('Actual transitions:', actualStatuses);

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
      'abort-test-sample.pdf', // For abort test
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
      const record = await pollWorkflowUntilComplete(workflowId, 'SUCCEEDED');

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
      validateStatusTransitions(record.statusHistory, expectedTransitions);

      // Validate final status details
      const finalStatus =
        record.statusHistory[record.statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(record.parameters).toMatchObject({
        doTranslate: true,
        doSpeech: true,
        targetLanguage: 'es',
      });
      expect(record.s3Paths).toHaveProperty('originalFile');
      expect(record.s3Paths).toHaveProperty('formattedText');
      expect(record.s3Paths).toHaveProperty('translatedText');
      expect(record.s3Paths).toHaveProperty('audioFile');
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
      const record = await pollWorkflowUntilComplete(workflowId, 'SUCCEEDED');

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'TEXT_FORMATTING_COMPLETE',
        'TRANSLATING',
        'SUCCEEDED',
      ];
      validateStatusTransitions(record.statusHistory, expectedTransitions);

      // Validate final status details - should be 'SUCCEEDED' when doSpeech=false
      const finalStatus =
        record.statusHistory[record.statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(record.parameters).toMatchObject({
        doTranslate: true,
        doSpeech: false,
        targetLanguage: 'fr',
      });
      expect(record.s3Paths).toHaveProperty('originalFile');
      expect(record.s3Paths).toHaveProperty('formattedText');
      expect(record.s3Paths).toHaveProperty('translatedText');
      expect(record.s3Paths).not.toHaveProperty('audioFile');
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
      const record = await pollWorkflowUntilComplete(workflowId, 'SUCCEEDED');

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'TEXT_FORMATTING_COMPLETE',
        'CONVERTING_TO_SPEECH',
        'SUCCEEDED',
      ];
      validateStatusTransitions(record.statusHistory, expectedTransitions);

      // Validate final status details
      const finalStatus =
        record.statusHistory[record.statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(record.parameters).toMatchObject({
        doTranslate: false,
        doSpeech: true,
      });
      expect(record.s3Paths).toHaveProperty('originalFile');
      expect(record.s3Paths).toHaveProperty('formattedText');
      expect(record.s3Paths).not.toHaveProperty('translatedText');
      expect(record.s3Paths).toHaveProperty('audioFile');
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
      const record = await pollWorkflowUntilComplete(workflowId, 'SUCCEEDED');

      // Validate status transitions
      const expectedTransitions = [
        'STARTING',
        'EXTRACTING_TEXT',
        'FORMATTING_TEXT',
        'SUCCEEDED',
      ];
      validateStatusTransitions(record.statusHistory, expectedTransitions);

      // Validate final status details - should be 'SUCCEEDED' when doTranslate=false AND doSpeech=false
      const finalStatus =
        record.statusHistory[record.statusHistory.length - 1]!;
      expect(finalStatus.status).toBe('SUCCEEDED');
      expect(record.parameters).toMatchObject({
        doTranslate: false,
        doSpeech: false,
      });
      expect(record.s3Paths).toHaveProperty('originalFile');
      expect(record.s3Paths).toHaveProperty('formattedText');
      expect(record.s3Paths).not.toHaveProperty('translatedText');
      expect(record.s3Paths).not.toHaveProperty('audioFile');
    },
    300000
  );

  testRunner(
    'should handle aborted workflow correctly via EventBridge',
    async () => {
      const fileKey = uploadedFiles[4]!; // Use abort-test file
      const workflowParams: WorkflowParams = {
        filename: path.basename(fileKey),
        doTranslate: true, // Use a longer workflow so we have time to abort
        doSpeech: true,
        targetLanguage: 'fr',
      };

      // Start workflow
      const { workflowId } = await startWorkflow(workflowParams);
      console.log(`Started workflow ${workflowId} for abort test`);

      // Wait a moment for the workflow to actually start processing
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds

      // Manually abort the Step Functions execution
      await stopStepFunctionsExecution(workflowId);
      console.log(`Aborted Step Functions execution: ${workflowId}`);

      // Poll to verify the status gets updated to FAILED via our EventBridge handler
      // The EventBridge event may take a few seconds to trigger our Lambda
      console.log('Polling for workflow status to be updated to FAILED...');

      let attempts = 0;
      const maxAttempts = 20; // 1 minute max at 3s interval
      let finalRecord: any;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds

        try {
          const record = await getWorkflowRecord(workflowId);
          console.log(
            `Attempt ${attempts + 1}: Current status = ${record.status}`
          );

          if (record.status === 'FAILED') {
            finalRecord = record;
            break;
          }

          attempts++;
        } catch (error) {
          console.log(`Polling attempt ${attempts + 1} failed:`, error);
          attempts++;
        }
      }

      if (!finalRecord) {
        throw new Error(
          `Workflow status was not updated to FAILED within ${
            maxAttempts * 3
          } seconds`
        );
      }

      // Validate the final record
      expect(finalRecord.status).toBe('FAILED');
      expect(finalRecord.cause).toBe(
        'Manually aborted for integration testing'
      );
      expect(finalRecord.error).toBe('TestAbort');

      // Validate the status history includes the abort error
      const statusHistory = finalRecord.statusHistory;
      const finalStatusEntry = statusHistory[statusHistory.length - 1];
      expect(finalStatusEntry.status).toBe('FAILED');
      expect(finalStatusEntry.error).toBe('Workflow aborted');

      console.log(
        '✅ Abort test completed successfully - workflow status updated to FAILED via EventBridge'
      );
    },
    180000 // 3 minute timeout for abort test
  );

  // Test the user-workflows endpoint with various pagination and sorting options
  // Note: Using 'describe' and 'it' instead of 'testRunner' to ensure this always runs sequentially,
  // even when other tests are running concurrently
  describe('user-workflows endpoint tests', () => {
    it('should retrieve all workflows without pagination parameters', async () => {
      console.log(
        'Testing user-workflows endpoint to retrieve all completed workflows...'
      );

      // Call the user-workflows endpoint without any query parameters
      const userWorkflowsUrl = `${API_GATEWAY_URL}/user-workflows`;
      const response = await httpRequest(
        userWorkflowsUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate response structure for paginated format
      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
      console.log(
        `Retrieved ${response.items.length} workflows from user-workflows endpoint`
      );

      // Should have exactly 5 workflows (4 successful + 1 aborted)
      expect(response.items).toHaveLength(5);

      // Validate that all workflows belong to our test user
      response.items.forEach((workflow: any) => {
        expect(workflow.userId).toBe(USER_ID);
        expect(workflow).toHaveProperty('workflowId');
        expect(workflow).toHaveProperty('status');
        expect(workflow).toHaveProperty('parameters');
        expect(workflow).toHaveProperty('s3Paths');
        expect(workflow).toHaveProperty('createdAt');
        expect(workflow).toHaveProperty('updatedAt');
        expect(workflow).toHaveProperty('statusHistory');

        // Status should be either SUCCEEDED or FAILED (for aborted workflow)
        expect(['SUCCEEDED', 'FAILED']).toContain(workflow.status);
      });

      // Count successful vs failed workflows
      const successfulWorkflows = response.items.filter(
        (w: any) => w.status === 'SUCCEEDED'
      );
      const failedWorkflows = response.items.filter(
        (w: any) => w.status === 'FAILED'
      );

      expect(successfulWorkflows).toHaveLength(4); // 4 completed workflows
      expect(failedWorkflows).toHaveLength(1); // 1 aborted workflow

      // Validate the aborted workflow has the correct error
      const abortedWorkflow = failedWorkflows[0];
      expect(abortedWorkflow.error).toBe('Workflow aborted');

      // Validate that we have the expected workflow configurations (only for successful workflows)
      const workflowConfigs = successfulWorkflows.map((w: any) => ({
        doTranslate: w.parameters.doTranslate,
        doSpeech: w.parameters.doSpeech,
        targetLanguage: w.parameters.targetLanguage,
      }));

      // Should contain all 4 different configurations from our successful tests
      const expectedConfigs = [
        { doTranslate: true, doSpeech: true, targetLanguage: 'es' }, // Full workflow
        { doTranslate: true, doSpeech: false, targetLanguage: 'fr' }, // Translation only
        { doTranslate: false, doSpeech: true }, // Speech only
        { doTranslate: false, doSpeech: false }, // Formatting only
      ];

      // Check that each expected config exists in the response
      expectedConfigs.forEach((expectedConfig) => {
        const matchingWorkflow = workflowConfigs.find(
          (config: any) =>
            config.doTranslate === expectedConfig.doTranslate &&
            config.doSpeech === expectedConfig.doSpeech &&
            (expectedConfig.targetLanguage === undefined ||
              config.targetLanguage === expectedConfig.targetLanguage)
        );
        expect(matchingWorkflow).toBeDefined();
      });

      console.log(
        '✅ user-workflows endpoint successfully returned all 5 workflows (4 completed + 1 aborted)'
      );
      console.log('Successful workflow configurations found:', workflowConfigs);
      console.log('Aborted workflow error:', abortedWorkflow.error);
    }, 60000);

    it('should support pagination with limit parameter', async () => {
      console.log('Testing user-workflows endpoint with pagination...');

      // Test with limit=2 to get first page
      const firstPageUrl = `${API_GATEWAY_URL}/user-workflows?limit=2`;
      const firstPageResponse = await httpRequest(
        firstPageUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate first page response
      expect(firstPageResponse).toHaveProperty('items');
      expect(Array.isArray(firstPageResponse.items)).toBe(true);
      expect(firstPageResponse.items).toHaveLength(2);
      expect(firstPageResponse).toHaveProperty('nextToken');
      expect(typeof firstPageResponse.nextToken).toBe('string');

      console.log(
        `First page: ${firstPageResponse.items.length} workflows, nextToken: ${
          firstPageResponse.nextToken ? 'present' : 'none'
        }`
      );

      // Test with nextToken to get second page
      const secondPageUrl = `${API_GATEWAY_URL}/user-workflows?limit=2&nextToken=${encodeURIComponent(
        firstPageResponse.nextToken
      )}`;
      const secondPageResponse = await httpRequest(
        secondPageUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate second page response
      expect(secondPageResponse).toHaveProperty('items');
      expect(Array.isArray(secondPageResponse.items)).toBe(true);
      expect(secondPageResponse.items).toHaveLength(2);
      expect(secondPageResponse).toHaveProperty('nextToken');

      console.log(
        `Second page: ${
          secondPageResponse.items.length
        } workflows, nextToken: ${
          secondPageResponse.nextToken ? 'present' : 'none'
        }`
      );

      // Get final page
      const thirdPageUrl = `${API_GATEWAY_URL}/user-workflows?limit=2&nextToken=${encodeURIComponent(
        secondPageResponse.nextToken
      )}`;
      const thirdPageResponse = await httpRequest(
        thirdPageUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate final page response
      expect(thirdPageResponse).toHaveProperty('items');
      expect(Array.isArray(thirdPageResponse.items)).toBe(true);
      expect(thirdPageResponse.items).toHaveLength(1); // Only 1 remaining workflow
      expect(thirdPageResponse.nextToken).toBeUndefined(); // No more pages

      console.log(
        `Third page: ${thirdPageResponse.items.length} workflows, nextToken: ${
          thirdPageResponse.nextToken ? 'present' : 'none'
        }`
      );

      // Validate that all workflow IDs are unique across pages
      const allWorkflowIds = [
        ...firstPageResponse.items.map((w: any) => w.workflowId),
        ...secondPageResponse.items.map((w: any) => w.workflowId),
        ...thirdPageResponse.items.map((w: any) => w.workflowId),
      ];
      const uniqueWorkflowIds = new Set(allWorkflowIds);
      expect(uniqueWorkflowIds.size).toBe(5); // Should have 5 unique workflows

      console.log('✅ Pagination test completed successfully');
    }, 60000);

    it('should support sorting by createdAt', async () => {
      console.log('Testing user-workflows endpoint with sortBy=createdAt...');

      const sortByCreatedUrl = `${API_GATEWAY_URL}/user-workflows?sortBy=createdAt`;
      const response = await httpRequest(
        sortByCreatedUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate response structure
      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
      expect(response.items).toHaveLength(5);

      // Validate that workflows are sorted by createdAt (most recent first)
      const createdAtDates = response.items.map((w: any) =>
        new Date(w.createdAt).getTime()
      );
      const sortedDates = [...createdAtDates].sort((a, b) => b - a); // Sort descending
      expect(createdAtDates).toEqual(sortedDates);

      console.log('✅ Sort by createdAt test completed successfully');
      console.log(
        'Created dates (most recent first):',
        response.items.map((w: any) => w.createdAt)
      );
    }, 60000);

    it('should support sorting by updatedAt (default)', async () => {
      console.log('Testing user-workflows endpoint with sortBy=updatedAt...');

      const sortByUpdatedUrl = `${API_GATEWAY_URL}/user-workflows?sortBy=updatedAt`;
      const response = await httpRequest(
        sortByUpdatedUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate response structure
      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
      expect(response.items).toHaveLength(5);

      // Validate that workflows are sorted by updatedAt (most recent first)
      const updatedAtDates = response.items.map((w: any) =>
        new Date(w.updatedAt).getTime()
      );
      const sortedDates = [...updatedAtDates].sort((a, b) => b - a); // Sort descending
      expect(updatedAtDates).toEqual(sortedDates);

      console.log('✅ Sort by updatedAt test completed successfully');
      console.log(
        'Updated dates (most recent first):',
        response.items.map((w: any) => w.updatedAt)
      );
    }, 60000);

    it('should combine pagination and sorting parameters', async () => {
      console.log(
        'Testing user-workflows endpoint with both pagination and sorting...'
      );

      // Test sorting by createdAt with pagination
      const paginatedSortUrl = `${API_GATEWAY_URL}/user-workflows?sortBy=createdAt&limit=3`;
      const response = await httpRequest(
        paginatedSortUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate response structure
      expect(response).toHaveProperty('items');
      expect(Array.isArray(response.items)).toBe(true);
      expect(response.items).toHaveLength(3);
      expect(response).toHaveProperty('nextToken');

      // Validate that the 3 workflows are sorted by createdAt
      const createdAtDates = response.items.map((w: any) =>
        new Date(w.createdAt).getTime()
      );
      const sortedDates = [...createdAtDates].sort((a, b) => b - a); // Sort descending
      expect(createdAtDates).toEqual(sortedDates);

      console.log(
        '✅ Combined pagination and sorting test completed successfully'
      );
      console.log(
        `Returned ${
          response.items.length
        } workflows sorted by createdAt with nextToken: ${
          response.nextToken ? 'present' : 'none'
        }`
      );
    }, 60000);

    it('should handle invalid query parameters gracefully', async () => {
      console.log('Testing user-workflows endpoint with invalid parameters...');

      // Test invalid sortBy parameter
      const invalidSortUrl = `${API_GATEWAY_URL}/user-workflows?sortBy=invalidSort`;
      try {
        await httpRequest(invalidSortUrl, 'GET', undefined, AUTH_TOKEN);
        // If we reach here, the test failed because it should have thrown an error
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('400'); // Should return 400 Bad Request
        console.log('✅ Invalid sortBy parameter correctly rejected');
      }

      // Test invalid limit parameter (too large)
      const invalidLimitUrl = `${API_GATEWAY_URL}/user-workflows?limit=1000`;
      try {
        await httpRequest(invalidLimitUrl, 'GET', undefined, AUTH_TOKEN);
        // If we reach here, the test failed because it should have thrown an error
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('400'); // Should return 400 Bad Request
        console.log('✅ Invalid limit parameter correctly rejected');
      }

      console.log('✅ Invalid parameter handling test completed successfully');
    }, 60000);

    it('should support filtering by status', async () => {
      console.log('Testing user-workflows endpoint with status filtering...');

      // Test filtering for successful workflows
      const successfulUrl = `${API_GATEWAY_URL}/user-workflows?status=SUCCEEDED`;
      const successfulResponse = await httpRequest(
        successfulUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate response structure
      expect(successfulResponse).toHaveProperty('items');
      expect(Array.isArray(successfulResponse.items)).toBe(true);
      expect(successfulResponse.items).toHaveLength(4); // Should have 4 successful workflows

      // Validate that all returned workflows have SUCCEEDED status
      successfulResponse.items.forEach((workflow: any) => {
        expect(workflow.status).toBe('SUCCEEDED');
        expect(workflow.userId).toBe(USER_ID);
      });

      console.log(
        `✅ SUCCEEDED filter returned ${successfulResponse.items.length} workflows`
      );

      // Test filtering for failed workflows
      const failedUrl = `${API_GATEWAY_URL}/user-workflows?status=FAILED`;
      const failedResponse = await httpRequest(
        failedUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Validate response structure
      expect(failedResponse).toHaveProperty('items');
      expect(Array.isArray(failedResponse.items)).toBe(true);
      expect(failedResponse.items).toHaveLength(1); // Should have 1 failed (aborted) workflow

      // Validate that all returned workflows have FAILED status
      failedResponse.items.forEach((workflow: any) => {
        expect(workflow.status).toBe('FAILED');
        expect(workflow.userId).toBe(USER_ID);
        expect(workflow.error).toBe('Workflow aborted'); // This is the aborted workflow
      });

      console.log(
        `✅ FAILED filter returned ${failedResponse.items.length} workflows`
      );

      // Test filtering for a status that should return no results
      const processingUrl = `${API_GATEWAY_URL}/user-workflows?status=EXTRACTING_TEXT`;
      const processingResponse = await httpRequest(
        processingUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Should return empty array since all workflows are completed
      expect(processingResponse).toHaveProperty('items');
      expect(Array.isArray(processingResponse.items)).toBe(true);
      expect(processingResponse.items).toHaveLength(0);

      console.log(
        `✅ EXTRACTING_TEXT filter returned ${processingResponse.items.length} workflows (as expected)`
      );

      // Test combining status filter with pagination
      const paginatedStatusUrl = `${API_GATEWAY_URL}/user-workflows?status=SUCCEEDED&limit=2`;
      const paginatedStatusResponse = await httpRequest(
        paginatedStatusUrl,
        'GET',
        undefined,
        AUTH_TOKEN
      );

      // Should return 2 successful workflows with pagination
      expect(paginatedStatusResponse).toHaveProperty('items');
      expect(Array.isArray(paginatedStatusResponse.items)).toBe(true);
      expect(paginatedStatusResponse.items).toHaveLength(2);
      expect(paginatedStatusResponse).toHaveProperty('nextToken');

      // All returned workflows should be SUCCEEDED
      paginatedStatusResponse.items.forEach((workflow: any) => {
        expect(workflow.status).toBe('SUCCEEDED');
      });

      console.log(
        `✅ Status filter with pagination returned ${paginatedStatusResponse.items.length} workflows with nextToken`
      );

      // Test that combining status filter with sorting is not allowed (should return 400 error)
      const sortedStatusUrl = `${API_GATEWAY_URL}/user-workflows?status=SUCCEEDED&sortBy=createdAt`;
      try {
        await httpRequest(sortedStatusUrl, 'GET', undefined, AUTH_TOKEN);
        // If we reach here, the test failed because it should have thrown an error
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('400'); // Should return 400 Bad Request
        console.log(
          '✅ Status filter with sortBy parameter correctly rejected (400 error)'
        );
      }

      console.log('✅ Status filtering test completed successfully');
    }, 60000);

    it('should handle invalid status parameter gracefully', async () => {
      console.log(
        'Testing user-workflows endpoint with invalid status parameter...'
      );

      // Test invalid status parameter
      const invalidStatusUrl = `${API_GATEWAY_URL}/user-workflows?status=INVALID_STATUS`;
      try {
        await httpRequest(invalidStatusUrl, 'GET', undefined, AUTH_TOKEN);
        // If we reach here, the test failed because it should have thrown an error
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('400'); // Should return 400 Bad Request
        console.log('✅ Invalid status parameter correctly rejected');
      }

      console.log(
        '✅ Invalid status parameter handling test completed successfully'
      );
    }, 60000);

    it('should reject using sortBy and status parameters together', async () => {
      console.log(
        'Testing user-workflows endpoint with both sortBy and status parameters (should be rejected)...'
      );

      // Test that using both sortBy and status parameters returns a 400 error
      const bothParamsUrl = `${API_GATEWAY_URL}/user-workflows?sortBy=updatedAt&status=SUCCEEDED`;
      try {
        await httpRequest(bothParamsUrl, 'GET', undefined, AUTH_TOKEN);
        // If we reach here, the test failed because it should have thrown an error
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('400'); // Should return 400 Bad Request
        expect(error.message).toContain(
          'sortBy parameter cannot be used with status filtering'
        );
        console.log(
          '✅ Combined sortBy and status parameters correctly rejected with proper error message'
        );
      }

      console.log('✅ Parameter validation test completed successfully');
    }, 60000);
  });
});
