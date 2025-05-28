import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SecretsManager } from '../secrets-manager';

// Use vi.hoisted to declare mocks so they are available in the mock factory
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({
    send: (...args: any[]) => mockSend(...args),
  })),
  GetSecretValueCommand: vi.fn(),
}));

describe('SecretsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    SecretsManager.clearCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSecret', () => {
    it('should successfully retrieve a secret from AWS Secrets Manager', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret-AbCdEf';
      const secretValue = 'test-secret-value';

      mockSend.mockResolvedValueOnce({
        SecretString: secretValue,
      });

      const result = await SecretsManager.getSecret(secretArn);

      expect(result).toBe(secretValue);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should cache secret values and return cached value on subsequent calls', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret-AbCdEf';
      const secretValue = 'test-secret-value';

      mockSend.mockResolvedValueOnce({
        SecretString: secretValue,
      });

      // First call
      const result1 = await SecretsManager.getSecret(secretArn);
      expect(result1).toBe(secretValue);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await SecretsManager.getSecret(secretArn);
      expect(result2).toBe(secretValue);
      expect(mockSend).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should fetch new secret value after cache expires', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret-AbCdEf';
      const secretValue1 = 'test-secret-value-1';
      const secretValue2 = 'test-secret-value-2';

      // First call
      mockSend.mockResolvedValueOnce({
        SecretString: secretValue1,
      });

      const result1 = await SecretsManager.getSecret(secretArn);
      expect(result1).toBe(secretValue1);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Advance time by 6 minutes (past the 5-minute cache TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Second call after cache expiry
      mockSend.mockResolvedValueOnce({
        SecretString: secretValue2,
      });

      const result2 = await SecretsManager.getSecret(secretArn);
      expect(result2).toBe(secretValue2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw error when secret is not found', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:nonexistent-secret-AbCdEf';

      mockSend.mockResolvedValueOnce({
        SecretString: undefined,
      });

      await expect(SecretsManager.getSecret(secretArn)).rejects.toThrow(
        `Secret ${secretArn} not found or has no value`
      );
    });

    it('should throw error when secret has no SecretString', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:empty-secret-AbCdEf';

      mockSend.mockResolvedValueOnce({});

      await expect(SecretsManager.getSecret(secretArn)).rejects.toThrow(
        `Secret ${secretArn} not found or has no value`
      );
    });

    it('should handle AWS SDK errors with proper error message', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:error-secret-AbCdEf';
      const awsError = new Error(
        "ResourceNotFoundException: Secrets Manager can't find the specified secret."
      );

      mockSend.mockRejectedValueOnce(awsError);

      await expect(SecretsManager.getSecret(secretArn)).rejects.toThrow(
        `Failed to retrieve secret ${secretArn}: ResourceNotFoundException: Secrets Manager can't find the specified secret.`
      );
    });

    it('should handle unknown errors', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:unknown-error-secret-AbCdEf';

      mockSend.mockRejectedValueOnce('Unknown error type');

      await expect(SecretsManager.getSecret(secretArn)).rejects.toThrow(
        `Failed to retrieve secret ${secretArn}: Unknown error`
      );
    });

    it('should log when fetching a secret', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:log-test-secret-AbCdEf';
      const secretValue = 'test-secret-value';

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockSend.mockResolvedValueOnce({
        SecretString: secretValue,
      });

      await SecretsManager.getSecret(secretArn);

      expect(consoleSpy).toHaveBeenCalledWith(`Fetching secret: ${secretArn}`);

      consoleSpy.mockRestore();
    });

    it('should log errors when secret retrieval fails', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:error-log-test-AbCdEf';
      const awsError = new Error('Test error');

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockSend.mockRejectedValueOnce(awsError);

      await expect(SecretsManager.getSecret(secretArn)).rejects.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `Failed to retrieve secret ${secretArn}:`,
        awsError
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getOpenAIApiKey', () => {
    it('should call getSecret with the provided secret ARN', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:openai-api-key-AbCdEf';
      const apiKey = 'sk-test-api-key-123';

      mockSend.mockResolvedValueOnce({
        SecretString: apiKey,
      });

      const result = await SecretsManager.getOpenAIApiKey(secretArn);

      expect(result).toBe(apiKey);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should handle errors from getSecret', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:openai-error-AbCdEf';
      const awsError = new Error('Secret not found');

      mockSend.mockRejectedValueOnce(awsError);

      await expect(SecretsManager.getOpenAIApiKey(secretArn)).rejects.toThrow(
        `Failed to retrieve secret ${secretArn}: Secret not found`
      );
    });
  });

  describe('clearCache', () => {
    it('should clear the cache and force fresh secret retrieval', async () => {
      const secretArn =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:cache-test-secret-AbCdEf';
      const secretValue1 = 'test-secret-value-1';
      const secretValue2 = 'test-secret-value-2';

      // First call
      mockSend.mockResolvedValueOnce({
        SecretString: secretValue1,
      });

      const result1 = await SecretsManager.getSecret(secretArn);
      expect(result1).toBe(secretValue1);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Clear cache
      SecretsManager.clearCache();

      // Second call after clearing cache should fetch fresh value
      mockSend.mockResolvedValueOnce({
        SecretString: secretValue2,
      });

      const result2 = await SecretsManager.getSecret(secretArn);
      expect(result2).toBe(secretValue2);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('caching behavior', () => {
    it('should cache different secrets independently', async () => {
      const secretArn1 =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:secret1-AbCdEf';
      const secretArn2 =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:secret2-XyZwVu';
      const secretValue1 = 'value1';
      const secretValue2 = 'value2';

      // Mock responses for both secrets
      mockSend
        .mockResolvedValueOnce({ SecretString: secretValue1 })
        .mockResolvedValueOnce({ SecretString: secretValue2 });

      // Get both secrets
      const result1 = await SecretsManager.getSecret(secretArn1);
      const result2 = await SecretsManager.getSecret(secretArn2);

      expect(result1).toBe(secretValue1);
      expect(result2).toBe(secretValue2);
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Get secrets again - should use cache
      const result1Cached = await SecretsManager.getSecret(secretArn1);
      const result2Cached = await SecretsManager.getSecret(secretArn2);

      expect(result1Cached).toBe(secretValue1);
      expect(result2Cached).toBe(secretValue2);
      expect(mockSend).toHaveBeenCalledTimes(2); // Still only 2 calls
    });

    it('should handle cache expiry correctly for multiple secrets', async () => {
      const secretArn1 =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:expiry-test1-AbCdEf';
      const secretArn2 =
        'arn:aws:secretsmanager:us-east-1:123456789012:secret:expiry-test2-XyZwVu';
      const secretValue1 = 'value1';
      const secretValue2 = 'value2';

      // Initial calls
      mockSend
        .mockResolvedValueOnce({ SecretString: secretValue1 })
        .mockResolvedValueOnce({ SecretString: secretValue2 });

      await SecretsManager.getSecret(secretArn1);
      await SecretsManager.getSecret(secretArn2);

      expect(mockSend).toHaveBeenCalledTimes(2);

      // Advance time past cache expiry
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Both should fetch fresh values
      mockSend
        .mockResolvedValueOnce({ SecretString: secretValue1 })
        .mockResolvedValueOnce({ SecretString: secretValue2 });

      await SecretsManager.getSecret(secretArn1);
      await SecretsManager.getSecret(secretArn2);

      expect(mockSend).toHaveBeenCalledTimes(4);
    });
  });
});
