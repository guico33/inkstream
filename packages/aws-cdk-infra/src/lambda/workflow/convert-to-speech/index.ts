import { Handler } from 'aws-lambda';
import { PollyClient } from '@aws-sdk/client-polly';

// Import utility functions
import { getTextFromS3 } from '../../../utils/s3-utils';
import {
  createS3Response,
  createS3ErrorResponse,
} from '../../../utils/response-utils';
import {
  formatErrorForLogging,
  getErrorMessage,
} from '../../../utils/error-utils';
import { textToSpeech } from './utils';

// Initialize Polly client
const polly = new PollyClient({});

interface ConvertToSpeechRequest {
  fileKey: string;
  formattedTextS3Path?: { bucket: string; key: string };
  translatedTextS3Path?: { bucket: string; key: string };
  outputBucket: string;
  textToSpeak?: string; // Allow direct text input
  targetLanguage?: string;
  workflowId?: string;
  userId: string; // Added for user-specific S3 paths
}

export const handler: Handler = async (event: ConvertToSpeechRequest) => {
  console.log(
    'ConvertToSpeech Lambda invoked with event:',
    JSON.stringify(event, null, 2)
  );

  let textForSpeech: string | undefined = undefined;
  let sourceLanguage = event.targetLanguage || 'english';

  // Always fetch text from S3, preferring translated text, then formatted text
  if (event.translatedTextS3Path?.bucket && event.translatedTextS3Path?.key) {
    try {
      console.log(
        `Fetching translated text from S3: s3://${event.translatedTextS3Path.bucket}/${event.translatedTextS3Path.key}`
      );
      textForSpeech = await getTextFromS3(
        event.translatedTextS3Path.bucket,
        event.translatedTextS3Path.key
      );
      sourceLanguage = event.targetLanguage || 'english';
    } catch (error) {
      console.error(
        'Error fetching translated text from S3:',
        formatErrorForLogging('S3 fetch', error)
      );
      const errorResponse = createS3ErrorResponse(
        500,
        'Error fetching translated text from S3',
        error
      );
      return {
        ...event,
        ...errorResponse,
        speechError: `Failed to fetch translated text: ${getErrorMessage(
          error
        )}`,
      };
    }
  } else if (
    event.formattedTextS3Path?.bucket &&
    event.formattedTextS3Path?.key
  ) {
    try {
      console.log(
        `Fetching formatted text from S3: s3://${event.formattedTextS3Path.bucket}/${event.formattedTextS3Path.key}`
      );
      textForSpeech = await getTextFromS3(
        event.formattedTextS3Path.bucket,
        event.formattedTextS3Path.key
      );
      sourceLanguage = 'english';
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
        speechError: `Failed to fetch formatted text: ${getErrorMessage(
          error
        )}`,
      };
    }
  }

  // If neither S3 path is present or fetch failed, error out (legacy direct text input is no longer supported)
  if (!textForSpeech) {
    console.error(
      'No S3 text path provided or failed to fetch text for speech synthesis.'
    );
    const errorResponse = createS3ErrorResponse(
      400,
      'No text content for speech synthesis'
    );
    return {
      ...event,
      ...errorResponse,
      speechError: 'No text content provided',
    };
  }

  if (!event.outputBucket) {
    console.error('Output bucket not specified.');
    const errorResponse = createS3ErrorResponse(
      500,
      'Output bucket not configured'
    );
    return {
      ...event,
      ...errorResponse,
      speechError: 'Output bucket not configured',
    };
  }

  try {
    const s3Path = await textToSpeech(
      polly,
      textForSpeech,
      sourceLanguage,
      event.fileKey,
      event.outputBucket,
      event.userId || 'unknown-user'
    );

    const response = createS3Response(
      s3Path,
      'Speech synthesized and saved successfully.',
      { sourceLanguage }
    );

    return {
      ...event,
      ...response,
      speechS3Path: s3Path, // For backward compatibility
    };
  } catch (error: unknown) {
    console.error(
      'Error in speech synthesis handler:',
      formatErrorForLogging('speech synthesis handler', error)
    );

    const errorResponse = createS3ErrorResponse(
      500,
      'Error processing speech synthesis',
      error
    );

    return {
      ...event,
      ...errorResponse,
      speechError: getErrorMessage(error),
    };
  }
};
