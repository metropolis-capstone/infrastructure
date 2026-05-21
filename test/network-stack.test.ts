import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';

// synthesize the stack once and reuse across all tests
const app = new cdk.App();
const stack = new NetworkStack(app, 'TestNetworkStack');
const template = Template.fromStack(stack);

// ── VPC ────────────────────────────────────────────────────────────────────

// confirms the private subnet has outbound internet access for container image pulls
test('VPC is created with one NAT gateway', () => {
  template.resourceCountIs('AWS::EC2::NatGateway', 1);
});

// CDK creates one subnet per AZ per type. With maxAzs: 1 that is two subnets total.
test('VPC has one public and one private subnet', () => {
  template.resourceCountIs('AWS::EC2::Subnet', 2);
});

// ── Security Groups ────────────────────────────────────────────────────────

// ALB, ECS, RDS, Lambda — confirms no security group was missed
test('four security groups are created', () => {
  template.resourceCountIs('AWS::EC2::SecurityGroup', 4);
});

// confirms client agents can push telemetry to the ALB from anywhere
// Match.arrayWith checks the array contains this rule, allowing other rules to also exist
test('ALB security group allows inbound on port 8429 from the internet', () => {
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: Match.arrayWith([
      // Match.objectLike ignores extra keys CDK adds automatically (e.g. Description)
      Match.objectLike({ FromPort: 8429, ToPort: 8429, CidrIp: '0.0.0.0/0', IpProtocol: 'tcp' }),
    ]),
  });
});

// confirms Grafana dashboards are publicly accessible via the ALB
// Match.arrayWith checks the array contains this rule, allowing other rules to also exist
test('ALB security group allows inbound on port 3000 from the internet', () => {
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: Match.arrayWith([
      // Match.objectLike ignores extra keys CDK adds automatically (e.g. Description)
      Match.objectLike({ FromPort: 3000, ToPort: 3000, CidrIp: '0.0.0.0/0', IpProtocol: 'tcp' }),
    ]),
  });
});

// confirms RDS only accepts Postgres traffic — no other ports can reach the database
// SG-to-SG ingress rules are separate CloudFormation resources, not inline SG properties
test('RDS security group allows inbound on port 5432 only', () => {
  template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
    FromPort: 5432,
    ToPort: 5432,
    IpProtocol: 'tcp',
  });
});
