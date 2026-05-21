import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  // public properties allow other stacks to reference these resources via props. Necessary for VPC to be
  // accessed within the application stack. 
  public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly rdsSg: ec2.SecurityGroup;
  public readonly lambdaSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    this.vpc = new ec2.Vpc(this, 'Vpc', {
      // 2 AZs: satisfies RDS subnet group requirement. ASG is pinned to privateSubnets[0] so EBS stays in AZ1.
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          //public subnets
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          // leaving as default
          cidrMask: 24,
        },
        {
          //private subnets
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // ALB sits in the public subnet and receives inbound telemetry (8429) and Grafana (3000) from the internet.
    // allowAllOutbound false — we explicitly control where the ALB can send traffic.
    this.albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: this.vpc,
      description: "Security group for Application Load Balancer",
      allowAllOutbound: false,
    });

    // ECS tasks sit in the private subnet. Only the ALB and Lambda can initiate inbound connections.
    // allowAllOutbound false — we explicitly control outbound to RDS.
    this.ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc: this.vpc,
      description: "Security group for ECS tasks",
      allowAllOutbound: false,
    });

    // RDS sits in the private subnet. Only ECS tasks and Lambda can connect on the Postgres port.
    // No outbound needed — RDS never initiates connections, resources connect to it.
    this.rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc: this.vpc,
      description: "Security group for RDS Postgres instance",
      allowAllOutbound: false,
    });

    // Lambda sits in the private subnet (VPC-attached). It reads from VM and Grafana endpoints every 24hrs
    // and writes results to RDS. No inbound needed — Lambda always initiates.
    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: this.vpc,
      description: "Security group for Lambda scheduled reader",
      allowAllOutbound: false,
    });

    // ALB inbound — open to the world on telemetry and Grafana ports.
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8429));
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000));

    // ALB outbound — only to ECS tasks on the same ports.
    this.albSg.addEgressRule(this.ecsSg, ec2.Port.tcp(8429));
    this.albSg.addEgressRule(this.ecsSg, ec2.Port.tcp(3000));

    // ECS inbound — from ALB on service ports, and from Lambda for its 24hr reads.
    this.ecsSg.addIngressRule(this.albSg, ec2.Port.tcp(8429));
    this.ecsSg.addIngressRule(this.albSg, ec2.Port.tcp(3000));
    this.ecsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(8429));
    this.ecsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(3000));

    // ECS outbound — only to RDS on the Postgres port.
    this.ecsSg.addEgressRule(this.rdsSg, ec2.Port.tcp(5432));

    // RDS inbound — only ECS tasks and Lambda can connect on the Postgres port.
    this.rdsSg.addIngressRule(this.ecsSg, ec2.Port.tcp(5432));
    this.rdsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(5432));

    // Lambda outbound — reads from ECS VM and Grafana endpoints, writes results to RDS.
    this.lambdaSg.addEgressRule(this.ecsSg, ec2.Port.tcp(8429));
    this.lambdaSg.addEgressRule(this.ecsSg, ec2.Port.tcp(3000));
    this.lambdaSg.addEgressRule(this.rdsSg, ec2.Port.tcp(5432));
  }
}
