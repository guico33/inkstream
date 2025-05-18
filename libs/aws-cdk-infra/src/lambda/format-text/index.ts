import { Handler } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});

// Claude 3 Haiku model ID
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

interface FormatRequest {
  extractedText: string;
  fileKey: string;
  fileType: string;
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
    console.error('Error calling Bedrock:', error);
    throw new Error(
      `Failed to format text: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export const handler: Handler = async (event: FormatRequest) => {
  console.log('Format Lambda invoked with event:', JSON.stringify(event));

  if (!event.extractedText) {
    throw new Error('Missing extractedText in event');
  }

  // Format the extracted text using Claude
  const formattedText = await formatTextWithClaude(event.extractedText);

  // Keep all original properties and add our result
  // This ensures doTranslate, doSpeech and other properties remain at the root level
  return {
    ...event,
    formattedText,
  };
};
