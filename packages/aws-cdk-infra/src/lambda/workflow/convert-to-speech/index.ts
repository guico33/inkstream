import { Handler } from 'aws-lambda';
import { PollyClient } from '@aws-sdk/client-polly';
import { z } from 'zod';

// Import utility functions
import { getTextFromS3 } from '../../../utils/s3-utils';
import {
  formatErrorForLogging,
  getErrorMessage,
} from '../../../utils/error-utils';
import { textToSpeech } from './utils';
import { WorkflowCommonState } from '@inkstream/shared';
import { updateWorkflowStatus } from '../../../utils/workflow-state';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
} from '../../../errors';

// Initialize Polly client
const polly = new PollyClient({});

// Zod schema for input validation
const ConvertToSpeechEventSchema = z
  .object({
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
    translatedTextFileKey: z
      .string()
      .min(1, 'translatedTextFileKey cannot be empty if provided')
      .optional(),
    formattedTextFileKey: z
      .string()
      .min(1, 'formattedTextFileKey cannot be empty if provided')
      .optional(),
    timestamp: z.number().optional(),
  })
  .refine((data) => data.translatedTextFileKey || data.formattedTextFileKey, {
    message:
      'Either translatedTextFileKey or formattedTextFileKey must be provided',
    path: ['translatedTextFileKey', 'formattedTextFileKey'],
  });

interface ConvertToSpeechEvent extends WorkflowCommonState {
  translatedTextFileKey?: string;
  formattedTextFileKey?: string;
  workflowId: string;
}

export const handler: Handler = async (event: ConvertToSpeechEvent) => {
  console.log(
    'ConvertToSpeech Lambda invoked with event:',
    JSON.stringify(event, null, 2)
  );

  const userWorkflowsTable = process.env.USER_WORKFLOWS_TABLE;
  if (!userWorkflowsTable) {
    throw new Error('USER_WORKFLOWS_TABLE environment variable is not set');
  }

  // Validate input using Zod schema
  try {
    ConvertToSpeechEventSchema.parse(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(firstError?.message || 'Validation failed');
    }
    throw new ValidationError('Invalid input format');
  }

  const {
    translatedTextFileKey,
    formattedTextFileKey,
    storageBucket,
    userId,
    originalFileKey,
    targetLanguage,
    workflowId,
  } = event;

  // Update workflow status to CONVERTING_TO_SPEECH
  try {
    await updateWorkflowStatus(
      userWorkflowsTable,
      userId,
      workflowId,
      'CONVERTING_TO_SPEECH'
    );
    console.log('Updated workflow status to CONVERTING_TO_SPEECH');
  } catch (statusError) {
    console.error(
      'Failed to update workflow status to CONVERTING_TO_SPEECH:',
      statusError
    );
    throw new ExternalServiceError(
      `Failed to update workflow status: ${getErrorMessage(statusError)}`,
      'DynamoDB'
    );
  }

  let textForSpeech: string | undefined = undefined;

  // Always fetch text from S3, preferring translated text, then formatted text
  if (translatedTextFileKey) {
    try {
      console.log(
        `Fetching translated text from S3: s3://${storageBucket}/${translatedTextFileKey}`
      );
      textForSpeech = await getTextFromS3(storageBucket, translatedTextFileKey);
    } catch (error) {
      console.error(
        'Error fetching translated text from S3:',
        formatErrorForLogging('S3 fetch', error)
      );
      throw new S3Error(
        `Failed to fetch translated text: ${getErrorMessage(error)}`
      );
    }
  } else if (formattedTextFileKey) {
    try {
      console.log(
        `Fetching formatted text from S3: s3://${storageBucket}/${formattedTextFileKey}`
      );
      textForSpeech = await getTextFromS3(storageBucket, formattedTextFileKey);
    } catch (error) {
      console.error(
        'Error fetching formatted text from S3:',
        formatErrorForLogging('S3 fetch', error)
      );
      throw new S3Error(
        `Failed to fetch formatted text: ${getErrorMessage(error)}`
      );
    }
  }

  // If neither S3 path is present or fetch failed, error out (legacy direct text input is no longer supported)
  if (!textForSpeech) {
    console.error(
      'No S3 text path provided or failed to fetch text for speech synthesis.'
    );

    // Update workflow status to FAILED
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'No text content provided for speech synthesis' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ValidationError('No text content provided for speech synthesis');
  }

  // Ensure targetLanguage is defined (should be guaranteed by Zod validation)
  if (!targetLanguage) {
    // Update workflow status to FAILED
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'targetLanguage is required for speech synthesis' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ValidationError(
      'targetLanguage is required for speech synthesis'
    );
  }

  try {
    const s3Path = await textToSpeech(
      polly,
      textForSpeech,
      targetLanguage,
      originalFileKey,
      storageBucket,
      userId
    );

    // Update workflow status to SUCCEEDED with S3 paths
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'SUCCEEDED',
        {
          s3Paths: {
            originalFile: originalFileKey,
            audioFile: s3Path.key,
          },
        }
      );
      console.log('Updated workflow status to SUCCEEDED with audio file path');
    } catch (statusError) {
      console.error(
        'Failed to update workflow status to SUCCEEDED:',
        statusError
      );
      throw new ExternalServiceError(
        `Failed to update workflow status: ${getErrorMessage(statusError)}`,
        'DynamoDB'
      );
    }

    return {
      message: 'Speech synthesis completed successfully',
      speechFileKey: s3Path.key,
    };
  } catch (error: unknown) {
    console.error(
      'Error in speech synthesis handler:',
      formatErrorForLogging('speech synthesis handler', error)
    );

    // Update workflow status to FAILED with error details
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'Error processing speech synthesis' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ExternalServiceError(
      `Error processing speech synthesis: ${getErrorMessage(error)}`,
      'Polly'
    );
  }
};
