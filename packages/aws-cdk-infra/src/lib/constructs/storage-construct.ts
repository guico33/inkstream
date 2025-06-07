import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import { EnvironmentConfig } from '../../../config/environments';

export interface StorageConstructProps {
  config: EnvironmentConfig;
}

export class StorageConstruct extends Construct {
  public readonly storageBucket: s3.Bucket;
  public readonly textractJobTokensTable: dynamodb.Table;
  public readonly userWorkflowsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageConstructProps) {
    super(scope, id);

    const accountId = cdk.Stack.of(this).account;
    const envPrefix = props.config.stackPrefix.toLowerCase();
    const bucketName = `${envPrefix}-inkstream-storage-${accountId}`;

    // Build CORS allowed origins based on environment
    const allowedOrigins = [
      'http://localhost:5174', // Local development
    ];

    // Add production web domain if available
    if (props.config.subdomains.web) {
      allowedOrigins.push(`https://${props.config.subdomains.web}`);
    }

    // Add CloudFront domain for dev environments
    if (props.config.cloudFrontDomain) {
      allowedOrigins.push(`https://${props.config.cloudFrontDomain}`);
    }

    this.storageBucket = new s3.Bucket(
      this,
      `${props.config.stackPrefix}StorageBucket`,
      {
        bucketName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        versioned: false,
        cors: [
          {
            allowedOrigins,
            allowedMethods: [
              s3.HttpMethods.GET,
              s3.HttpMethods.PUT,
              s3.HttpMethods.POST,
              s3.HttpMethods.HEAD,
            ],
            allowedHeaders: ['*'],
            exposedHeaders: ['ETag'],
            maxAge: 3000,
          },
        ],
      }
    );

    // Textract Job Tokens Table (for event-driven workflow)
    const textractJobTokensTableName = `${envPrefix}-inkstream-textract-job-tokens-${accountId}`;
    this.textractJobTokensTable = new dynamodb.Table(
      this,
      'TextractJobTokensTable',
      {
        tableName: textractJobTokensTableName,
        partitionKey: { name: 'jobId', type: dynamodb.AttributeType.STRING },
        timeToLiveAttribute: 'expirationTime',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      }
    );

    // User Workflows Table (for workflow state tracking)
    const userWorkflowsTableName = `${envPrefix}-inkstream-user-workflows-${accountId}`;
    this.userWorkflowsTable = new dynamodb.Table(this, 'UserWorkflowsTable', {
      tableName: userWorkflowsTableName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'workflowId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Add Global Secondary Index for efficient timestamp-based queries
    // GSI for creation time queries
    this.userWorkflowsTable.addGlobalSecondaryIndex({
      indexName: 'CreatedAtIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL, // Include all attributes
    });

    // GSI for last modified time queries
    this.userWorkflowsTable.addGlobalSecondaryIndex({
      indexName: 'UpdatedAtIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL, // Include all attributes
    });

    // GSI for status queries
    this.userWorkflowsTable.addGlobalSecondaryIndex({
      indexName: 'StatusIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL, // Include all attributes
    });

    // GSI for status category + createdAt queries
    this.userWorkflowsTable.addGlobalSecondaryIndex({
      indexName: 'StatusCategoryCreatedAtIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: {
        name: 'statusCategoryCreatedAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
