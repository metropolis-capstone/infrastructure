import * as cdk from 'aws-cdk-lib/core';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

// defines what this stack needs from other stacks
// extends cdk.StackProps so standard props like env are still accepted.
interface DataStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  rdsSg: ec2.ISecurityGroup;
}

export class DataStack extends cdk.Stack {
  public readonly rdsEndpoint: string;
  public readonly ebsVolumeId: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // new rds instance
    const db = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      
      //assigns passed in security group from NetworkStack to the 
      // RDS instance, which only allows inbound on port 5432 from 
      // the ECS and Lambda SGs. No outbound rules needed for RDS.
      securityGroups: [props.rdsSg],
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      multiAz: false,
      allocatedStorage: 20,
      deletionProtection: true,
    });

    // rds endpoint property made public
    this.rdsEndpoint = db.instanceEndpoint.hostname;

    // new ebs volume
    const ebsVolume = new ec2.CfnVolume(this, 'VmStorageVolume', {
      availabilityZone: props.vpc.privateSubnets[0].availabilityZone,
      size: 100,
      volumeType: 'gp3',
    });

    // ebs volume id made public
    this.ebsVolumeId = ebsVolume.ref;
  }
}
