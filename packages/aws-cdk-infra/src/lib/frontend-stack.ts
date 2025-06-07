import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StaticWebsiteConstruct } from './constructs/static-website-construct';
import { EnvironmentConfig } from '../../config/environments';

export class FrontendStack extends cdk.Stack {
  public readonly staticWebsite: StaticWebsiteConstruct;
  public readonly bucket: cdk.aws_s3.Bucket;
  public readonly distribution: cdk.aws_cloudfront.Distribution;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvironmentConfig
  ) {
    super(scope, id, props);

    console.log('building Static Website...');
    // Static Website (S3 + CloudFront + Route53)
    this.staticWebsite = new StaticWebsiteConstruct(this, 'StaticWebsite', {
      config,
    });

    // Store references for outputs
    this.bucket = this.staticWebsite.bucket;
    this.distribution = this.staticWebsite.distribution;

    // Frontend Stack Outputs
    new cdk.CfnOutput(this, 'StaticWebsiteBucketName', {
      value: this.staticWebsite.bucket.bucketName,
      description: 'S3 bucket name for static website hosting',
      exportName: `${config.stackPrefix}-FrontendBucketName`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.staticWebsite.distribution.distributionId,
      description: 'CloudFront distribution ID for cache invalidation',
      exportName: `${config.stackPrefix}-CloudFrontDistributionId`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomainName', {
      value: this.staticWebsite.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    if (config.cloudFrontCertificateArn && config.subdomains.web) {
      new cdk.CfnOutput(this, 'WebsiteUrl', {
        value: `https://${config.subdomains.web}`,
        description: 'Production website URL with custom domain',
        exportName: `${config.stackPrefix}-WebsiteUrl`,
      });
    } else {
      new cdk.CfnOutput(this, 'WebsiteUrl', {
        value: `https://${this.staticWebsite.distribution.distributionDomainName}`,
        description: 'Website URL via CloudFront domain',
        exportName: `${config.stackPrefix}-WebsiteUrl`,
      });
    }

    // Add tags specific to frontend resources
    cdk.Tags.of(this).add('Component', 'Frontend');
  }
}