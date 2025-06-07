import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { DeploymentConfig } from './config';
import * as path from 'path';

export class FrontendDeploymentStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: DeploymentConfig
  ) {
    super(scope, id, props);

    console.log(`Deploying frontend content to ${config.environment} environment...`);

    // Reference existing S3 bucket from infrastructure stack
    const frontendBucket = s3.Bucket.fromBucketName(
      this,
      'FrontendBucket',
      config.frontendBucketName
    );

    // Reference existing CloudFront distribution from infrastructure stack
    const distribution = cloudfront.Distribution.fromDistributionAttributes(
      this,
      'CloudFrontDistribution',
      {
        distributionId: config.cloudFrontDistributionId,
        domainName: `${config.cloudFrontDistributionId}.cloudfront.net`,
      }
    );

    // Deploy built frontend to S3 and invalidate CloudFront cache
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(
          path.join(__dirname, '..', '..', '..', 'apps', 'frontend', 'dist')
        ),
      ],
      destinationBucket: frontendBucket,
      distribution: distribution,
      distributionPaths: ['/*'], // Invalidate all paths
      // Retain old versions for rollback capability
      retainOnDelete: false,
      // Use memory-optimized Lambda for faster deployments
      memoryLimit: 512,
    });

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', config.tags.Environment);
    cdk.Tags.of(this).add('Project', config.tags.Project);
    cdk.Tags.of(this).add('Component', config.tags.Component);

    // Outputs
    new cdk.CfnOutput(this, 'DeploymentStatus', {
      value: 'Frontend content deployed successfully',
      description: 'Status of the frontend deployment',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket where frontend content was deployed',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID that was invalidated',
    });

    new cdk.CfnOutput(this, 'DeploymentTime', {
      value: new Date().toISOString(),
      description: 'Timestamp of this deployment',
    });
  }
}