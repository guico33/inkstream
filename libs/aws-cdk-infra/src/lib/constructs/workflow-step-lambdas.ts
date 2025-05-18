import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowStepLambdasProps {
  tableName: string;
  bucketName: string;
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
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: ['*'], // You can restrict this to specific model ARNs if needed
        }),
      ],
    });

    this.translateTextFn = new NodejsFunction(this, 'TranslateTextFunction', {
      entry: path.join(__dirname, '../../lambda/translate-text/index.ts'),
      handler: 'handler',
      description: 'Translate text with Claude Haiku',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
    });

    this.convertToSpeechFn = new NodejsFunction(
      this,
      'ConvertToSpeechFunction',
      {
        entry: path.join(__dirname, '../../lambda/convert-to-speech/index.ts'),
        description: 'Convert text to speech with Polly',
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.seconds(10),
      }
    );
  }
}
