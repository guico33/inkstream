import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cdk from 'aws-cdk-lib';

export interface StorageConstructProps {
  bucketName: string;
  tableName: string;
}

export class StorageConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly table: dynamodb.Table;

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

    this.table = new dynamodb.Table(this, 'UserFilesTable', {
      tableName: props.tableName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
  }
}
