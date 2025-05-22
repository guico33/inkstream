import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Handler } from 'aws-lambda';

// Import utility functions
import { formatErrorForLogging } from '../../../utils/error-utils';
import {
  createS3ErrorResponse,
  createS3Response,
} from '../../../utils/response-utils';
import { generateUserS3Key, saveTextToS3 } from '../../../utils/s3-utils';
import { extractTextFromTextractS3, formatTextWithClaude } from './utils';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});

export const handler: Handler = async (event: any) => {
  console.log('FormatText Lambda event:', JSON.stringify(event, null, 2));

  // Always extract text from S3 if textractOutputS3Path is present
  let extractedText: string | undefined = undefined;
  if (event.textractOutputS3Path) {
    try {
      extractedText = await extractTextFromTextractS3(
        event.textractOutputS3Path
      );
      if (!extractedText) {
        // If extraction returns undefined/null, treat as missing text (400)
        console.warn(
          'No Textract S3 output path provided or failed to extract text.'
        );
        return createS3ErrorResponse(400, 'No extracted text to format');
      }
      console.log(
        'Extracted text from Textract S3 output. Length:',
        extractedText.length
      );
    } catch (err) {
      console.error('Failed to extract text from Textract S3 output:', err);
      return createS3ErrorResponse(
        500,
        'Failed to extract text from Textract output',
        err
      );
    }
  }

  // If textractOutputS3Path is not present, error out (legacy direct text input is no longer supported)
  if (!extractedText) {
    console.warn(
      'No Textract S3 output path provided or failed to extract text.'
    );
    return createS3ErrorResponse(400, 'No extracted text to format');
  }

  if (!event.outputBucket) {
    console.error('Output bucket not specified.');
    return createS3ErrorResponse(500, 'Output bucket not configured');
  }

  try {
    const formattedText = await formatTextWithClaude(
      bedrockRuntime,
      extractedText
    );

    // Determine the output S3 key with user-specific path
    const originalFileKey = event.fileKey;
    const userId = event.userId || 'unknown-user';

    // Generate S3 key for the formatted text file
    const outputKey = generateUserS3Key(
      userId,
      'formatted',
      originalFileKey,
      'txt'
    );

    // Save the formatted text to S3
    const s3Path = await saveTextToS3(
      event.outputBucket,
      outputKey,
      formattedText
    );
    console.log(`Formatted text saved to s3://${s3Path.bucket}/${s3Path.key}`);

    return createS3Response(s3Path, 'Text formatted and saved successfully.', {
      formattedTextLength: formattedText.length,
    });
  } catch (error: unknown) {
    console.error(
      'Error formatting text or saving to S3:',
      formatErrorForLogging('format and save', error)
    );
    return createS3ErrorResponse(
      500,
      'Error processing text formatting',
      error
    );
  }
};
