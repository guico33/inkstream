// Environment-specific configuration for Inkstream CDK deployment

export interface EnvironmentConfig {
  accountId: string;
  region: string;
  domainName: string;
  subdomains: {
    api: string;
    web: string;
  };
  certificateArn?: string;
  cloudFrontCertificateArn?: string; // Certificate in us-east-1 for CloudFront
  stackPrefix: string;
  tags: {
    Environment: string;
    Project: string;
    Owner: string;
    ManagedBy: string;
  };
}

export const environments: Record<string, EnvironmentConfig> = {
  dev: {
    accountId: '560756474135',
    region: 'eu-west-3',
    domainName: '', // No custom domain for dev - use CloudFront default
    subdomains: {
      api: '', // No custom API domain for dev - use API Gateway default
      web: '', // No custom web domain for dev - use CloudFront default
    },
    stackPrefix: 'Dev',
    tags: {
      Environment: 'Development',
      Project: 'Inkstream',
      Owner: 'Guillaume',
      ManagedBy: 'CDK',
    },
  },
  prod: {
    accountId: '426361305135',
    region: 'eu-west-3',
    domainName: 'inkstream.cloud',
    subdomains: {
      api: 'api.inkstream.cloud',
      web: 'app.inkstream.cloud',
    },
    // ACM certificate in the eu-west-3 region for API Gateway custom domains
    certificateArn:
      'arn:aws:acm:eu-west-3:426361305135:certificate/b544fc1e-7d2e-42df-8d5a-aa561bcff0b7',
    // ACM certificate in us-east-1 region for CloudFront distribution
    cloudFrontCertificateArn:
      'arn:aws:acm:us-east-1:426361305135:certificate/639b89d7-fb27-4e04-98c0-4fcc91e16658',
    stackPrefix: 'Prod',
    tags: {
      Environment: 'Production',
      Project: 'Inkstream',
      Owner: 'Guillaume',
      ManagedBy: 'CDK',
    },
  },
};

export function getEnvironmentConfig(environment: string): EnvironmentConfig {
  const config = environments[environment];
  if (!config) {
    throw new Error(
      `Unknown environment: ${environment}. Available: ${Object.keys(
        environments
      ).join(', ')}`
    );
  }
  return config;
}
