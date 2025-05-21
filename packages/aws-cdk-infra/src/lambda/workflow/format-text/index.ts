import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// Import utility functions
import { formatErrorForLogging } from '../../../utils/error-utils';
import {
  createS3ErrorResponse,
  createS3Response,
} from '../../../utils/response-utils';
import { generateUserS3Key, saveTextToS3 } from '../../../utils/s3-utils';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});
const s3 = new S3Client({});

// Claude 3 Haiku model ID
const MODEL_ID =
  process.env.CLAUDE_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

// Utility to extract text from Textract output JSON
async function extractTextFromTextractS3(s3Path: {
  bucket: string;
  key: string;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: s3Path.bucket,
    Key: s3Path.key,
  });
  const response = await s3.send(command);
  if (!response.Body) throw new Error('No response body from S3');
  const body = await response.Body.transformToString();
  const textractJson = JSON.parse(body);
  // Extract text from Textract blocks (DocumentTextDetection)
  if (!textractJson.Blocks) throw new Error('No Blocks in Textract output');
  return textractJson.Blocks.filter((b: any) => b.BlockType === 'LINE')
    .map((b: any) => b.Text)
    .join('\n');
}

async function formatTextWithClaude(extractedText: string): Promise<string> {
  if (!extractedText || extractedText.trim() === '') {
    return 'No text content to format.';
  }

  // Truncate very long texts to avoid exceeding model limits
  // Claude's context window is 200k tokens, but we'll be conservative
  const MAX_CHARS = 150000; // Approximately 37,500 tokens
  let truncated = false;
  let processedText = extractedText;

  if (extractedText.length > MAX_CHARS) {
    processedText = extractedText.substring(0, MAX_CHARS);
    truncated = true;
    console.log(
      `Text truncated from ${extractedText.length} to ${MAX_CHARS} characters`
    );
  }

  // Configure message for Claude
  const prompt = `
I have extracted text from a document. Please format and organize this text to improve readability. 

Consider:
- Fixing any formatting issues
- Organizing into logical paragraphs
- Correcting obvious OCR errors
- Adding section headers where appropriate
- Preserving the key information
${
  truncated
    ? '\nNote: The text was truncated due to length limitations. Please format what is provided.'
    : ''
}

Here's the extracted text:

${processedText}
`;

  // Estimate required tokens based on input length
  // Rough approximation: ~4 characters per token for English text
  const estimatedInputTokens = Math.ceil(extractedText.length / 4);
  // Set max_tokens dynamically based on input size, with min 1000 and max 6000
  // Ensure it's a round number by using Math.floor
  const maxTokens = Math.floor(
    Math.min(Math.max(estimatedInputTokens * 1.2, 1000), 6000)
  );

  console.log(
    `Estimated input tokens: ${estimatedInputTokens}, Using max_tokens: ${maxTokens}`
  );

  // Prepare request for Bedrock
  const input = {
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: parseInt(String(maxTokens)), // Convert to integer
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  };

  try {
    const response = await bedrockRuntime.send(new InvokeModelCommand(input));
    const result = JSON.parse(new TextDecoder().decode(response.body));

    // Extract the response text from Claude's response
    return result.content[0].text;
  } catch (error: unknown) {
    console.error('Error invoking Bedrock model:', error);
    // It's better to throw the error here and let the handler catch it
    // So the handler can decide on the overall Lambda response structure
    if (error instanceof Error) {
      throw new Error(`Bedrock model invocation failed: ${error.message}`);
    } else {
      throw new Error('Bedrock model invocation failed with an unknown error.');
    }
  }
}

export const handler: Handler = async (event: any) => {
  console.log('FormatText Lambda event:', JSON.stringify(event, null, 2));

  // Always extract text from S3 if textractOutputS3Path is present
  let extractedText: string | undefined = undefined;
  if (event.textractOutputS3Path) {
    try {
      extractedText = await extractTextFromTextractS3(
        event.textractOutputS3Path
      );
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
    const formattedText = await formatTextWithClaude(extractedText);

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
