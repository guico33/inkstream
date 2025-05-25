import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const s3 = new S3Client({});

// Claude 3 Haiku model ID
export const MODEL_ID =
  process.env.CLAUDE_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

// Utility to extract text from Textract output JSON
export async function extractTextFromTextractS3(
  s3Path: { bucket: string; key: string },
  s3Client: S3Client = s3
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: s3Path.bucket,
    Key: s3Path.key,
  });
  const response = await s3Client.send(command);
  if (!response || !response.Body) throw new Error('No response body from S3');
  const body = await response.Body.transformToString();
  const textractJson = JSON.parse(body);
  // Extract text from Textract blocks (DocumentTextDetection)
  if (!textractJson.Blocks) throw new Error('No Blocks in Textract output');
  return textractJson.Blocks.filter((b: any) => b.BlockType === 'LINE')
    .map((b: any) => b.Text)
    .join('\n');
}

export async function formatTextWithClaude(
  bedrockRuntime: BedrockRuntimeClient,
  extractedText: string
): Promise<string> {
  if (!extractedText || extractedText.trim() === '') {
    return 'No text content to format.';
  }

  // Truncate very long texts to avoid exceeding model limits
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
  const estimatedInputTokens = Math.ceil(extractedText.length / 4);
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
      max_tokens: parseInt(String(maxTokens)),
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
    return result.content[0].text;
  } catch (error: unknown) {
    console.error('Error invoking Bedrock model:', error);
    if (error instanceof Error) {
      throw new Error(`Bedrock model invocation failed: ${error.message}`);
    } else {
      throw new Error('Bedrock model invocation failed with an unknown error.');
    }
  }
}
