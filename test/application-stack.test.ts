import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { ApplicationStack } from '../lib/application-stack';

// synthesize both stacks once and reuse across all tests
const app = new cdk.App();
const network = new NetworkStack(app, 'TestNetworkStack');
const stack = new ApplicationStack(app, 'TestApplicationStack', {
  vpc: network.vpc,
  albSg: network.albSg,
  ecsSg: network.ecsSg,
  lambdaSg: network.lambdaSg,
});
const template = Template.fromStack(stack);

// ── ECS Cluster ────────────────────────────────────────────────────────────

test('ECS cluster is created', () => {
  template.resourceCountIs('AWS::ECS::Cluster', 1);
});

// ── Auto Scaling Group ─────────────────────────────────────────────────────

test('ASG is created with t3.medium instances', () => {
  template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
    MaxSize: '1',
  });
});

// ── Task Definitions ───────────────────────────────────────────────────────

// one per container: vmagent, vminsert, vmselect, vmstorage, grafana
test('five task definitions are created', () => {
  template.resourceCountIs('AWS::ECS::TaskDefinition', 5);
});

test('vmstorage task definition has a volume mount for EBS data', () => {
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Volumes: Match.arrayWith([
      Match.objectLike({ Host: { SourcePath: '/data/vm-storage' } }),
    ]),
  });
});

// ── ECS Services ───────────────────────────────────────────────────────────

// one per container
test('five ECS services are created', () => {
  template.resourceCountIs('AWS::ECS::Service', 5);
});

// all five services should have circuit breakers configured
test('all services have deployment circuit breakers enabled', () => {
  template.allResourcesProperties('AWS::ECS::Service', {
    DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: Match.objectLike({ Enable: true, Rollback: true }),
    }),
  });
});

// ── Application Load Balancer ──────────────────────────────────────────────

test('ALB is created and is internet-facing', () => {
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Scheme: 'internet-facing',
  });
});

// one for vmagent (8429) and one for grafana (3000)
test('two listeners are created', () => {
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2);
});

test('telemetry listener is on port 8429', () => {
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 8429,
    Protocol: 'HTTP',
  });
});

test('grafana listener is on port 3000', () => {
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 3000,
    Protocol: 'HTTP',
  });
});

// ── Lambda + EventBridge ───────────────────────────────────────────────────

test('metrics reader Lambda function is created', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Runtime: 'nodejs22.x',
    Timeout: 300,
  });
});

test('EventBridge rule is created on a rate schedule', () => {
  template.hasResourceProperties('AWS::Events::Rule', {
    ScheduleExpression: 'rate(1 day)',
  });
});

// ── Log Groups ─────────────────────────────────────────────────────────────

// one per container: vmagent, vminsert, vmselect, vmstorage, grafana
test('five log groups are created', () => {
  template.resourceCountIs('AWS::Logs::LogGroup', 5);
});
