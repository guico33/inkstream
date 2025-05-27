import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Handler } from 'aws-lambda';
import { z } from 'zod';
import { WorkflowCommonState } from '../../../types/workflow';
import {
  generateUserS3Key,
  getTextFromS3,
  saveTextToS3,
} from '../../../utils/s3-utils';
import { translateTextWithClaude } from './utils';
import {
  formatErrorForLogging,
  getErrorMessage,
} from '../../../utils/error-utils';
import { updateWorkflowStatus } from '../../../utils/workflow-state';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
  ProcessingError,
} from '../../../errors';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});

// Zod schema for input validation
const TranslateTextEventSchema = z.object({
  formattedTextFileKey: z
    .string({
      required_error: 'formattedTextFileKey is required',
      invalid_type_error: 'formattedTextFileKey must be a string',
    })
    .min(1, 'formattedTextFileKey cannot be empty'),
  storageBucket: z
    .string({
      required_error: 'storageBucket is required',
      invalid_type_error: 'storageBucket must be a string',
    })
    .min(1, 'storageBucket cannot be empty'),
  originalFileKey: z
    .string({
      required_error: 'originalFileKey is required',
      invalid_type_error: 'originalFileKey must be a string',
    })
    .min(1, 'originalFileKey cannot be empty'),
  userId: z
    .string({
      required_error: 'userId is required',
      invalid_type_error: 'userId must be a string',
    })
    .min(1, 'userId cannot be empty'),
  targetLanguage: z
    .string({
      required_error: 'targetLanguage is required',
      invalid_type_error: 'targetLanguage must be a string',
    })
    .min(1, 'targetLanguage cannot be empty'),
  workflowId: z
    .string({
      required_error: 'workflowId is required',
      invalid_type_error: 'workflowId must be a string',
    })
    .min(1, 'workflowId cannot be empty'),
  doSpeech: z.boolean().optional(),
  timestamp: z.number().optional(),
});

interface TranslateTextEvent extends WorkflowCommonState {
  formattedTextFileKey: string;
  targetLanguage: string;
  workflowId: string;
}

export const handler: Handler = async (event: TranslateTextEvent) => {
  console.log('TranslateText Lambda event:', JSON.stringify(event, null, 2));

  const userWorkflowsTable = process.env.USER_WORKFLOWS_TABLE;
  if (!userWorkflowsTable) {
    throw new Error('USER_WORKFLOWS_TABLE environment variable is not set');
  }

  // Validate input using Zod schema
  try {
    TranslateTextEventSchema.parse(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(firstError?.message || 'Validation failed');
    }
    throw new ValidationError('Invalid input format');
  }

  const {
    formattedTextFileKey,
    storageBucket,
    originalFileKey,
    userId,
    targetLanguage,
    workflowId,
    doSpeech = false,
  } = event;

  // Update workflow status to TRANSLATING
  try {
    await updateWorkflowStatus(
      userWorkflowsTable,
      userId,
      workflowId,
      'TRANSLATING'
    );
    console.log('Updated workflow status to TRANSLATING');
  } catch (statusError) {
    console.error(
      'Failed to update workflow status to TRANSLATING:',
      statusError
    );
    throw new ExternalServiceError(
      `Failed to update workflow status: ${getErrorMessage(statusError)}`,
      'DynamoDB'
    );
  }

  let textToTranslate: string | undefined = undefined;

  // Always fetch text from S3 if formattedTextFileKey is provided
  if (formattedTextFileKey) {
    try {
      textToTranslate = await getTextFromS3(
        storageBucket,
        formattedTextFileKey
      );
      console.log(
        `Fetched formatted text from S3: s3://${storageBucket}/${formattedTextFileKey}`
      );
    } catch (error) {
      console.error(
        'Error fetching formatted text from S3:',
        formatErrorForLogging('S3 fetch', error)
      );
      throw new S3Error('Error fetching formatted text from S3', error);
    }
  }

  // If S3 path is not present or fetch failed, error out (legacy direct text input is no longer supported)
  if (!textToTranslate) {
    console.error(
      'No formattedTextS3Path provided or failed to fetch text from S3.'
    );

    // Update workflow status to FAILED
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'No text content to translate' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ProcessingError('No text content to translate');
  }

  try {
    const translatedText = await translateTextWithClaude(
      bedrockRuntime,
      textToTranslate,
      targetLanguage
    );

    // Generate S3 key for translated text with language info
    const outputKey = generateUserS3Key(
      userId,
      'translated',
      originalFileKey,
      'txt',
      targetLanguage.toLowerCase()
    );

    // Save translated text to S3
    const s3Path = await saveTextToS3(storageBucket, outputKey, translatedText);
    console.log(
      `Translated text saved to S3: s3://${s3Path.bucket}/${s3Path.key}`
    );

    // Determine the appropriate completion status based on workflow parameters
    const completionStatus = doSpeech ? 'TRANSLATION_COMPLETE' : 'SUCCEEDED';

    // Update workflow status with S3 paths
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        completionStatus,
        {
          s3Paths: {
            originalFile: originalFileKey,
            translatedText: s3Path.key,
          },
        }
      );
      console.log(
        `Updated workflow status to ${completionStatus} with translated text path`
      );
    } catch (statusError) {
      console.error(
        `Failed to update workflow status to ${completionStatus}:`,
        statusError
      );
      throw new ExternalServiceError(
        `Failed to update workflow status: ${getErrorMessage(statusError)}`,
        'DynamoDB'
      );
    }

    return {
      message: 'Text translation successful',
      translatedTextFileKey: s3Path.key,
    };
  } catch (error: unknown) {
    console.error(
      'Error translating text or saving to S3:',
      formatErrorForLogging('translate and save', error)
    );

    // Update workflow status to FAILED with error details
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'Error processing text translation' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ExternalServiceError(
      'Error processing text translation',
      'Bedrock',
      error
    );
  }
};
