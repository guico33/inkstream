import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowStepLambdasProps {
  storageBucketName: string;
  bedrockModelId?: string;
  textractJobTokensTableName: string;
  userWorkflowsTableName: string;
  openaiApiKeySecretName?: string;
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
          USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
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
      description:
        'Format extracted text with AI provider (Bedrock Claude or OpenAI)',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60), // Increased timeout for AI API calls
      environment: {
        // AI Provider configuration
        AI_PROVIDER: process.env.AI_PROVIDER || 'bedrock', // 'bedrock' or 'openai'
        // Bedrock configuration (legacy)
        BEDROCK_MODEL_ID:
          props.bedrockModelId || 'anthropic.claude-3-haiku-20240307-v1:0',
        // OpenAI configuration - use Secrets Manager for security
        ...(props.openaiApiKeySecretName && {
          OPENAI_API_KEY_SECRET_NAME: props.openaiApiKeySecretName,
        }),
        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        // Common configuration
        BUCKET_NAME: props.storageBucketName,
        USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['bedrock:InvokeModel', 's3:PutObject', 's3:GetObject'],
          resources: ['*'], // You can restrict this to specific model ARNs and S3 bucket/paths
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:*:*:secret:inkstream/*`, // Allow access to secrets under inkstream/ path
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['dynamodb:UpdateItem'],
          resources: [
            `arn:aws:dynamodb:*:*:table/${props.userWorkflowsTableName}`,
          ],
        }),
      ],
    });

    this.translateTextFn = new NodejsFunction(this, 'TranslateTextFunction', {
      entry: path.join(
        __dirname,
        '../../lambda/workflow/translate-text/index.ts'
      ),
      handler: 'handler',
      description: 'Translate text with AI provider (Bedrock Claude or OpenAI)',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(60), // Increased timeout for AI API calls
      environment: {
        // AI Provider configuration
        AI_PROVIDER: process.env.AI_PROVIDER || 'bedrock', // 'bedrock' or 'openai'
        // Bedrock configuration (legacy)
        CLAUDE_MODEL_ID:
          props.bedrockModelId || 'anthropic.claude-3-haiku-20240307-v1:0',
        // OpenAI configuration - use Secrets Manager for security
        ...(props.openaiApiKeySecretName && {
          OPENAI_API_KEY_SECRET_NAME: props.openaiApiKeySecretName,
        }),
        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        // Common configuration
        BUCKET_NAME: props.storageBucketName,
        USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['bedrock:InvokeModel', 's3:PutObject', 's3:GetObject'],
          resources: ['*'], // You can restrict this to specific model ARNs and S3 bucket/paths
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            `arn:aws:secretsmanager:*:*:secret:inkstream/*`, // Allow access to secrets under inkstream/ path
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['dynamodb:UpdateItem'],
          resources: [
            `arn:aws:dynamodb:*:*:table/${props.userWorkflowsTableName}`,
          ],
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
          USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
        },
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: ['polly:SynthesizeSpeech', 's3:PutObject', 's3:GetObject'],
            resources: ['*'], // You can restrict this to S3 bucket/paths
          }),
        ],
      }
    );
  }
}
