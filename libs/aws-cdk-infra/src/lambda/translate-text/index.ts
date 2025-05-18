import { Handler } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

// Initialize Bedrock client
const bedrockRuntime = new BedrockRuntimeClient({});

// Claude 3 Haiku model ID
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

interface TranslateRequest {
  formattedText: string;
  targetLanguage: string;
}

async function translateTextWithClaude(
  text: string,
  targetLanguage: string
): Promise<string> {
  if (!text || text.trim() === '') {
    return 'No text content to translate.';
  }

  // Validate target language
  const supportedLanguages = [
    'French',
    'Spanish',
    'German',
    'Italian',
    'Portuguese',
    'Dutch',
    'Russian',
    'Japanese',
    'Chinese',
    'Korean',
    'Arabic',
    'Hindi',
    'Swedish',
    'Norwegian',
    'Danish',
    'Polish',
    'Czech',
    'Finnish',
    'Greek',
    'Turkish',
  ];

  // Default to French if not specified or not supported
  let language = targetLanguage || 'French';
  language = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();

  if (!supportedLanguages.includes(language)) {
    console.warn(
      `Language '${language}' not explicitly supported, but will try translation anyway.`
    );
  }

  // Configure message for Claude
  const prompt = `
Translate the following text into ${language}. Maintain the original formatting, paragraph structure, and any section headers.
Please provide only the translated content without explanations or additional comments.

Here's the text to translate:

${text}
`;

  // Estimate required tokens based on input length
  // Rough approximation: ~4 characters per token for English text
  const estimatedInputTokens = Math.ceil(text.length / 4);
  // Set max_tokens dynamically based on input size, with min 1000 and max 6000
  // Ensure it's an integer
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
      max_tokens: parseInt(String(maxTokens)), // Ensure it's an integer
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
      `Failed to translate text: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export const handler: Handler = async (event: TranslateRequest) => {
  console.log('Translate Lambda invoked with event:', JSON.stringify(event));

  // Check if there's any text to translate
  if (!event.formattedText) {
    throw new Error('Missing formattedText in event');
  }

  // Get the target language from the event or use default
  const targetLanguage = event.targetLanguage || 'French';

  // Translate the text using Claude
  const translatedText = await translateTextWithClaude(
    event.formattedText,
    targetLanguage
  );

  // Keep all original properties and add our result
  // This ensures doTranslate, doSpeech and other properties remain at the root level
  return {
    ...event,
    translatedText,
    targetLanguage,
  };
};
