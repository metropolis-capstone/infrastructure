#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { NetworkStack } from '../lib/network-stack';

const app = new cdk.App();
new NetworkStack(app, 'NetworkStack', {

  // This uses the users authenticated AWS account on their environment in order to be able to check their existing infrastructure
   env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

});
