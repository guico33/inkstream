import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AIProviderFactory,
  AIProviderEnvironment,
  getAiProvider,
} from '../ai-provider-factory';
import { BedrockAIProvider } from '../bedrock-ai-provider';
import { OpenAIProvider } from '../openai-ai-provider';
import { SecretsManager } from '../../../../utils/secrets-manager';

// Mock the providers and secrets manager
vi.mock('../bedrock-ai-provider');
vi.mock('../openai-ai-provider');
vi.mock('../../../../utils/secrets-manager');

const MockedBedrockAIProvider = vi.mocked(BedrockAIProvider);
const MockedOpenAIProvider = vi.mocked(OpenAIProvider);
const MockedSecretsManager = vi.mocked(SecretsManager);

describe('AIProviderFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProvider', () => {
    it('should create a Bedrock provider with correct configuration', () => {
      const config = {
        region: 'us-east-1',
        temperature: 0.2,
        maxTokens: 8000,
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      };

      AIProviderFactory.createProvider({ type: 'bedrock', config });

      expect(MockedBedrockAIProvider).toHaveBeenCalledWith(config);
      expect(MockedBedrockAIProvider).toHaveBeenCalledTimes(1);
    });

    it('should create an OpenAI provider with correct configuration', () => {
      const config = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
        organization: 'test-org',
        temperature: 0.1,
        maxTokens: 4000,
      };

      AIProviderFactory.createProvider({ type: 'openai', config });

      expect(MockedOpenAIProvider).toHaveBeenCalledWith(config);
      expect(MockedOpenAIProvider).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unsupported provider type', () => {
      expect(() => {
        AIProviderFactory.createProvider({
          // @ts-expect-error - Testing invalid provider type
          type: 'invalid',
          config: {},
        });
      }).toThrow('Unsupported AI provider type: invalid');
    });
  });

  describe('createFromEnvironmentAsync', () => {
    it('should create Bedrock provider from environment variables', async () => {
      const env: AIProviderEnvironment = {
        AI_PROVIDER: 'bedrock',
        BEDROCK_REGION: 'us-west-2',
        BEDROCK_TEMPERATURE: '0.3',
        BEDROCK_MAX_TOKENS: '7000',
      };

      await AIProviderFactory.createFromEnvironmentAsync(env);

      expect(MockedBedrockAIProvider).toHaveBeenCalledWith({
        region: 'us-west-2',
        temperature: 0.3,
        maxTokens: 7000,
      });
    });

    it('should create Bedrock provider with default values when environment variables are missing', async () => {
      const env: AIProviderEnvironment = {
        AI_PROVIDER: 'bedrock',
      };

      await AIProviderFactory.createFromEnvironmentAsync(env);

      expect(MockedBedrockAIProvider).toHaveBeenCalledWith({
        region: undefined,
        temperature: 0.1,
        maxTokens: 6000,
      });
    });

    it('should create OpenAI provider from environment variables with secrets manager', async () => {
      const mockApiKey = 'secret-api-key';
      MockedSecretsManager.getSecret.mockResolvedValue(mockApiKey);

      const env: AIProviderEnvironment = {
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY_SECRET_ARN:
          'arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/openai/api-key-xxxxxx',
        OPENAI_MODEL: 'gpt-4',
        OPENAI_ORGANIZATION: 'test-org',
        OPENAI_TEMPERATURE: '0.2',
        OPENAI_MAX_TOKENS: '3000',
      };

      await AIProviderFactory.createFromEnvironmentAsync(env);

      expect(MockedOpenAIProvider).toHaveBeenCalledWith({
        model: 'gpt-4',
        organization: 'test-org',
        temperature: 0.2,
        maxTokens: 3000,
        apiKeyFetcher: expect.any(Function),
      });

      // Test the apiKeyFetcher function
      const calls = MockedOpenAIProvider.mock.calls;
      expect(calls).toHaveLength(1);
      const config = calls[0]?.[0];
      expect(config).toBeDefined();
      const apiKey = await config?.apiKeyFetcher!();
      expect(apiKey).toBe(mockApiKey);
      expect(MockedSecretsManager.getSecret).toHaveBeenCalledWith(
        'arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/openai/api-key-xxxxxx'
      );
    });

    it('should create OpenAI provider with default values', async () => {
      MockedSecretsManager.getSecret.mockResolvedValue('test-key');

      const env: AIProviderEnvironment = {
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY_SECRET_ARN:
          'arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/openai/api-key-xxxxxx',
      };

      await AIProviderFactory.createFromEnvironmentAsync(env);

      expect(MockedOpenAIProvider).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        organization: undefined,
        temperature: 0.1,
        maxTokens: 4000,
        apiKeyFetcher: expect.any(Function),
      });
    });

    it('should throw error when AI_PROVIDER is not set', async () => {
      const env: AIProviderEnvironment = {};

      await expect(
        AIProviderFactory.createFromEnvironmentAsync(env)
      ).rejects.toThrow('AI_PROVIDER environment variable is not set');
    });

    it('should throw error when OpenAI secret name is not provided', async () => {
      const env: AIProviderEnvironment = {
        AI_PROVIDER: 'openai',
      };

      await expect(
        AIProviderFactory.createFromEnvironmentAsync(env)
      ).rejects.toThrow(
        'OpenAI configuration is required. Set OPENAI_API_KEY_SECRET_ARN environment variable.'
      );
    });

    it('should throw error for unsupported provider type from environment', async () => {
      const env: AIProviderEnvironment = {
        // @ts-expect-error - Testing invalid provider type
        AI_PROVIDER: 'unsupported',
      };

      await expect(
        AIProviderFactory.createFromEnvironmentAsync(env)
      ).rejects.toThrow(
        'Unsupported AI provider type from environment: unsupported'
      );
    });
  });

  describe('getAiProvider helper', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.clearAllMocks();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create provider from process.env', async () => {
      MockedSecretsManager.getSecret.mockResolvedValue('test-api-key');

      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY_SECRET_ARN =
        'arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/openai/api-key-xxxxxx';
      process.env.OPENAI_MODEL = 'gpt-4';

      await getAiProvider();

      expect(MockedOpenAIProvider).toHaveBeenCalledWith({
        model: 'gpt-4',
        organization: undefined,
        temperature: 0.1,
        maxTokens: 4000,
        apiKeyFetcher: expect.any(Function),
      });
    });

    it('should throw error when AI_PROVIDER not set in process.env', async () => {
      delete process.env.AI_PROVIDER;

      await expect(getAiProvider()).rejects.toThrow(
        'AI_PROVIDER environment variable is not set'
      );
    });
  });
});
