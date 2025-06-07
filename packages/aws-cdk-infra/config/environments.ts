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
  stackPrefix: string;
  tags: Record<string, string>;
}

export const environments: Record<string, EnvironmentConfig> = {
  dev: {
    accountId: '560756474135',
    region: 'eu-west-3',
    domainName: 'dev.inkstream.cloud', // Using subdomain for dev
    subdomains: {
      api: 'api-dev.inkstream.cloud',
      web: 'app-dev.inkstream.cloud',
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
