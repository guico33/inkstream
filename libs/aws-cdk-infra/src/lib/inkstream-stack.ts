import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class InkstreamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Example S3 bucket
    new s3.Bucket(this, 'DevUploadsBucket', {
      bucketName: 'dev-inkstream-uploads-560756474135', // Ensure globally unique for S3
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroys bucket on stack delete (DEV ONLY)
      autoDeleteObjects: true, // Only for dev/test, not prod!
      versioned: false, // Enable for production if needed
    });
  }
}
