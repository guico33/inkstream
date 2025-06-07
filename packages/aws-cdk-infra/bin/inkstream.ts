#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../src/lib/backend-stack';
import { FrontendStack } from '../src/lib/frontend-stack';
import { getEnvironmentConfig } from '../config/environments';

const app = new cdk.App();

// Get environment from context (cdk deploy --context environment=prod)
const environment = app.node.tryGetContext('environment') || 'dev';

// Load environment-specific .env file
// First check if DOTENV_CONFIG_PATH is set (from package.json scripts)
// Otherwise fall back to environment-based file selection
const envFile =
  process.env.DOTENV_CONFIG_PATH ||
  (environment === 'prod' ? '.env.prod' : '.env');
dotenv.config({ path: envFile });

console.log(`Loading environment variables from: ${envFile}`);

const config = getEnvironmentConfig(environment);

console.log(
  `Deploying to ${environment} environment (Account: ${config.accountId}, Region: ${config.region})`
);

// Create Backend Stack (API Gateway, Lambda, DynamoDB, Cognito, etc.)
new BackendStack(
  app,
  `${config.stackPrefix}-InkstreamBackendStack`,
  {
    env: {
      account: config.accountId,
      region: config.region,
    },
    tags: config.tags,
  },
  config
);

// Create Frontend Stack (S3, CloudFront, Route53 for static hosting)
new FrontendStack(
  app,
  `${config.stackPrefix}-InkstreamFrontendStack`,
  {
    env: {
      account: config.accountId,
      region: config.region,
    },
    tags: config.tags,
  },
  config
);
