import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeTargetLanguage,
  buildClaudeTranslationPrompt,
  estimateClaudeTokens,
  translateTextWithClaude,
} from './utils';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

describe('translate-text utils', () => {
  describe('normalizeTargetLanguage', () => {
    it('capitalizes and defaults to French', () => {
      expect(normalizeTargetLanguage(undefined)).toBe('French');
      expect(normalizeTargetLanguage('french')).toBe('French');
      expect(normalizeTargetLanguage('SPANISH')).toBe('Spanish');
      expect(normalizeTargetLanguage('gErMan')).toBe('German');
    });
  });

  describe('buildClaudeTranslationPrompt', () => {
    it('builds a prompt with language and text', () => {
      const prompt = buildClaudeTranslationPrompt('hello', 'French');
      expect(prompt).toContain('Translate the following text into French');
      expect(prompt).toContain("Here's the text to translate:");
      expect(prompt).toContain('hello');
    });
  });

  describe('estimateClaudeTokens', () => {
    it('estimates tokens and maxTokens', () => {
      const { estimatedInputTokens, maxTokens } = estimateClaudeTokens(
        'abcd'.repeat(1000)
      );
      expect(estimatedInputTokens).toBeGreaterThan(0);
      expect(maxTokens).toBeGreaterThanOrEqual(1000);
      expect(maxTokens).toBeLessThanOrEqual(6000);
    });
  });

  describe('translateTextWithClaude', () => {
    const mockBedrock = {
      send: vi.fn(),
    } as unknown as BedrockRuntimeClient;

    beforeEach(() => {
      (mockBedrock.send as any).mockReset();
    });

    it('returns a message if no text content to translate', async () => {
      const result = await translateTextWithClaude(mockBedrock, '', 'French');
      expect(result).toBe('No text content to translate.');
    });

    it('calls Bedrock and returns the translated text', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: 'Bonjour!' }] })
        ),
      };
      (mockBedrock.send as any).mockResolvedValue(mockResponse);
      const result = await translateTextWithClaude(
        mockBedrock,
        'Hello!',
        'French'
      );
      expect(result).toBe('Bonjour!');
    });

    it('throws if Bedrock throws', async () => {
      (mockBedrock.send as any).mockRejectedValue(new Error('fail bedrock'));
      await expect(
        translateTextWithClaude(mockBedrock, 'Hello!', 'French')
      ).rejects.toThrow(/Failed to translate text: fail bedrock/);
    });

    it('warns if language is not supported', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockResponse = {
        body: new TextEncoder().encode(
          JSON.stringify({ content: [{ text: 'Ciao!' }] })
        ),
      };
      (mockBedrock.send as any).mockResolvedValue(mockResponse);
      await translateTextWithClaude(mockBedrock, 'Hello!', 'Esperanto');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not explicitly supported')
      );
      warnSpy.mockRestore();
    });
  });
});
