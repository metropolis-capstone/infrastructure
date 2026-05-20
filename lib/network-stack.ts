import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const vpc = new ec2.Vpc(this, 'Vpc', {
      //at current I have left as one az, as we will likley be using EBS, which is scoped to AZ zone.
      maxAzs: 1,
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
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      description: "Security group for Application Load Balancer",
      allowAllOutbound: false,
    });

    // ECS tasks sit in the private subnet. Only the ALB and Lambda can initiate inbound connections.
    // allowAllOutbound false — we explicitly control outbound to RDS.
    const ecsSg = new ec2.SecurityGroup(this, 'EcsSg', {
      vpc,
      description: "Security group for ECS tasks",
      allowAllOutbound: false,
    });

    // RDS sits in the private subnet. Only ECS tasks and Lambda can connect on the Postgres port.
    // No outbound needed — RDS never initiates connections, resources connect to it.
    const rdsSg = new ec2.SecurityGroup(this, 'RdsSg', {
      vpc,
      description: "Security group for RDS Postgres instance",
      allowAllOutbound: false,
    });

    // Lambda sits in the private subnet (VPC-attached). It reads from VM and Grafana endpoints every 24hrs
    // and writes results to RDS. No inbound needed — Lambda always initiates.
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc,
      description: "Security group for Lambda scheduled reader",
      allowAllOutbound: false,
    });

    // ALB inbound — open to the world on telemetry and Grafana ports.
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8429));
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000));

    // ALB outbound — only to ECS tasks on the same ports.
    albSg.addEgressRule(ecsSg, ec2.Port.tcp(8429));
    albSg.addEgressRule(ecsSg, ec2.Port.tcp(3000));

    // ECS inbound — from ALB on service ports, and from Lambda for its 24hr reads.
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(8429));
    ecsSg.addIngressRule(albSg, ec2.Port.tcp(3000));
    ecsSg.addIngressRule(lambdaSg, ec2.Port.tcp(8429));
    ecsSg.addIngressRule(lambdaSg, ec2.Port.tcp(3000));

    // ECS outbound — only to RDS on the Postgres port.
    ecsSg.addEgressRule(rdsSg, ec2.Port.tcp(5432));

    // RDS inbound — only ECS tasks and Lambda can connect on the Postgres port.
    rdsSg.addIngressRule(ecsSg, ec2.Port.tcp(5432));
    rdsSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432));

    // Lambda outbound — reads from ECS VM and Grafana endpoints, writes results to RDS.
    lambdaSg.addEgressRule(ecsSg, ec2.Port.tcp(8429));
    lambdaSg.addEgressRule(ecsSg, ec2.Port.tcp(3000));
    lambdaSg.addEgressRule(rdsSg, ec2.Port.tcp(5432));
  }
}
