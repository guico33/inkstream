import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import OpenAI from 'openai';
import { OpenAIProvider, OpenAIConfig } from '../openai-ai-provider';

// Mock OpenAI
vi.mock('openai');

const MockedOpenAI = vi.mocked(OpenAI);

describe('OpenAIProvider', () => {
  let mockClient: {
    chat: {
      completions: {
        create: Mock;
      };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the OpenAI client
    mockClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    MockedOpenAI.mockImplementation(() => mockClient as any);
  });

  describe('constructor', () => {
    it('should initialize immediately with API key', () => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
        organization: 'test-org',
      };

      new OpenAIProvider(config);

      expect(MockedOpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        organization: 'test-org',
      });
    });

    it('should use default configuration values', () => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };

      const provider = new OpenAIProvider(config);

      // Test that defaults are applied
      expect((provider as any).config.temperature).toBe(0.1);
      expect((provider as any).config.maxTokens).toBe(4000);
    });

    it('should not initialize immediately without API key but with fetcher', () => {
      const config: OpenAIConfig = {
        model: 'gpt-4',
        apiKeyFetcher: vi.fn().mockResolvedValue('fetched-key'),
      };

      new OpenAIProvider(config);

      expect(MockedOpenAI).not.toHaveBeenCalled();
    });

    it('should throw error when neither apiKey nor apiKeyFetcher provided', () => {
      const config: OpenAIConfig = {
        model: 'gpt-4',
      };

      expect(() => new OpenAIProvider(config)).toThrow(
        'OpenAI provider requires either apiKey or apiKeyFetcher to be provided.'
      );
    });
  });

  describe('ensureInitialized', () => {
    it('should fetch API key and initialize client when using apiKeyFetcher', async () => {
      const apiKeyFetcher = vi.fn().mockResolvedValue('fetched-api-key');
      const config: OpenAIConfig = {
        model: 'gpt-4',
        organization: 'test-org',
        apiKeyFetcher,
      };

      const provider = new OpenAIProvider(config);

      // Mock the formatText method to trigger ensureInitialized
      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Formatted text' } }],
      });

      await provider.formatText('test text');

      expect(apiKeyFetcher).toHaveBeenCalledTimes(1);
      expect(MockedOpenAI).toHaveBeenCalledWith({
        apiKey: 'fetched-api-key',
        organization: 'test-org',
      });
    });

    it('should not reinitialize if already initialized', async () => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };

      const provider = new OpenAIProvider(config);

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Formatted text' } }],
      });

      await provider.formatText('test text 1');
      await provider.formatText('test text 2');

      // Should only be called once during construction
      expect(MockedOpenAI).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatText', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };
      provider = new OpenAIProvider(config);
    });

    it('should format text successfully', async () => {
      const inputText = 'This is some unformatted text that needs improvement.';
      const expectedOutput =
        'This is properly formatted text with improved readability.';

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: expectedOutput } }],
      });

      const result = await provider.formatText(inputText);

      expect(result).toBe(expectedOutput);
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.model).toBe('gpt-4');
      expect(callArgs?.messages).toHaveLength(2);
      expect(callArgs?.messages?.[0]?.role).toBe('system');
      expect(callArgs?.messages?.[1]?.role).toBe('user');
      expect(callArgs?.messages?.[1]?.content).toContain(inputText);
    });

    it('should handle text truncation for very long texts', async () => {
      const longText = 'a'.repeat(150000); // Text longer than MAX_CHARS (120000)
      const expectedOutput = 'Formatted text';

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: expectedOutput } }],
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await provider.formatText(longText);

      expect(result).toBe(expectedOutput);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Text truncated from 150000 to 120000 characters'
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

    it('should handle OpenAI API errors', async () => {
      const inputText = 'Some text to format';
      const error = new Error('OpenAI API error');

      mockClient.chat.completions.create.mockRejectedValue(error);

      await expect(provider.formatText(inputText)).rejects.toThrow(
        'OpenAI API call failed: OpenAI API error'
      );
    });

    it('should handle unknown errors', async () => {
      const inputText = 'Some text to format';

      mockClient.chat.completions.create.mockRejectedValue('Unknown error');

      await expect(provider.formatText(inputText)).rejects.toThrow(
        'OpenAI API call failed with an unknown error.'
      );
    });

    it('should throw error when no content received', async () => {
      const inputText = 'Some text to format';

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      await expect(provider.formatText(inputText)).rejects.toThrow(
        'No content received from OpenAI'
      );
    });
  });

  describe('translateText', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };
      provider = new OpenAIProvider(config);
    });

    it('should translate text successfully', async () => {
      const inputText = 'Hello, how are you?';
      const targetLanguage = 'French';
      const expectedOutput = 'Bonjour, comment allez-vous ?';

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: expectedOutput } }],
      });

      const result = await provider.translateText(inputText, targetLanguage);

      expect(result).toBe(expectedOutput);
      expect(mockClient.chat.completions.create).toHaveBeenCalledTimes(1);

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.messages?.[0]?.content).toContain('French');
      expect(callArgs?.messages?.[1]?.content).toContain(inputText);
      expect(callArgs?.messages?.[1]?.content).toContain('French');
    });

    it('should normalize language codes', async () => {
      const inputText = 'Hello world';
      const expectedOutput = 'Hola mundo';

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: expectedOutput } }],
      });

      await provider.translateText(inputText, 'es');

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.messages?.[0]?.content).toContain('Spanish');
      expect(callArgs?.messages?.[1]?.content).toContain('Spanish');
    });

    it('should use original language name for unknown codes', async () => {
      const inputText = 'Hello world';
      const customLanguage = 'Klingon';

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'tlhIngan Hol' } }],
      });

      await provider.translateText(inputText, customLanguage);

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.messages?.[0]?.content).toContain('Klingon');
      expect(callArgs?.messages?.[1]?.content).toContain('Klingon');
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

  describe('generateCompletion', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4o-mini',
        temperature: 0.2,
        maxTokens: 3000,
      };
      provider = new OpenAIProvider(config);
    });

    it('should calculate appropriate max_tokens based on input length', async () => {
      const inputText = 'a'.repeat(4000); // ~1000 tokens

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await provider.formatText(inputText);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Estimated input tokens: 1000')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using max_tokens: 1200')
      );

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.max_tokens).toBe(1200);
      expect(callArgs?.temperature).toBe(0.2);
      expect(callArgs?.model).toBe('gpt-4o-mini');

      consoleSpy.mockRestore();
    });

    it('should respect maximum token limits', async () => {
      const longText = 'a'.repeat(15000); // Very long text

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      await provider.formatText(longText);

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.max_tokens).toBeLessThanOrEqual(3000); // Should not exceed maxTokens
    });

    it('should use minimum of 1000 tokens', async () => {
      const shortText = 'Hi'; // Very short text

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }],
      });

      await provider.formatText(shortText);

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.max_tokens).toBeGreaterThanOrEqual(1000);
    });

    it('should throw error when client is not initialized', async () => {
      const config: OpenAIConfig = {
        model: 'gpt-4',
        apiKeyFetcher: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
      };

      const provider = new OpenAIProvider(config);

      await expect(provider.formatText('test')).rejects.toThrow(
        'Failed to fetch'
      );
    });
  });

  describe('language normalization', () => {
    let provider: OpenAIProvider;

    beforeEach(() => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };
      provider = new OpenAIProvider(config);

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Translated text' } }],
      });
    });

    const languageMap = [
      ['en', 'English'],
      ['es', 'Spanish'],
      ['fr', 'French'],
      ['de', 'German'],
      ['it', 'Italian'],
      ['pt', 'Portuguese'],
      ['ja', 'Japanese'],
      ['ko', 'Korean'],
      ['zh', 'Chinese'],
      ['ru', 'Russian'],
      ['ar', 'Arabic'],
    ];

    languageMap.forEach(([code, fullName]) => {
      it(`should normalize ${code} to ${fullName}`, async () => {
        await provider.translateText('Test text', code!);

        const calls = mockClient.chat.completions.create.mock.calls;
        expect(calls).toHaveLength(1);
        const callArgs = calls[0]?.[0];
        expect(callArgs).toBeDefined();
        expect(callArgs?.messages?.[0]?.content).toContain(fullName);
        expect(callArgs?.messages?.[1]?.content).toContain(fullName);
      });
    });

    it('should preserve unknown language names', async () => {
      const customLanguage = 'Elvish';

      await provider.translateText('Test text', customLanguage);

      const calls = mockClient.chat.completions.create.mock.calls;
      expect(calls).toHaveLength(1);
      const callArgs = calls[0]?.[0];
      expect(callArgs).toBeDefined();
      expect(callArgs?.messages?.[0]?.content).toContain('Elvish');
      expect(callArgs?.messages?.[1]?.content).toContain('Elvish');
    });
  });

  describe('error handling scenarios', () => {
    it('should handle initialization failure with apiKeyFetcher', async () => {
      const apiKeyFetcher = vi
        .fn()
        .mockRejectedValue(new Error('Secret fetch failed'));
      const config: OpenAIConfig = {
        model: 'gpt-4',
        apiKeyFetcher,
      };

      const provider = new OpenAIProvider(config);

      await expect(provider.formatText('test')).rejects.toThrow(
        'Secret fetch failed'
      );
    });

    it('should handle empty choices array from OpenAI', async () => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };
      const provider = new OpenAIProvider(config);

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [],
      });

      await expect(provider.formatText('test')).rejects.toThrow(
        'No content received from OpenAI'
      );
    });

    it('should handle missing message in choice', async () => {
      const config: OpenAIConfig = {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      };
      const provider = new OpenAIProvider(config);

      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{}],
      });

      await expect(provider.formatText('test')).rejects.toThrow(
        'No content received from OpenAI'
      );
    });
  });
});
