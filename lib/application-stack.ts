import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

// defines the inputs this stack requires from NetworkStack.
// extends cdk.StackProps so standard props like env are still accepted.
interface ApplicationStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  albSg: ec2.ISecurityGroup;
  ecsSg: ec2.ISecurityGroup;
  rdsSg: ec2.ISecurityGroup;
  lambdaSg: ec2.ISecurityGroup;
}

export class ApplicationStack extends cdk.Stack {
  // props is no longer optional — the VPC and security groups are required to deploy this stack.
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);

    // ── ECR ───────────────────────────────────────────────────────────────────
    // repositories to store images for pulldown on new container creation. They are pushed to the their
    // respective ECR repo on every new deploy of ECS. 
    // we do not need this until we have custom images, which we do not yet. 
    // const vmAgentRepo = new ecr.Repository(this, 'VmAgentRepository');
    // const vmInsertRepo = new ecr.Repository(this, 'VmInsertRepository');
    // const vmSelectRepo = new ecr.Repository(this, 'VmSelectRepository');
    // const vmStorageRepo = new ecr.Repository(this, 'VmStorageRepository');
    // const grafanaRepo = new ecr.Repository(this, 'GrafanaRepository');

    // ── ECS Cluster ───────────────────────────────────────────────────────────
    // logical grouping for all ECS tasks and services

    // ── EC2 Auto Scaling Group ────────────────────────────────────────────────
    // provides the actual EC2 instances the ECS cluster runs containers on

    // ── IAM Roles ─────────────────────────────────────────────────────────────
    // ECS task execution role and EC2 instance profile

    // ── ECS Task Definitions ──────────────────────────────────────────────────
    // one per container: VM Agent, VM Insert, VM Select, VM Storage, Grafana

    // ── ECS Services ──────────────────────────────────────────────────────────
    // one per container, each linked to the cluster and task definition

    // ── Application Load Balancer ─────────────────────────────────────────────
    // sits in the public subnet, listeners on port 8429 (telemetry) and 3000 (Grafana)

    // ── Lambda + EventBridge ──────────────────────────────────────────────────
    // Lambda reads from VM and Grafana endpoints every 24hrs and writes to RDS
    // EventBridge triggers the Lambda on a cron schedule

    // ── EBS Volume ────────────────────────────────────────────────────────────
    // attached to the EC2 instance, mounted by VM Storage for persistent data
  }
}
