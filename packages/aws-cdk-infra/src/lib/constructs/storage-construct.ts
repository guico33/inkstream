import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';

export class StorageConstruct extends Construct {
  public readonly storageBucket: s3.Bucket;
  public readonly textractJobTokensTable: dynamodb.Table;
  public readonly userWorkflowsTable: dynamodb.Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const bucketName = `dev-inkstream-storage-${cdk.Stack.of(this).account}`;

    this.storageBucket = new s3.Bucket(this, 'DevStorageBucket', {
      bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      cors: [
        {
          allowedOrigins: ['http://localhost:5174'], // Add prod origins as needed
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
    });

    // Textract Job Tokens Table (for event-driven workflow)
    const accountId = cdk.Stack.of(this).account;
    const textractJobTokensTableName = `dev-inkstream-textract-job-tokens-${accountId}`;
    this.textractJobTokensTable = new dynamodb.Table(
      this,
      'TextractJobTokensTable',
      {
        tableName: textractJobTokensTableName,
        partitionKey: { name: 'JobId', type: dynamodb.AttributeType.STRING },
        timeToLiveAttribute: 'ExpirationTime',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      }
    );

    // User Workflows Table (for workflow state tracking)
    const userWorkflowsTableName = `dev-inkstream-user-workflows-${accountId}`;
    this.userWorkflowsTable = new dynamodb.Table(this, 'UserWorkflowsTable', {
      tableName: userWorkflowsTableName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'workflowId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
  }
}
