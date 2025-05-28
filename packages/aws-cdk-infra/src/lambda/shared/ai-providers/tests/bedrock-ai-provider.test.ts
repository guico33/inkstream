import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { BedrockAIProvider, BedrockConfig } from '../bedrock-ai-provider';

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime');

const MockedBedrockRuntimeClient = vi.mocked(BedrockRuntimeClient);
const MockedInvokeModelCommand = vi.mocked(InvokeModelCommand);

describe('BedrockAIProvider', () => {
  let provider: BedrockAIProvider;
  let mockClient: { send: Mock };
  const defaultConfig: BedrockConfig = {
    region: 'us-east-1',
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the client
    mockClient = { send: vi.fn() };
    MockedBedrockRuntimeClient.mockImplementation(() => mockClient as any);

    provider = new BedrockAIProvider(defaultConfig);
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      new BedrockAIProvider({ region: 'us-west-2' });

      // The BedrockRuntimeClient should be called with the region config
      expect(MockedBedrockRuntimeClient).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-west-2',
        })
      );
    });

    it('should use provided configuration values', () => {
      const config: BedrockConfig = {
        region: 'eu-west-1',
        temperature: 0.5,
        maxTokens: 8000,
        modelId: 'custom-model',
      };

      new BedrockAIProvider(config);

      expect(MockedBedrockRuntimeClient).toHaveBeenCalledWith(config);
    });
  });

  describe('formatText', () => {
    it('should format text successfully', async () => {
      const inputText = 'This is some unformatted text that needs improvement.';
      const expectedOutput =
        'This is properly formatted text with improved readability.';

      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: expectedOutput }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await provider.formatText(inputText);

      expect(result).toBe(expectedOutput);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
      expect(MockedInvokeModelCommand).toHaveBeenCalledWith({
        modelId: defaultConfig.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: expect.stringContaining(inputText),
      });
    });

    it('should handle text truncation for very long texts', async () => {
      const longText = 'a'.repeat(200000); // Text longer than MAX_CHARS (150000)
      const expectedOutput = 'Formatted text';

      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: expectedOutput }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await provider.formatText(longText);

      expect(result).toBe(expectedOutput);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Text truncated from 200000 to 150000 characters'
        )
      );

      consoleSpy.mockRestore();
    });

    it('should throw error for empty text', async () => {
      await expect(provider.formatText('')).rejects.toThrow(
        'No text content to format.'
      );

      await expect(provider.formatText('   ')).rejects.toThrow(
        'No text content to format.'
      );
    });

    it('should handle Bedrock API errors', async () => {
      const inputText = 'Some text to format';
      const error = new Error('Bedrock service error');

      mockClient.send.mockRejectedValue(error);

      await expect(provider.formatText(inputText)).rejects.toThrow(
        'Bedrock model invocation failed: Bedrock service error'
      );
    });

    it('should handle unknown errors', async () => {
      const inputText = 'Some text to format';

      mockClient.send.mockRejectedValue('Unknown error');

      await expect(provider.formatText(inputText)).rejects.toThrow(
        'Bedrock model invocation failed with an unknown error.'
      );
    });
  });

  describe('translateText', () => {
    it('should translate text successfully', async () => {
      const inputText = 'Hello, how are you?';
      const targetLanguage = 'French';
      const expectedOutput = 'Bonjour, comment allez-vous ?';

      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: expectedOutput }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);

      const result = await provider.translateText(inputText, targetLanguage);

      expect(result).toBe(expectedOutput);
      expect(mockClient.send).toHaveBeenCalledTimes(1);

      const calls = MockedInvokeModelCommand.mock.calls;
      expect(calls).toHaveLength(1);
      const commandCall = calls[0]?.[0];
      expect(commandCall).toBeDefined();
      const body = JSON.parse(commandCall?.body as string);
      expect(body.messages[0].content[0].text).toContain('French');
      expect(body.messages[0].content[0].text).toContain(inputText);
    });

    it('should normalize target language', async () => {
      const inputText = 'Test text';
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'Translated text' }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);

      await provider.translateText(inputText, 'french');

      const calls = MockedInvokeModelCommand.mock.calls;
      expect(calls).toHaveLength(1);
      const commandCall = calls[0]?.[0];
      expect(commandCall).toBeDefined();
      const body = JSON.parse(commandCall?.body as string);
      expect(body.messages[0].content[0].text).toContain('French'); // Should be capitalized
    });

    it('should handle unsupported languages with warning', async () => {
      const inputText = 'Test text';
      const unsupportedLanguage = 'Klingon';
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'Translated text' }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await provider.translateText(inputText, unsupportedLanguage);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Language 'Klingon' not explicitly supported, but will try translation anyway."
      );

      consoleSpy.mockRestore();
    });

    it('should default to French when no target language provided', async () => {
      const inputText = 'Test text';
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'Texte traduit' }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);

      await provider.translateText(inputText, '');

      const calls = MockedInvokeModelCommand.mock.calls;
      expect(calls).toHaveLength(1);
      const commandCall = calls[0]?.[0];
      expect(commandCall).toBeDefined();
      const body = JSON.parse(commandCall?.body as string);
      expect(body.messages[0].content[0].text).toContain('French');
    });

    it('should throw error for empty text', async () => {
      await expect(provider.translateText('', 'French')).rejects.toThrow(
        'No text content to translate.'
      );

      await expect(provider.translateText('   ', 'French')).rejects.toThrow(
        'No text content to translate.'
      );
    });
  });

  describe('token estimation and limits', () => {
    it('should calculate appropriate max_tokens based on input length', async () => {
      const inputText = 'a'.repeat(4000); // ~1000 tokens
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'Response' }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await provider.formatText(inputText);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Estimated input tokens: 1000')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using max_tokens: 1200')
      );

      const calls = MockedInvokeModelCommand.mock.calls;
      expect(calls).toHaveLength(1);
      const commandCall = calls[0]?.[0];
      expect(commandCall).toBeDefined();
      const body = JSON.parse(commandCall?.body as string);
      expect(body.max_tokens).toBe(1200);

      consoleSpy.mockRestore();
    });

    it('should respect maximum token limits', async () => {
      const longText = 'a'.repeat(25000); // Very long text
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'Response' }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);

      await provider.formatText(longText);

      const calls = MockedInvokeModelCommand.mock.calls;
      expect(calls).toHaveLength(1);
      const commandCall = calls[0]?.[0];
      expect(commandCall).toBeDefined();
      const body = JSON.parse(commandCall?.body as string);
      expect(body.max_tokens).toBeLessThanOrEqual(6000); // Should not exceed maxTokens
    });

    it('should use minimum of 1000 tokens', async () => {
      const shortText = 'Hi'; // Very short text
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [{ text: 'Response' }],
          })
        ),
      };

      mockClient.send.mockResolvedValue(mockResponse);

      await provider.formatText(shortText);

      const calls = MockedInvokeModelCommand.mock.calls;
      expect(calls).toHaveLength(1);
      const commandCall = calls[0]?.[0];
      expect(commandCall).toBeDefined();
      const body = JSON.parse(commandCall?.body as string);
      expect(body.max_tokens).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('supported languages', () => {
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

    supportedLanguages.forEach((language) => {
      it(`should support ${language} without warning`, async () => {
        const mockResponse = {
          body: new TextEncoder().encode(
            JSON.stringify({
              content: [{ text: 'Translated' }],
            })
          ),
        };

        mockClient.send.mockResolvedValue(mockResponse);
        const consoleSpy = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => {});

        await provider.translateText('Test', language);

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
      });
    });
  });
});
