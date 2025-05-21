import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface StorageConstructProps {
  bucketName: string;
  processTextractS3EventFn?: lambda.IFunction; // Optional for S3 event notification
}

export class StorageConstruct extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageConstructProps) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'DevStorageBucket', {
      bucketName: props.bucketName,
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

    // Add S3 event notification for Textract output
    if (props.processTextractS3EventFn) {
      this.bucket.addEventNotification(
        s3.EventType.OBJECT_CREATED,
        new s3n.LambdaDestination(props.processTextractS3EventFn),
        { prefix: 'textract-output/' }
      );
    }

    // Textract Job Tokens Table (for event-driven workflow)
    const accountId = cdk.Stack.of(this).account;
    const textractJobTokensTableName = `dev-inkstream-textract-job-tokens-${accountId}`;
    // textractJobTokensTable
    new dynamodb.Table(this, 'TextractJobTokensTable', {
      tableName: textractJobTokensTableName,
      partitionKey: { name: 'JobId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ExpirationTime',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
  }
}
