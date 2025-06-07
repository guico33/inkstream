import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cdk from 'aws-cdk-lib';
import { EnvironmentConfig } from '../../../config/environments';

export interface StaticWebsiteConstructProps {
  config: EnvironmentConfig;
}

export class StaticWebsiteConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly hostedZone?: route53.IHostedZone;

  constructor(
    scope: Construct,
    id: string,
    props: StaticWebsiteConstructProps
  ) {
    super(scope, id);

    const { config } = props;
    const envName = config.stackPrefix.toLowerCase();

    // S3 bucket for static website hosting
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${envName}-inkstream-static-website`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html', // SPA routing - redirect all errors to index.html
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For non-prod, change to RETAIN for production
      autoDeleteObjects: true, // For non-prod, remove for production
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      ...config.tags,
    });

    // CloudFront distribution
    const cachePolicy = new cloudfront.CachePolicy(this, 'CachePolicy', {
      cachePolicyName: `${envName}-inkstream-cache-policy`,
      defaultTtl: cdk.Duration.days(1),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
        'CloudFront-Viewer-Country',
        'CloudFront-Is-Mobile-Viewer',
        'CloudFront-Is-Tablet-Viewer',
        'CloudFront-Is-Desktop-Viewer'
      ),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
    });

    // Response headers policy for security
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'ResponseHeadersPolicy',
      {
        responseHeadersPolicyName: `${envName}-inkstream-security-headers`,
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.seconds(31536000),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
        },
      }
    );

    // Get certificate for CloudFront (must be in us-east-1)
    let certificate: acm.ICertificate | undefined;
    if (config.cloudFrontCertificateArn) {
      certificate = acm.Certificate.fromCertificateArn(
        this,
        'CloudFrontCertificate',
        config.cloudFrontCertificateArn
      );
    }

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3StaticWebsiteOrigin(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cachePolicy,
        responseHeadersPolicy: responseHeadersPolicy,
        compress: true,
      },
      domainNames: certificate && config.subdomains.web ? [config.subdomains.web] : undefined,
      certificate: certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only US and EU edge locations
      ...config.tags,
    });

    // Note: Frontend deployment is handled separately via GitHub Actions or manual deployment
    // This removes the build-time dependency on apps/frontend/dist existing

    // Route53 DNS record (only for production with domain)
    if (certificate && config.domainName && config.subdomains.web) {
      // Look up existing hosted zone for the root domain
      this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: config.domainName,
      });

      // Create A record pointing to CloudFront for the subdomain
      new route53.ARecord(this, 'ARecord', {
        zone: this.hostedZone,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(this.distribution)
        ),
        recordName: config.subdomains.web,
      });

      // Create AAAA record for IPv6 for the subdomain
      new route53.AaaaRecord(this, 'AAAARecord', {
        zone: this.hostedZone,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(this.distribution)
        ),
        recordName: config.subdomains.web,
      });
    }

    // Tags for resources
    cdk.Tags.of(this).add('Environment', config.tags.Environment);
    cdk.Tags.of(this).add('Project', config.tags.Project);
    cdk.Tags.of(this).add('Component', 'StaticWebsite');
  }
}
