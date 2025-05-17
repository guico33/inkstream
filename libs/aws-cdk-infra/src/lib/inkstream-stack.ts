import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

export class InkstreamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const extractTextFn = new NodejsFunction(this, 'ExtractTextFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'extract-text', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: `dev-inkstream-user-files-${cdk.Stack.of(this).account}`,
        BUCKET_NAME: `dev-inkstream-uploads-${cdk.Stack.of(this).account}`,
      },
    });

    const formatTextFn = new NodejsFunction(this, 'FormatTextFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'format-text', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
    });

    const translateTextFn = new NodejsFunction(this, 'TranslateTextFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'translate-text', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
    });

    const convertToSpeechFn = new NodejsFunction(
      this,
      'ConvertToSpeechFunction',
      {
        entry: path.join(
          __dirname,
          '..',
          'lambda',
          'convert-to-speech',
          'index.ts'
        ),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.seconds(10),
      }
    );

    // Step 1: Extract Text
    const extractTextTask = new tasks.LambdaInvoke(this, 'Extract Text', {
      lambdaFunction: extractTextFn,
      payloadResponseOnly: true, // This ensures we get the direct Lambda return value
    });

    // Step 2: Format Text
    const formatTextTask = new tasks.LambdaInvoke(this, 'Format Text', {
      lambdaFunction: formatTextFn,
      payloadResponseOnly: true, // This ensures we get the direct Lambda return value
    });

    // Step 3: Translate Text (optional)
    const translateTextTask = new tasks.LambdaInvoke(this, 'Translate Text', {
      lambdaFunction: translateTextFn,
      payloadResponseOnly: true, // This ensures we get the direct Lambda return value
    });

    // Step 4: Convert to Speech tasks (optional) - creating separate instances for each workflow branch
    const convertToSpeechWithTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert to Speech With Translate',
      {
        lambdaFunction: convertToSpeechFn,
        payloadResponseOnly: true, // This ensures we get the direct Lambda return value
      }
    );

    const convertToSpeechNoTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert to Speech No Translate',
      {
        lambdaFunction: convertToSpeechFn,
        payloadResponseOnly: true, // This ensures we get the direct Lambda return value
      }
    );

    // Define workflow chain with unique Choice IDs and unique Done IDs
    const workflow = extractTextTask
      .next(formatTextTask)
      .next(
        new sfn.Choice(this, 'TranslateChoice')
          .when(
            sfn.Condition.booleanEquals('$.doTranslate', true),
            translateTextTask.next(
              new sfn.Choice(this, 'SpeechChoice')
                .when(
                  sfn.Condition.booleanEquals('$.doSpeech', true),
                  convertToSpeechWithTranslateTask.next(
                    new sfn.Succeed(this, 'DoneWithTranslateAndSpeech')
                  )
                )
                .otherwise(new sfn.Succeed(this, 'DoneWithTranslateNoSpeech'))
            )
          )
          .otherwise(
            new sfn.Choice(this, 'SpeechChoiceNoTranslate')
              .when(
                sfn.Condition.booleanEquals('$.doSpeech', true),
                convertToSpeechNoTranslateTask.next(
                  new sfn.Succeed(this, 'DoneWithSpeechNoTranslate')
                )
              )
              .otherwise(new sfn.Succeed(this, 'DoneWithoutTranslateOrSpeech'))
          )
      );

    // State Machine
    const stateMachine = new sfn.StateMachine(this, 'ProcessingWorkflow', {
      definition: workflow,
      timeout: cdk.Duration.minutes(5),
    });

    // Lambda function to start the workflow
    const startWorkflowFn = new NodejsFunction(this, 'StartWorkflowFunction', {
      entry: path.join(__dirname, '..', 'lambda', 'start-workflow', 'index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
      },
    });

    // Grant permission to start execution
    stateMachine.grantStartExecution(startWorkflowFn);

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `dev-inkstream-api-${cdk.Stack.of(this).account}`,
    });

    // Add route for start-workflow Lambda
    httpApi.addRoutes({
      path: '/workflow/start',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'StartWorkflowIntegration',
        startWorkflowFn
      ),
    });

    // Example S3 bucket
    new s3.Bucket(this, 'DevUploadsBucket', {
      bucketName: `dev-inkstream-uploads-${cdk.Stack.of(this).account}`, // Ensure globally unique for S3
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroys bucket on stack delete (DEV ONLY)
      autoDeleteObjects: true, // Only for dev/test, not prod!
      versioned: false, // Enable for production if needed
    });

    // --- DynamoDB Table ---
    new dynamodb.Table(this, 'UserFilesTable', {
      tableName: `dev-inkstream-user-files-${cdk.Stack.of(this).account}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.url ?? 'undefined',
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
    });
  }
}
