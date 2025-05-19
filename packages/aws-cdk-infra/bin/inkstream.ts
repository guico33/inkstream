#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { InkstreamStack } from '../src/lib/inkstream-stack';

const app = new cdk.App();
new InkstreamStack(app, 'Dev-InkstreamStack', {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: process.env.AWS_REGION,
  },
});
