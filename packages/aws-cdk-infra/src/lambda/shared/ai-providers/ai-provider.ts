/**
 * Abstract base class for AI providers
 * Defines the interface for text formatting and translation operations
 */
export abstract class AIProvider {
  /**
   * Format extracted text to improve readability
   * @param text The raw extracted text to format
   * @returns Promise resolving to formatted text
   */
  abstract formatText(text: string): Promise<string>;

  /**
   * Translate text to the specified target language
   * @param text The text to translate
   * @param targetLanguage The target language for translation
   * @returns Promise resolving to translated text
   */
  abstract translateText(text: string, targetLanguage: string): Promise<string>;
}

/**
 * Configuration interface for AI providers
 */
export interface AIProviderConfig {
  maxTokens?: number;
  temperature?: number;
  modelId?: string;
}
