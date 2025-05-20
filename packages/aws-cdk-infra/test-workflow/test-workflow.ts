#!/usr/bin/env node
// test-workflow.ts - Main entry for workflow integration test
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { DescribeExecutionCommand, SFNClient } from '@aws-sdk/client-sfn';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import * as dotenv from 'dotenv';
import 'dotenv/config';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  createTestUser,
  deleteUserIfExists,
} from './create-or-reset-test-user';
// Load environment variables from .env.test file
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Check required environment variables
const requiredEnvVars = [
  'API_GATEWAY_URL',
  'USER_POOL_ID',
  'USER_POOL_WEB_CLIENT_ID',
  'TEST_USERNAME',
  'TEST_PASSWORD',
  'USER_SUB',
  'BUCKET_NAME',
  'AWS_REGION',
];

const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:');
  missingEnvVars.forEach((varName) => console.error(`- ${varName}`));
  console.error('Please check your .env.test file');
  process.exit(1);
}

// Configuration
const BUCKET_NAME =
  process.env.BUCKET_NAME || 'dev-inkstream-storage-560756474135';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL; // Get from CDK output or AWS console
const TEST_FILE_PATH = path.resolve(__dirname, '../test-files/sample.pdf'); // Path to a test PDF file
const TEST_FILE_UUID = uuidv4();
const TEST_FILE_KEY = `uploads/test-${TEST_FILE_UUID}-${Date.now()}.pdf`;

// Cognito configuration - Get these from environment variables or CloudFormation outputs
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_WEB_CLIENT_ID;
// For admin testing - set these via environment variables
const TEST_USERNAME = process.env.TEST_USERNAME;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const USER_SUB = process.env.USER_SUB; // Cognito user sub ID

// Initialize clients
const AWS_REGION = process.env.AWS_REGION || 'eu-west-3';
const AWS_PROFILE = process.env.AWS_PROFILE || 'dev';

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: fromIni({ profile: AWS_PROFILE }),
});
const sfnClient = new SFNClient({
  region: AWS_REGION,
  credentials: fromIni({ profile: AWS_PROFILE }),
});
const cognitoClient = new CognitoIdentityProviderClient({
  region: AWS_REGION,
  credentials: fromIni({ profile: AWS_PROFILE }),
});

// Function to get authentication token using Cognito
async function getAuthToken(): Promise<string> {
  if (!USER_POOL_ID || !CLIENT_ID) {
    throw new Error(
      'USER_POOL_ID and USER_POOL_WEB_CLIENT_ID environment variables must be set'
    );
  }

  if (!TEST_USERNAME || !TEST_PASSWORD) {
    throw new Error(
      'TEST_USERNAME and TEST_PASSWORD environment variables must be set for testing'
    );
  }

  const params: InitiateAuthCommandInput = {
    ClientId: CLIENT_ID,
    // Use regular USER_PASSWORD_AUTH for web client authentication
    AuthFlow: 'USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: TEST_USERNAME,
      PASSWORD: TEST_PASSWORD,
    },
  };

  try {
    console.log('Authenticating with Cognito...');
    const command = new InitiateAuthCommand(params);
    const response = await cognitoClient.send(command);

    // If the response has AuthenticationResult with an IdToken, we're done
    if (response.AuthenticationResult?.IdToken) {
      console.log('Authentication successful');
      return response.AuthenticationResult.IdToken;
    }

    // Handle the FORCE_CHANGE_PASSWORD challenge
    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      console.log(
        'User requires password change. Please update the user status in the Cognito console:'
      );
      console.log(
        '1. Go to AWS Console > Cognito > User Pools > Your user pool'
      );
      console.log('2. Find your user and click on it');
      console.log('3. Click "Reset password" or change the user status');
      console.log(
        '4. Try running the test again after updating the user status'
      );

      throw new Error(
        'User requires password change. Please update the user in the Cognito console.'
      );
    }

    throw new Error(
      'No ID token received from authentication and no supported challenge was present'
    );
  } catch (error) {
    console.error('Authentication failed:', error);
    throw new Error(`Failed to authenticate with Cognito: ${error}`);
  }
}

// Simple function to make HTTP requests with authentication
function httpRequest(
  url: string,
  method: string,
  data?: unknown,
  authToken?: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
        // Handle HTTP error codes
        if (res.statusCode && res.statusCode >= 400) {
          return reject(
            new Error(`HTTP Error ${res.statusCode}: ${responseData}`)
          );
        }

        try {
          resolve(JSON.parse(responseData));
        } catch {
          resolve(responseData);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function uploadTestFile(): Promise<string> {
  console.log(`Uploading test file to S3: ${TEST_FILE_KEY}`);

  const fileContent = fs.readFileSync(TEST_FILE_PATH);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: TEST_FILE_KEY,
      Body: fileContent,
      ContentType: 'application/pdf',
    })
  );

  console.log('File uploaded successfully');
  return TEST_FILE_KEY;
}

async function startWorkflow(
  fileKey: string,
  authToken: string
): Promise<string> {
  console.log('Starting workflow with the following parameters:');
  const workflowParams = {
    fileKey,
    outputBucket: BUCKET_NAME,
    originalFileBucket: BUCKET_NAME,
    doTranslate: true,
    doSpeech: true,
    targetLanguage: 'japanese',
    workflowId: TEST_FILE_UUID,
    userId: USER_SUB, // Add user ID from environment variables
  };
  console.log(JSON.stringify(workflowParams, null, 2));

  if (!API_GATEWAY_URL) {
    throw new Error(
      'API_GATEWAY_URL environment variable is not set. Please set it to the API Gateway URL from the CDK output.'
    );
  }

  const startWorkflowUrl = `${API_GATEWAY_URL}/workflow/start`;
  const response = await httpRequest(
    startWorkflowUrl,
    'POST',
    workflowParams,
    authToken
  );

  console.log('Workflow started:', response);
  // Narrow response type to expected shape
  if (
    !response ||
    typeof response !== 'object' ||
    !('executionArn' in response)
  ) {
    throw new Error('Failed to get execution ARN from response');
  }

  return (response as { executionArn: string }).executionArn;
}

async function checkWorkflowStatus(executionArn: string): Promise<void> {
  console.log(`Checking workflow status for execution: ${executionArn}`);

  let isComplete = false;
  let attempts = 0;
  const maxAttempts = 30; // Check for up to 5 minutes (30 x 10 seconds)

  while (!isComplete && attempts < maxAttempts) {
    const command = new DescribeExecutionCommand({
      executionArn,
    });

    const response = await sfnClient.send(command);
    console.log(`Execution status: ${response.status}`);

    if (
      response.status === 'SUCCEEDED' ||
      response.status === 'FAILED' ||
      response.status === 'ABORTED'
    ) {
      isComplete = true;

      if (response.status === 'SUCCEEDED') {
        const output = JSON.parse(response.output || '{}');
        console.log('Workflow completed successfully:');
        console.log(JSON.stringify(output, null, 2));

        // Download and verify formatted text
        if (output.formatTextOutput?.s3Path) {
          await downloadAndVerifyS3File(
            output.formatTextOutput.s3Path,
            `formatted-${TEST_FILE_UUID}.txt`,
            true
          );
        } else if (output.formatTextOutput?.body?.formattedText) {
          // Handle case where text might be directly in body (legacy or small text)
          console.log('Formatted Text (from direct output):');
          console.log('--------------------');
          console.log(
            output.formatTextOutput.body.formattedText.substring(0, 500) + '...'
          );
          console.log('--------------------');
        }

        // Download and verify translated text
        if (output.translateTextOutput?.s3Path) {
          await downloadAndVerifyS3File(
            output.translateTextOutput.s3Path,
            `translated-${TEST_FILE_UUID}-${
              output.targetLanguage || 'lang'
            }.txt`,
            true
          );
        } else if (output.translateTextOutput?.body?.translatedText) {
          console.log('Translated Text (from direct output):');
          console.log('--------------------');
          console.log(
            output.translateTextOutput.body.translatedText.substring(0, 500) +
              '...'
          );
          console.log('--------------------');
        }

        // Download audio file
        if (output.speechOutput?.s3Path) {
          await downloadAndVerifyS3File(
            output.speechOutput.s3Path,
            `speech-${TEST_FILE_UUID}-${output.targetLanguage || 'lang'}.mp3`,
            false
          );
        }
      } else {
        console.error(`Workflow ${response.status}:`, response.error);

        // If there's error information in the output, display it
        if (response.output) {
          try {
            const errorOutput = JSON.parse(response.output);
            if (errorOutput.error) {
              console.error('Error details:', errorOutput.error);
            } else {
              console.error(
                'Full error output:',
                JSON.stringify(errorOutput, null, 2)
              );
            }
          } catch (error) {
            console.error(
              'Error parsing execution output:',
              response.output,
              error
            );
          }
        }
      }
    } else {
      console.log(
        'Workflow still running. Waiting 10 seconds before checking again...'
      );
      await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
      attempts++;
    }
  }

  if (!isComplete) {
    console.log('Exceeded maximum wait time. Workflow is still running.');
  }
}

// Updated function to download S3 files and handle text/binary content
async function downloadAndVerifyS3File(
  s3Path: { bucket: string; key: string },
  localFilename: string,
  isText: boolean = false
): Promise<string | void> {
  console.log(`Downloading S3 file: s3://${s3Path.bucket}/${s3Path.key}`);

  const command = new GetObjectCommand({
    Bucket: s3Path.bucket,
    Key: s3Path.key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error(`No response body received for ${s3Path.key}`);
  }

  const outputPath = path.resolve(__dirname, '../test-files/', localFilename);

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  if (isText) {
    const content = buffer.toString('utf-8');
    fs.writeFileSync(outputPath, content);
    console.log(`Text file downloaded to: ${outputPath}`);
    console.log(`Content snippet for ${localFilename}:`);
    console.log('--------------------');
    console.log(
      content.substring(0, 500) + (content.length > 500 ? '...' : '')
    );
    console.log('--------------------');
    return content;
  } else {
    fs.writeFileSync(outputPath, buffer);
    console.log(`Binary file downloaded to: ${outputPath}`);
  }
}

async function setupTestUser() {
  await deleteUserIfExists();
  await createTestUser();
}

async function runWorkflowTest() {
  try {
    // Step 0: Setup test user
    await setupTestUser();

    // Get an authentication token first
    const authToken = await getAuthToken();

    // Step 1: Upload a test file
    const fileKey = await uploadTestFile();

    // Step 2: Start the workflow with auth token
    const executionArn = await startWorkflow(fileKey, authToken);

    // Step 3: Check the workflow status
    // This doesn't need auth since it directly queries Step Functions
    await checkWorkflowStatus(executionArn);

    console.log('Test completed');
  } catch (error) {
    console.error('Error running workflow test:', error);
  }
}

runWorkflowTest();
