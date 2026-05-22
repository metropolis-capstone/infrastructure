import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template } from 'aws-cdk-lib/assertions';
import { DataStack } from '../lib/data-stack';
import { NetworkStack } from '../lib/network-stack';

// synthesize the stack once and reuse for all tests in this file
const app = new cdk.App();
const network = new NetworkStack(app, 'TestNetworkStack');
const stack = new DataStack(app, 'TestDataStack', {
  vpc: network.vpc,
  rdsSg: network.rdsSg,
});
const template = Template.fromStack(stack);

// ── RDS ────────────────────────────────────────────────────────────────────

// checks that only one RDS instance is created. 
test('RDS instance is created', () => {
  template.resourceCountIs('AWS::RDS::DBInstance', 1);
});

// checks that postgres database engine was used
test('RDS instance uses Postgres engine', () => {
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    Engine: 'postgres',
  });
});

// 
test('RDS instance has deletion protection enabled', () => {
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    DeletionProtection: true,
  });
});

test('RDS instance is in the private subnet', () => {
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    MultiAZ: false,
    PubliclyAccessible: false,
  });
});

test('RDS instance type is t3.micro', () => {
  template.hasResourceProperties('AWS::RDS::DBInstance', {
    DBInstanceClass: 'db.t3.micro',
  });
});


// ── EBS ────────────────────────────────────────────────────────────────────

test('EBS volume is created', () => {
  template.resourceCountIs('AWS::EC2::Volume', 1);
});

test('EBS volume is 100GB gp3', () => {
  template.hasResourceProperties('AWS::EC2::Volume', {
    Size: 100,
    VolumeType: 'gp3',
  });
});
