import { AIProvider } from './ai-provider';
import { BedrockAIProvider, BedrockConfig } from './bedrock-ai-provider';
import { OpenAIProvider, OpenAIConfig } from './openai-ai-provider';
import { SecretsManager } from '../../../utils/secrets-manager';

export type ProviderType = 'bedrock' | 'openai';
export type ProviderConfig = BedrockConfig | OpenAIConfig;

type CreateProviderParameters =
  | { type: 'bedrock'; config: BedrockConfig }
  | { type: 'openai'; config: OpenAIConfig };

export type AIProviderEnvironment = {
  AI_PROVIDER?: ProviderType;
  BEDROCK_REGION?: string;
  BEDROCK_TEMPERATURE?: string;
  BEDROCK_MAX_TOKENS?: string;
  OPENAI_API_KEY_SECRET_NAME?: string; // Secrets Manager secret name for API key
  OPENAI_MODEL?: string;
  OPENAI_ORGANIZATION?: string;
  OPENAI_TEMPERATURE?: string;
  OPENAI_MAX_TOKENS?: string;
};

/**
 * Factory for creating AI providers
 */
export class AIProviderFactory {
  /**
   * Create an AI provider instance based on type and configuration
   */
  static createProvider(params: CreateProviderParameters): AIProvider {
    const { type, config } = params;

    switch (type) {
      case 'bedrock':
        return new BedrockAIProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      default:
        throw new Error(`Unsupported AI provider type: ${type}`);
    }
  }

  /**
   * Create an AI provider from environment variables
   * Uses AI_PROVIDER environment variable to determine which provider to use
   * For OpenAI, uses AWS Secrets Manager for secure API key retrieval
   */
  static async createFromEnvironmentAsync(
    env: AIProviderEnvironment
  ): Promise<AIProvider> {
    const providerType = env.AI_PROVIDER;

    if (!providerType) {
      throw new Error('AI_PROVIDER environment variable is not set');
    }

    switch (providerType) {
      case 'bedrock':
        return new BedrockAIProvider({
          region: env.BEDROCK_REGION,
          temperature: parseFloat(env.BEDROCK_TEMPERATURE || '0.1'),
          maxTokens: parseInt(env.BEDROCK_MAX_TOKENS || '6000', 10),
        });
      case 'openai':
        if (!env.OPENAI_API_KEY_SECRET_NAME) {
          throw new Error(
            'OpenAI configuration is required. Set OPENAI_API_KEY_SECRET_NAME environment variable.'
          );
        }

        // Use Secrets Manager for secure API key retrieval
        const openaiConfig: OpenAIConfig = {
          model: env.OPENAI_MODEL || 'gpt-4o-mini',
          organization: env.OPENAI_ORGANIZATION,
          temperature: parseFloat(env.OPENAI_TEMPERATURE || '0.1'),
          maxTokens: parseInt(env.OPENAI_MAX_TOKENS || '4000', 10),
          apiKeyFetcher: () =>
            SecretsManager.getSecret(env.OPENAI_API_KEY_SECRET_NAME!),
        };

        return new OpenAIProvider(openaiConfig);
      default:
        throw new Error(
          `Unsupported AI provider type from environment: ${providerType}`
        );
    }
  }
}

/**
 * Async helper function to get an AI provider from environment variables
 * This is the recommended way to initialize AI providers in Lambda functions
 */
export async function getAiProvider(): Promise<AIProvider> {
  return AIProviderFactory.createFromEnvironmentAsync(
    process.env as AIProviderEnvironment
  );
}
