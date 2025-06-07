#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FrontendDeploymentStack } from '../lib/frontend-deployment-stack';
import { getDeploymentConfig } from '../lib/config';

const app = new cdk.App();

// Get environment from context (cdk deploy --context environment=prod)
const environment = app.node.tryGetContext('environment') || 'dev';

console.log(`Deploying frontend content for ${environment} environment...`);

try {
  const config = getDeploymentConfig(environment);

  const stack = new FrontendDeploymentStack(
    app,
    `${config.stackPrefix}-InkstreamFrontendDeployment`,
    {
      env: {
        region: config.region,
      },
      tags: config.tags,
    },
    config
  );

  console.log(`Frontend deployment stack: ${stack.stackName}`);
} catch (error) {
  console.error('❌ Error creating frontend deployment stack:', error);
  process.exit(1);
}