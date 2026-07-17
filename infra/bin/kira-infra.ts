#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { KiraStack } from '../lib/kira-stack';

const app = new cdk.App();

new KiraStack(app, 'KiraStack', {
  env: {
    region: process.env.AWS_REGION ?? 'us-east-1',
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  description: 'K.I.R.A. — Knowledge, Insights & Response Assistant cloud infrastructure',
});
