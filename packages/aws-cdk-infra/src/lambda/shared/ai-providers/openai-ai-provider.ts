import OpenAI from 'openai';
import { AIProvider, AIProviderConfig } from './ai-provider';

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig extends AIProviderConfig {
  apiKey?: string;
  model: string;
  organization?: string;
  apiKeyFetcher?: () => Promise<string>;
}

/**
 * AI Provider implementation using OpenAI GPT models
 */
export class OpenAIProvider extends AIProvider {
  private client: OpenAI | null = null;
  private config: OpenAIConfig;
  private initialized = false;

  constructor(config: OpenAIConfig) {
    super();
    this.config = {
      temperature: 0.1,
      maxTokens: 4000,
      ...config,
    };

    // If apiKey is provided directly, initialize immediately
    if (this.config.apiKey) {
      this.initializeClient(this.config.apiKey);
    } else if (!this.config.apiKeyFetcher) {
      throw new Error(
        'OpenAI provider requires either apiKey or apiKeyFetcher to be provided.'
      );
    }
  }

  /**
   * Initialize the OpenAI client with the provided API key
   */
  private initializeClient(apiKey: string): void {
    this.client = new OpenAI({
      apiKey,
      organization: this.config.organization,
    });
    this.initialized = true;
  }

  /**
   * Ensure the client is initialized, fetching API key if necessary
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized && this.client) {
      return;
    }

    if (this.config.apiKeyFetcher) {
      const apiKey = await this.config.apiKeyFetcher();
      this.initializeClient(apiKey);
    } else {
      throw new Error('OpenAI provider is not properly configured.');
    }
  }

  async formatText(text: string): Promise<string> {
    await this.ensureInitialized();

    if (!text || text.trim() === '') {
      throw new Error('No text content to format.');
    }

    if (!this.client) {
      throw new Error('OpenAI client is not initialized.');
    }

    // Truncate very long texts to avoid exceeding model limits
    const MAX_CHARS = 120000; // Approximately 30,000 tokens for GPT-4o-mini
    let truncated = false;
    let processedText = text;

    if (text.length > MAX_CHARS) {
      processedText = text.substring(0, MAX_CHARS);
      truncated = true;
      console.warn(
        `Text truncated from ${text.length} to ${MAX_CHARS} characters`
      );
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a text formatting assistant. Your task is to format and organize extracted text to improve readability.

Consider:
- Fixing any formatting issues
- Organizing into logical paragraphs
- Correcting obvious OCR errors
- Adding section headers where appropriate
- Preserving the key information

${
  truncated
    ? 'Note: The text was truncated due to length limitations. Please format what is provided.'
    : ''
}

Only return the formatted text without any additional commentary or explanations.`,
      },
      {
        role: 'user',
        content: `Please format and organize this extracted text:\n\n${processedText}`,
      },
    ];

    return this.generateCompletion(messages, processedText);
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    await this.ensureInitialized();

    if (!text || text.trim() === '') {
      throw new Error('No text content to translate.');
    }

    if (!this.client) {
      throw new Error('OpenAI client is not initialized.');
    }

    const normalizedLanguage = this.normalizeTargetLanguage(targetLanguage);

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a professional translation assistant. Translate the provided text into ${normalizedLanguage}.

Instructions:
- Maintain the original formatting, paragraph structure, and any section headers
- Provide only the translated content without explanations or additional comments
- Preserve the meaning and tone of the original text
- Keep any technical terms or proper nouns appropriate for the target language`,
      },
      {
        role: 'user',
        content: `Translate this text to ${normalizedLanguage}:\n\n${text}`,
      },
    ];

    return this.generateCompletion(messages, text);
  }

  private async generateCompletion(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    inputText: string
  ): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client is not initialized.');
    }

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const estimatedInputTokens = Math.ceil(inputText.length / 4);
    const maxTokens = Math.min(
      Math.max(estimatedInputTokens * 1.2, 1000),
      this.config.maxTokens || 4000
    );

    console.log(
      `Estimated input tokens: ${estimatedInputTokens}, Using max_tokens: ${Math.floor(
        maxTokens
      )}`
    );

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        messages,
        max_tokens: Math.floor(maxTokens),
        temperature: this.config.temperature || 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content received from OpenAI');
      }

      return content;
    } catch (error: unknown) {
      console.error('Error calling OpenAI API:', error);
      if (error instanceof Error) {
        throw new Error(`OpenAI API call failed: ${error.message}`);
      } else {
        throw new Error('OpenAI API call failed with an unknown error.');
      }
    }
  }

  /**
   * Normalize target language to full language name for better translation
   */
  private normalizeTargetLanguage(targetLanguage: string): string {
    const languageMap: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ja: 'Japanese',
      ko: 'Korean',
      zh: 'Chinese',
      ru: 'Russian',
      ar: 'Arabic',
    };

    const normalized = targetLanguage.toLowerCase();
    return languageMap[normalized] || targetLanguage;
  }
}
