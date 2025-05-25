import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowStepLambdasProps {
  storageBucketName: string;
  claudeModelId?: string;
  textractJobTokensTableName: string;
  userWorkflowsTableName: string;
}

export class WorkflowStepLambdas extends Construct {
  public readonly formatTextFn: lambda.IFunction;
  public readonly translateTextFn: lambda.IFunction;
  public readonly convertToSpeechFn: lambda.IFunction;
  public readonly startTextractJobFn: lambda.IFunction;
  public readonly processTextractS3EventFn: lambda.IFunction;

  constructor(scope: Construct, id: string, props: WorkflowStepLambdasProps) {
    super(scope, id);

    this.startTextractJobFn = new NodejsFunction(
      this,
      'StartTextractJobFunction',
      {
        entry: path.join(
          __dirname,
          '../../lambda/workflow/start-textract-job/index.ts'
        ),
        handler: 'handler',
        description: 'Start Textract job and store Step Function task token',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.seconds(30),
        environment: {
          TEXTRACT_JOB_TOKENS_TABLE: props.textractJobTokensTableName,
          USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
        },
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: [
              'textract:StartDocumentTextDetection',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              's3:GetObject',
              's3:PutObject',
            ],
            resources: ['*'],
          }),
        ],
      }
    );

    this.processTextractS3EventFn = new NodejsFunction(
      this,
      'ProcessTextractS3EventFunction',
      {
        entry: path.join(
          __dirname,
          '../../lambda/events/process-textract-s3-event/index.ts'
        ),
        handler: 'handler',
        description:
          'Process S3 event for Textract output and resume Step Function',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.seconds(30),
        environment: {
          AWS_ACCOUNT_ID: cdk.Stack.of(this).account,
        },
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: [
              'dynamodb:GetItem',
              'dynamodb:DeleteItem',
              'states:SendTaskSuccess',
              'states:SendTaskFailure',
              's3:GetObject',
              's3:PutObject',
              's3:ListBucket',
            ],
            resources: ['*'],
          }),
        ],
      }
    );

    this.formatTextFn = new NodejsFunction(this, 'FormatTextFunction', {
      entry: path.join(__dirname, '../../lambda/workflow/format-text/index.ts'),
      handler: 'handler',
      description: 'Format extracted text with Claude Haiku',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60), // Increased timeout for Bedrock API calls
      environment: {
        CLAUDE_MODEL_ID:
          props.claudeModelId || 'anthropic.claude-3-haiku-20240307-v1:0',
        BUCKET_NAME: props.storageBucketName, // Added BUCKET_NAME for S3 output
        USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['bedrock:InvokeModel', 's3:PutObject', 's3:GetObject'], // Added s3:GetObject
          resources: ['*'], // You can restrict this to specific model ARNs and S3 bucket/paths
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['dynamodb:UpdateItem'],
          resources: ['*'], // Can be restricted to specific table ARN
        }),
      ],
    });

    this.translateTextFn = new NodejsFunction(this, 'TranslateTextFunction', {
      entry: path.join(
        __dirname,
        '../../lambda/workflow/translate-text/index.ts'
      ),
      handler: 'handler',
      description: 'Translate text with Claude Haiku',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60), // Increased timeout for Bedrock API calls
      environment: {
        CLAUDE_MODEL_ID:
          props.claudeModelId || 'anthropic.claude-3-haiku-20240307-v1:0',
        BUCKET_NAME: props.storageBucketName,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['bedrock:InvokeModel', 's3:PutObject', 's3:GetObject'], // Added s3:GetObject
          resources: ['*'], // You can restrict this to specific model ARNs and S3 bucket/paths
        }),
      ],
    });

    this.convertToSpeechFn = new NodejsFunction(
      this,
      'ConvertToSpeechFunction',
      {
        entry: path.join(
          __dirname,
          '../../lambda/workflow/convert-to-speech/index.ts'
        ),
        description: 'Convert text to speech with Polly',
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.minutes(5),
        memorySize: 512,
        environment: {
          BUCKET_NAME: props.storageBucketName,
        },
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: ['polly:SynthesizeSpeech', 's3:PutObject', 's3:GetObject'], // Added s3:GetObject
            resources: ['*'], // You can restrict this to S3 bucket/paths
          }),
        ],
      }
    );
  }
}
