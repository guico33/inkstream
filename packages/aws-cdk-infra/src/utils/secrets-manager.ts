import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * Utility class for securely retrieving secrets from AWS Secrets Manager
 */
export class SecretsManager {
  private static secretsClient = new SecretsManagerClient({});
  private static cache = new Map<string, { value: string; expiry: number }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Get a secret value from AWS Secrets Manager
   * Results are cached for 5 minutes to improve performance
   *
   * @param secretArn - The ARN of the secret in AWS Secrets Manager
   * @returns The secret value
   */
  static async getSecret(secretArn: string): Promise<string> {
    // Check cache first
    const cached = this.cache.get(secretArn);
    if (cached && Date.now() < cached.expiry) {
      return cached.value;
    }

    try {
      console.log(`Fetching secret: ${secretArn}`);

      const command = new GetSecretValueCommand({
        SecretId: secretArn,
      });

      const response = await this.secretsClient.send(command);

      if (!response.SecretString) {
        throw new Error(`Secret ${secretArn} not found or has no value`);
      }

      const value = response.SecretString;

      // Cache the result
      this.cache.set(secretArn, {
        value,
        expiry: Date.now() + this.CACHE_TTL,
      });

      return value;
    } catch (error: unknown) {
      console.error(`Failed to retrieve secret ${secretArn}:`, error);

      if (error instanceof Error) {
        throw new Error(
          `Failed to retrieve secret ${secretArn}: ${error.message}`
        );
      } else {
        throw new Error(
          `Failed to retrieve secret ${secretArn}: Unknown error`
        );
      }
    }
  }

  /**
   * Get OpenAI API key from Secrets Manager
   * @param secretArn - The ARN of the secret in AWS Secrets Manager
   */
  static async getOpenAIApiKey(secretArn: string): Promise<string> {
    return this.getSecret(secretArn);
  }

  /**
   * Clear the cache (useful for testing or when secrets are rotated)
   */
  static clearCache(): void {
    this.cache.clear();
  }
}
