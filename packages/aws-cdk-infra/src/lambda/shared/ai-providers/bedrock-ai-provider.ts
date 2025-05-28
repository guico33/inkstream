import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AIProvider, AIProviderConfig } from './ai-provider';

/**
 * Bedrock-specific configuration
 */
export interface BedrockConfig extends AIProviderConfig {
  region?: string;
}

/**
 * AI Provider implementation using AWS Bedrock (Claude 3 Haiku)
 */
export class BedrockAIProvider extends AIProvider {
  private client: BedrockRuntimeClient;
  private config: BedrockConfig;

  constructor(config: BedrockConfig) {
    super();
    this.config = {
      temperature: 0.1,
      maxTokens: 6000,
      ...config,
    };

    this.client = new BedrockRuntimeClient(config);
  }

  async formatText(text: string): Promise<string> {
    if (!text || text.trim() === '') {
      // error here
      throw new Error('No text content to format.');
    }

    // Truncate very long texts to avoid exceeding model limits
    const MAX_CHARS = 150000; // Approximately 37,500 tokens
    let truncated = false;
    let processedText = text;

    if (text.length > MAX_CHARS) {
      processedText = text.substring(0, MAX_CHARS);
      truncated = true;
      console.log(
        `Text truncated from ${text.length} to ${MAX_CHARS} characters`
      );
    }

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

    return this.invokeModel(prompt, processedText);
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    if (!text || text.trim() === '') {
      throw new Error('No text content to translate.');
    }

    const normalizedLanguage = this.normalizeTargetLanguage(targetLanguage);
    const prompt = `
Translate the following text into ${normalizedLanguage}. Maintain the original formatting, paragraph structure, and any section headers.
Please provide only the translated content without explanations or additional comments.

Here's the text to translate:

${text}
`;

    return this.invokeModel(prompt, text);
  }

  private async invokeModel(
    prompt: string,
    inputText: string
  ): Promise<string> {
    // Estimate required tokens based on input length
    const estimatedInputTokens = Math.ceil(inputText.length / 4);
    const maxTokens = Math.floor(
      Math.min(
        Math.max(estimatedInputTokens * 1.2, 1000),
        this.config.maxTokens || 6000
      )
    );

    console.log(
      `Estimated input tokens: ${estimatedInputTokens}, Using max_tokens: ${maxTokens}`
    );

    const input = {
      modelId: this.config.modelId!,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: parseInt(String(maxTokens)),
        temperature: this.config.temperature || 0.1,
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
      const response = await this.client.send(new InvokeModelCommand(input));
      const result = JSON.parse(new TextDecoder().decode(response.body));
      return result.content[0].text;
    } catch (error: unknown) {
      console.error('Error invoking Bedrock model:', error);
      if (error instanceof Error) {
        throw new Error(`Bedrock model invocation failed: ${error.message}`);
      } else {
        throw new Error(
          'Bedrock model invocation failed with an unknown error.'
        );
      }
    }
  }

  private normalizeTargetLanguage(targetLanguage: string): string {
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

    let language = targetLanguage || 'French';
    language =
      language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();

    if (!supportedLanguages.includes(language)) {
      console.warn(
        `Language '${language}' not explicitly supported, but will try translation anyway.`
      );
    }

    return language;
  }
}
