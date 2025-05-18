#!/usr/bin/env node
// Test script for the full Inkstream workflow
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { SFNClient, DescribeExecutionCommand } from '@aws-sdk/client-sfn';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// Configuration
const BUCKET_NAME = 'dev-inkstream-uploads-560756474135';
const API_GATEWAY_URL = process.env.API_GATEWAY_URL; // Get from CDK output or AWS console
const TEST_FILE_PATH = path.resolve(__dirname, '../test-files/sample.pdf'); // Path to a test PDF file
const TEST_FILE_KEY = `uploads/test-${Date.now()}.pdf`;

// Initialize clients
const s3Client = new S3Client({
  region: 'eu-west-3',
  credentials: fromIni({ profile: 'dev' }),
});
const sfnClient = new SFNClient({
  region: 'eu-west-3',
  credentials: fromIni({ profile: 'dev' }),
});

// Simple function to make HTTP requests
function httpRequest(
  url: string,
  method: string,
  data?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      res.on('end', () => {
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

async function startWorkflow(fileKey: string): Promise<string> {
  console.log('Starting workflow with the following parameters:');
  const workflowParams = {
    fileKey,
    doTranslate: true,
    doSpeech: true,
    targetLanguage: 'japanese',
  };
  console.log(JSON.stringify(workflowParams, null, 2));

  if (!API_GATEWAY_URL) {
    throw new Error(
      'API_GATEWAY_URL environment variable is not set. Please set it to the API Gateway URL from the CDK output.'
    );
  }

  const startWorkflowUrl = `${API_GATEWAY_URL}/workflow/start`;
  const response = await httpRequest(startWorkflowUrl, 'POST', workflowParams);

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

        // If there's an audio file, download it
        if (output.audioFileKey) {
          await downloadAudioFile(output.audioFileKey);
        }

        // If there's formatted or translated text, print them
        if (output.formattedText) {
          console.log('Formatted Text:');
          console.log('--------------------');
          console.log(output.formattedText.substring(0, 500) + '...');
          console.log('--------------------');
        }

        if (output.translatedText) {
          console.log('Translated Text:');
          console.log('--------------------');
          console.log(output.translatedText.substring(0, 500) + '...');
          console.log('--------------------');
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

async function downloadAudioFile(audioFileKey: string): Promise<void> {
  console.log(`Downloading audio file: ${audioFileKey}`);

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: audioFileKey,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('No response body received');
  }

  const outputPath = path.resolve(__dirname, '../test-files/output.mp3');

  // Convert stream to buffer and save to file
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, buffer);

  console.log(`Audio file downloaded to: ${outputPath}`);
}

async function runWorkflowTest() {
  try {
    // Step 1: Upload a test file
    const fileKey = await uploadTestFile();

    // Step 2: Start the workflow
    const executionArn = await startWorkflow(fileKey);

    // Step 3: Check the workflow status
    await checkWorkflowStatus(executionArn);

    console.log('Test completed');
  } catch (error) {
    console.error('Error running workflow test:', error);
  }
}

// Run the test
runWorkflowTest();
