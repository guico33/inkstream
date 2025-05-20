import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowStepLambdasProps {
  tableName: string;
  bucketName: string;
  claudeModelId?: string;
}

export class WorkflowStepLambdas extends Construct {
  public readonly extractTextFn: lambda.IFunction;
  public readonly formatTextFn: lambda.IFunction;
  public readonly translateTextFn: lambda.IFunction;
  public readonly convertToSpeechFn: lambda.IFunction;

  constructor(scope: Construct, id: string, props: WorkflowStepLambdasProps) {
    super(scope, id);

    this.extractTextFn = new NodejsFunction(this, 'ExtractTextFunction', {
      entry: path.join(__dirname, '../../lambda/extract-text/index.ts'),
      handler: 'handler',
      description:
        'Extract text from PDF or image with Textract (or read text file)',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: props.tableName,
        BUCKET_NAME: props.bucketName,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: [
            'textract:StartDocumentTextDetection',
            'textract:GetDocumentTextDetection',
            'textract:DetectDocumentText',
            's3:GetObject',
          ],
          resources: ['*'],
        }),
      ],
    });

    this.formatTextFn = new NodejsFunction(this, 'FormatTextFunction', {
      entry: path.join(__dirname, '../../lambda/format-text/index.ts'),
      handler: 'handler',
      description: 'Format extracted text with Claude Haiku',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60), // Increased timeout for Bedrock API calls
      environment: {
        CLAUDE_MODEL_ID:
          props.claudeModelId || 'anthropic.claude-3-haiku-20240307-v1:0',
        BUCKET_NAME: props.bucketName, // Added BUCKET_NAME for S3 output
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['bedrock:InvokeModel', 's3:PutObject', 's3:GetObject'], // Added s3:GetObject
          resources: ['*'], // You can restrict this to specific model ARNs and S3 bucket/paths
        }),
      ],
    });

    this.translateTextFn = new NodejsFunction(this, 'TranslateTextFunction', {
      entry: path.join(__dirname, '../../lambda/translate-text/index.ts'),
      handler: 'handler',
      description: 'Translate text with Claude Haiku',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60), // Increased timeout for Bedrock API calls
      environment: {
        CLAUDE_MODEL_ID:
          props.claudeModelId || 'anthropic.claude-3-haiku-20240307-v1:0',
        BUCKET_NAME: props.bucketName,
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
        entry: path.join(__dirname, '../../lambda/convert-to-speech/index.ts'),
        description: 'Convert text to speech with Polly',
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.minutes(5),
        memorySize: 512,
        environment: {
          BUCKET_NAME: props.bucketName,
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
