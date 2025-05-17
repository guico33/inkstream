#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InkstreamStack } from '../src/lib/inkstream-stack';

const app = new cdk.App();
new InkstreamStack(app, 'Dev-InkstreamStack', {
  env: { account: '560756474135', region: 'eu-west-3' },
});
