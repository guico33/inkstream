import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib';

export interface SecretsConstructProps {
  /**
   * Environment name to namespace the parameters (e.g., 'dev', 'prod')
   */
  envName: string;

  /**
   * Application name to namespace the parameters (e.g., 'inkstream')
   */
  appName?: string;

  /**
   * OpenAI API Key secret ARN (manually created in AWS Secrets Manager)
   */
  openaiApiKeySecretArn?: string;

  /**
   * Google Client Secret secret ARN (manually created in AWS Secrets Manager) - required
   */
  googleClientSecretSecretArn: string;
}

export interface SecretResource {
  /**
   * The secret name/ARN in AWS Secrets Manager
   */
  secretName: string;

  /**
   * The Secrets Manager secret object
   */
  secret: secretsmanager.Secret;
}

/**
 * Construct for managing application secrets in AWS Secrets Manager
 * References manually created secrets rather than creating them
 */
export class SecretsConstruct extends Construct {
  public readonly openaiApiKeySecret?: secretsmanager.ISecret;
  public readonly googleClientSecretSecret: secretsmanager.ISecret;
  public readonly secretPrefix: string;

  constructor(scope: Construct, id: string, props: SecretsConstructProps) {
    super(scope, id);

    const appName = props.appName || 'inkstream';
    this.secretPrefix = `${appName}/${props.envName}`;

    // Reference existing OpenAI API Key secret if provided
    if (props.openaiApiKeySecretArn) {
      console.log(
        `Referencing existing OpenAI API Key secret: ${props.openaiApiKeySecretArn}`
      );
      this.openaiApiKeySecret = secretsmanager.Secret.fromSecretCompleteArn(
        this,
        'OpenAIApiKeySecret',
        props.openaiApiKeySecretArn
      );
      console.log(
        `OpenAI API Key secret ARN: ${this.openaiApiKeySecret.secretArn}`
      );
      console.log(
        `OpenAI API Key secret name: ${this.openaiApiKeySecret.secretName}`
      );
    } else {
      console.warn(
        'OpenAI API Key secret ARN not provided. OpenAI functionality will not be available.'
      );
    }

    // Reference existing Google Client Secret (required)
    console.log(
      `Referencing existing Google Client Secret: ${props.googleClientSecretSecretArn}`
    );
    this.googleClientSecretSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'GoogleClientSecretSecret',
      props.googleClientSecretSecretArn
    );
    console.log(
      `Google Client Secret ARN: ${this.googleClientSecretSecret.secretArn}`
    );
    console.log(
      `Google Client Secret name: ${this.googleClientSecretSecret.secretName}`
    );
  }

  /**
   * Get the secret ARN for OpenAI API key
   * Returns undefined if the secret was not provided
   */
  getOpenAIApiKeySecretArn(): string | undefined {
    return this.openaiApiKeySecret?.secretArn;
  }

  /**
   * Get the secret ARN for Google Client Secret
   */
  getGoogleClientSecretSecretArn(): string {
    return this.googleClientSecretSecret.secretArn;
  }

  /**
   * Create additional secrets programmatically
   * Useful for other API keys or secrets that might be added later
   */
  createSecret(
    id: string,
    name: string,
    value: string,
    description?: string
  ): SecretResource {
    const secretName = `${this.secretPrefix}/${name}`;

    const secret = new secretsmanager.Secret(this, id, {
      secretName,
      description: description || `Secret for ${name}`,
      secretStringValue: cdk.SecretValue.unsafePlainText(value),
    });

    // Add tags
    cdk.Tags.of(secret).add(
      'Environment',
      this.node.getContext('envName') || 'unknown'
    );
    cdk.Tags.of(secret).add(
      'Application',
      this.node.getContext('appName') || 'inkstream'
    );
    cdk.Tags.of(secret).add('SecretType', 'Secret');

    return {
      secretName,
      secret,
    };
  }

  /**
   * Grant read access to the secrets for a given principal
   */
  grantSecretRead(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    const resources: string[] = [];

    if (this.openaiApiKeySecret) {
      resources.push(this.openaiApiKeySecret.secretArn);
    }

    // Google Client Secret is always present (required)
    resources.push(this.googleClientSecretSecret.secretArn);

    return cdk.aws_iam.Grant.addToPrincipal({
      grantee,
      actions: ['secretsmanager:GetSecretValue'],
      resourceArns: resources,
    });
  }

  /**
   * Grant read access only to the OpenAI API key secret
   */
  grantOpenAISecretRead(grantee: cdk.aws_iam.IGrantable): cdk.aws_iam.Grant {
    if (this.openaiApiKeySecret) {
      return this.openaiApiKeySecret.grantRead(grantee);
    }
    // Return a no-op grant when OpenAI secret is not available
    return cdk.aws_iam.Grant.addToPrincipal({
      grantee,
      actions: [],
      resourceArns: [],
    });
  }

  /**
   * Get all secret ARNs for IAM policy creation
   */
  getAllSecretArns(): string[] {
    const arns: string[] = [];

    if (this.openaiApiKeySecret) {
      arns.push(this.openaiApiKeySecret.secretArn);
    }

    // Google Client Secret is always present (required)
    arns.push(this.googleClientSecretSecret.secretArn);

    return arns;
  }
}
