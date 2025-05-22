import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

// Claude 3 Haiku model ID
export const MODEL_ID =
  process.env.CLAUDE_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

export const SUPPORTED_LANGUAGES = [
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

export function normalizeTargetLanguage(
  targetLanguage: string | undefined
): string {
  let language = targetLanguage || 'French';
  language = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();
  return language;
}

export function buildClaudeTranslationPrompt(
  text: string,
  language: string
): string {
  return `
Translate the following text into ${language}. Maintain the original formatting, paragraph structure, and any section headers.
Please provide only the translated content without explanations or additional comments.

Here's the text to translate:

${text}
`;
}

export function estimateClaudeTokens(text: string): {
  estimatedInputTokens: number;
  maxTokens: number;
} {
  const estimatedInputTokens = Math.ceil(text.length / 4);
  const maxTokens = Math.floor(
    Math.min(Math.max(estimatedInputTokens * 1.2, 1000), 6000)
  );
  return { estimatedInputTokens, maxTokens };
}

export async function translateTextWithClaude(
  bedrockRuntime: BedrockRuntimeClient,
  text: string,
  targetLanguage: string
): Promise<string> {
  if (!text || text.trim() === '') {
    return 'No text content to translate.';
  }

  const language = normalizeTargetLanguage(targetLanguage);
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    console.warn(
      `Language '${language}' not explicitly supported, but will try translation anyway.`
    );
  }

  const prompt = buildClaudeTranslationPrompt(text, language);
  const { estimatedInputTokens, maxTokens } = estimateClaudeTokens(text);

  console.log(
    `Estimated input tokens: ${estimatedInputTokens}, Using max_tokens: ${maxTokens}`
  );

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
    console.error('Error calling Bedrock:', error);
    throw new Error(
      `Failed to translate text: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}
