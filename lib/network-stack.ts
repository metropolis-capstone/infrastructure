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

    // ALB inbound: internet sources push telemetry to vmagent on 8429, and access Grafana dashboards on 3000.
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8429));
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3000));

    // ALB outbound: forward received traffic to the ECS instances running vmagent (8429) and Grafana (3000).
    this.albSg.addEgressRule(this.ecsSg, ec2.Port.tcp(8429));
    this.albSg.addEgressRule(this.ecsSg, ec2.Port.tcp(3000));

    // ECS inbound: ALB forwards external traffic to vmagent (8429) and Grafana (3000).
    this.ecsSg.addIngressRule(this.albSg, ec2.Port.tcp(8429));
    this.ecsSg.addIngressRule(this.albSg, ec2.Port.tcp(3000));
    // ECS inbound: Lambda reads from vmagent (8429) and Grafana (3000) on its 24hr schedule.
    this.ecsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(8429));
    this.ecsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(3000));

    // ECS outbound: Lambda writes metric snapshots to RDS Postgres.
    this.ecsSg.addEgressRule(this.rdsSg, ec2.Port.tcp(5432));
    // ECS outbound: EC2 instances pull container images from Docker Hub (victoriametrics/*, grafana/*),
    // register the ECS agent with the ECS control plane, and deliver logs to CloudWatch — all over HTTPS.
    this.ecsSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    // ECS outbound: EC2 instances resolve hostnames via the VPC DNS resolver (UDP 53).
    this.ecsSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(53));

    // RDS inbound: ECS tasks write application data to Postgres.
    this.rdsSg.addIngressRule(this.ecsSg, ec2.Port.tcp(5432));
    // RDS inbound: Lambda writes the 24hr metric snapshots it reads from VM/Grafana.
    this.rdsSg.addIngressRule(this.lambdaSg, ec2.Port.tcp(5432));

    // Lambda outbound: reads metrics from the vmagent scrape endpoint.
    this.lambdaSg.addEgressRule(this.ecsSg, ec2.Port.tcp(8429));
    // Lambda outbound: reads dashboard/alert state from Grafana.
    this.lambdaSg.addEgressRule(this.ecsSg, ec2.Port.tcp(3000));
    // Lambda outbound: writes metric snapshots to RDS Postgres.
    this.lambdaSg.addEgressRule(this.rdsSg, ec2.Port.tcp(5432));
    // Lambda outbound: VPC-attached Lambda must reach CloudWatch Logs and STS over HTTPS
    // to emit execution logs and obtain temporary credentials for its execution role.
    this.lambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    // Lambda outbound: resolves hostnames (ECS endpoints, AWS service endpoints) via the VPC DNS resolver.
    this.lambdaSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.udp(53));
  }
}
