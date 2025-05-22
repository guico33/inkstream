import { Handler } from 'aws-lambda';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Import utility modules
import {
  getTextFromS3,
  generateUserS3Key,
  saveTextToS3,
} from '../../../utils/s3-utils';
import {
  createS3Response,
  createS3ErrorResponse,
} from '../../../utils/response-utils';
import {
  getErrorMessage,
  formatErrorForLogging,
} from '../../../utils/error-utils';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});

// Claude 3 Haiku model ID
import { translateTextWithClaude } from './utils';

interface TranslateRequest {
  formattedTextS3Path?: { bucket: string; key: string }; // Input can now be an S3 path to the formatted text
  formattedText?: string; // Or direct text (legacy or for testing)
  targetLanguage: string;
  fileKey: string; // Original file key for naming output
  outputBucket: string; // Bucket to save translated text
  userId: string; // Added for user-specific S3 paths
  workflowId?: string; // Optional workflow ID for tracking
}

export const handler: Handler = async (event: TranslateRequest) => {
  console.log('TranslateText Lambda event:', JSON.stringify(event, null, 2));

  let textToTranslate: string | undefined = undefined;

  // Always fetch text from S3 if formattedTextS3Path is provided
  if (event.formattedTextS3Path?.bucket && event.formattedTextS3Path?.key) {
    try {
      textToTranslate = await getTextFromS3(
        event.formattedTextS3Path.bucket,
        event.formattedTextS3Path.key
      );
      console.log(
        `Fetched formatted text from S3: s3://${event.formattedTextS3Path.bucket}/${event.formattedTextS3Path.key}`
      );
    } catch (error) {
      console.error(
        'Error fetching formatted text from S3:',
        formatErrorForLogging('S3 fetch', error)
      );
      const errorResponse = createS3ErrorResponse(
        500,
        'Error fetching formatted text from S3',
        error
      );
      return {
        ...event,
        ...errorResponse,
        translationError: 'Failed to fetch text from S3',
      };
    }
  }

  // If S3 path is not present or fetch failed, error out (legacy direct text input is no longer supported)
  if (!textToTranslate) {
    console.error(
      'No formattedTextS3Path provided or failed to fetch text from S3.'
    );
    const errorResponse = createS3ErrorResponse(
      400,
      'No text content to translate'
    );
    return {
      ...event, // Preserve event properties for workflow continuity
      ...errorResponse,
      translationError: 'No text content provided',
    };
  }

  if (!event.outputBucket) {
    console.error('Output bucket not specified.');
    const errorResponse = createS3ErrorResponse(
      500,
      'Output bucket not configured'
    );
    return {
      ...event, // Preserve event properties for workflow continuity
      ...errorResponse,
      translationError: 'Output bucket not configured',
    };
  }

  const targetLanguage = event.targetLanguage || 'French';

  try {
    const translatedText = await translateTextWithClaude(
      bedrockRuntime,
      textToTranslate,
      targetLanguage
    );

    const userId = event.userId || 'unknown-user';

    // Generate S3 key for translated text with language info
    const outputKey = generateUserS3Key(
      userId,
      'translated',
      event.fileKey,
      'txt',
      targetLanguage.toLowerCase()
    );

    // Save translated text to S3
    const s3Path = await saveTextToS3(
      event.outputBucket,
      outputKey,
      translatedText
    );
    console.log(
      `Translated text saved to S3: s3://${s3Path.bucket}/${s3Path.key}`
    );

    // Return success response with workflow integration data
    const response = createS3Response(
      s3Path,
      'Text translated and saved successfully.',
      {
        targetLanguageUsed: targetLanguage,
        translatedTextLength: translatedText.length,
      }
    );

    // Return all original event properties plus response data for workflow continuity
    return {
      ...event,
      ...response,
      translatedTextS3Path: s3Path, // Legacy field for backward compatibility
    };
  } catch (error: unknown) {
    console.error(
      'Error translating text or saving to S3:',
      formatErrorForLogging('translate and save', error)
    );

    const errorResponse = createS3ErrorResponse(
      500,
      'Error processing text translation',
      error
    );

    return {
      ...event,
      ...errorResponse,
      translationError: getErrorMessage(error),
    };
  }
};
