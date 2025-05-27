import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Handler } from 'aws-lambda';
import { z } from 'zod';

// Import utility functions
import {
  formatErrorForLogging,
  getErrorMessage,
} from '../../../utils/error-utils';
import { generateUserS3Key, saveTextToS3 } from '../../../utils/s3-utils';
import { updateWorkflowStatus } from '../../../utils/workflow-state';
import { extractTextFromTextractS3, formatTextWithClaude } from './utils';
import { WorkflowCommonState } from '../../../types/workflow';
import {
  ValidationError,
  S3Error,
  ExternalServiceError,
  ProcessingError,
} from '../../../errors';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});

// Zod schema for input validation
const FormatTextEventSchema = z.object({
  textractMergedFileKey: z
    .string({ required_error: 'textractMergedFileKey is required' })
    .min(1, 'textractMergedFileKey cannot be empty'),
  storageBucket: z
    .string({ required_error: 'storageBucket is required' })
    .min(1, 'storageBucket cannot be empty'),
  originalFileKey: z
    .string({ required_error: 'originalFileKey is required' })
    .min(1, 'originalFileKey cannot be empty'),
  userId: z
    .string({ required_error: 'userId is required' })
    .min(1, 'userId cannot be empty'),
  workflowId: z
    .string({ required_error: 'workflowId is required' })
    .min(1, 'workflowId cannot be empty'),
  doTranslate: z.boolean().optional(),
  doSpeech: z.boolean().optional(),
  targetLanguage: z.string().optional(),
  timestamp: z.number().optional(),
});

interface FormatTextEvent extends WorkflowCommonState {
  textractMergedFileKey: string;
  workflowId: string;
}

export const handler: Handler = async (event: FormatTextEvent) => {
  console.log('FormatText Lambda event:', JSON.stringify(event, null, 2));

  const userWorkflowsTable = process.env.USER_WORKFLOWS_TABLE;
  if (!userWorkflowsTable) {
    throw new Error('USER_WORKFLOWS_TABLE environment variable is not set');
  }

  // Validate input using Zod schema
  try {
    FormatTextEventSchema.parse(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new ValidationError(firstError?.message || 'Validation failed');
    }
    throw new ValidationError('Invalid input format');
  }

  const {
    textractMergedFileKey,
    storageBucket,
    originalFileKey,
    userId,
    workflowId,
    doTranslate = false,
    doSpeech = false,
  } = event;

  try {
    // Update workflow status to indicate formatting has started
    await updateWorkflowStatus(
      userWorkflowsTable,
      userId,
      workflowId,
      'FORMATTING_TEXT'
    );
    console.log('Updated workflow status to FORMATTING_TEXT');
  } catch (error) {
    console.error(
      'Failed to update workflow status to FORMATTING_TEXT:',
      error
    );
    throw new ExternalServiceError(
      `Failed to update workflow status: ${getErrorMessage(error)}`,
      'DynamoDB'
    );
  }

  // Always extract text from S3 if textractOutputS3Path is present
  let extractedText: string | undefined = undefined;
  if (textractMergedFileKey) {
    try {
      extractedText = await extractTextFromTextractS3({
        bucket: storageBucket,
        key: textractMergedFileKey,
      });
      if (!extractedText) {
        // If extraction returns undefined/null, treat as missing text (400)
        console.warn(
          'No Textract S3 output path provided or failed to extract text.'
        );

        // Update workflow status to FAILED with error details
        try {
          await updateWorkflowStatus(
            userWorkflowsTable,
            userId,
            workflowId,
            'FAILED',
            { error: 'No extracted text to format' }
          );
        } catch (statusError) {
          console.error(
            'Failed to update workflow status to FAILED:',
            statusError
          );
        }

        throw new ProcessingError('No extracted text to format');
      }
      console.log(
        'Extracted text from Textract S3 output. Length:',
        extractedText.length
      );
    } catch (err) {
      console.error('Failed to extract text from Textract S3 output:', err);

      // If it's already a workflow error, just re-throw it
      if (err instanceof ProcessingError) {
        throw err;
      }

      // Update workflow status to FAILED with error details
      try {
        await updateWorkflowStatus(
          userWorkflowsTable,
          userId,
          workflowId,
          'FAILED',
          { error: 'Failed to extract text from Textract output' }
        );
      } catch (statusError) {
        console.error(
          'Failed to update workflow status to FAILED:',
          statusError
        );
      }

      throw new S3Error('Failed to extract text from Textract output', err);
    }
  }

  if (!extractedText) {
    console.warn(
      'No Textract S3 output path provided or failed to extract text.'
    );

    // Update workflow status to FAILED with error details
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'No extracted text to format' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ProcessingError('No extracted text to format');
  }

  try {
    const formattedText = await formatTextWithClaude(
      bedrockRuntime,
      extractedText
    );

    // Generate S3 key for the formatted text file
    const outputKey = generateUserS3Key(
      userId,
      'formatted',
      originalFileKey,
      'txt'
    );

    // Save the formatted text to S3
    const s3Path = await saveTextToS3(storageBucket, outputKey, formattedText);
    console.log(`Formatted text saved to s3://${s3Path.bucket}/${s3Path.key}`);

    // Determine the appropriate completion status based on workflow parameters
    const completionStatus =
      !doTranslate && !doSpeech ? 'SUCCEEDED' : 'TEXT_FORMATTING_COMPLETE';

    // Update workflow status and S3 paths
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        completionStatus,
        {
          s3Paths: {
            originalFile: originalFileKey,
            formattedText: s3Path.key,
          },
        }
      );
      console.log(
        `Updated workflow status to ${completionStatus} with formatted text path`
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
      formattedTextFileKey: s3Path.key,
    };
  } catch (error: unknown) {
    console.error(
      'Error formatting text or saving to S3:',
      formatErrorForLogging('format and save', error)
    );

    // Update workflow status to FAILED with error details
    try {
      await updateWorkflowStatus(
        userWorkflowsTable,
        userId,
        workflowId,
        'FAILED',
        { error: 'Error processing text formatting' }
      );
    } catch (statusError) {
      console.error('Failed to update workflow status to FAILED:', statusError);
    }

    throw new ExternalServiceError(
      'Error processing text formatting',
      'Bedrock',
      error
    );
  }
};
