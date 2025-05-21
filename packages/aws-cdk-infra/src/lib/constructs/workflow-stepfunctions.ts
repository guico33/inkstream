import { Construct } from 'constructs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowStepFunctionsProps {
  extractTextFn: lambda.IFunction;
  formatTextFn: lambda.IFunction;
  translateTextFn: lambda.IFunction;
  convertToSpeechFn: lambda.IFunction;
}

export class WorkflowStepFunctions extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowStepFunctionsProps) {
    super(scope, id);

    // Define common parameters to be passed through the workflow
    const commonParameters = {
      'fileKey.$': '$.fileKey',
      'outputBucket.$': '$.outputBucket',
      'originalFileBucket.$': '$.originalFileBucket',
      'userId.$': '$.userId',
      'workflowId.$': '$.workflowId',
      'doTranslate.$': '$.doTranslate',
      'targetLanguage.$': '$.targetLanguage',
      'doSpeech.$': '$.doSpeech',
    };

    const extractTextTask = new tasks.LambdaInvoke(this, 'Extract Text', {
      lambdaFunction: props.extractTextFn,
      // Pass the initial input, which should include fileKey, outputBucket, etc.
      payload: sfn.TaskInput.fromJsonPathAt('$'),
      resultPath: '$.extractedTextOutput', // Store lambda output under this key
      outputPath: '$', // Pass the entire input and the result to the next step
      retryOnServiceExceptions: false, // We'll use addRetry below
      // Add an explicit task timeout. Ensure props.extractTextFn's timeout is >= this.
      // For example, if Textract can take up to 5 minutes for complex PDFs.
      timeout: cdk.Duration.minutes(5),
    });
    extractTextTask.addRetry({
      errors: [
        'Lambda.ServiceException',
        'Lambda.AWSLambdaException',
        'Lambda.SdkClientException',
        'States.TaskFailed',
        'States.Timeout',
      ],
      interval: cdk.Duration.seconds(5),
      maxAttempts: 3,
      backoffRate: 2.0,
    });

    const formatTextTask = new tasks.LambdaInvoke(this, 'Format Text', {
      lambdaFunction: props.formatTextFn,
      payload: sfn.TaskInput.fromObject({
        ...commonParameters,
        'extractedText.$': '$.extractedTextOutput.Payload.extractedText', // From previous step
        // fileType might be part of extractedTextOutput or initial input
        'fileType.$': '$.extractedTextOutput.Payload.fileType',
      }),
      resultPath: '$.formatTextOutput',
      outputPath: '$',
    });

    const translateTextTask = new tasks.LambdaInvoke(this, 'Translate Text', {
      lambdaFunction: props.translateTextFn,
      payload: sfn.TaskInput.fromObject({
        ...commonParameters,
        // The formatted text is now stored in S3, so just pass the S3 path
        // The body is a stringified JSON so we can't access its fields directly
        'formattedTextS3Path.$': '$.formatTextOutput.Payload.s3Path',
      }),
      resultPath: '$.translateTextOutput',
      outputPath: '$',
    });

    // Task for converting translated text to speech
    const convertToSpeechWithTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert Translated Text to Speech',
      {
        lambdaFunction: props.convertToSpeechFn,
        payload: sfn.TaskInput.fromObject({
          ...commonParameters,
          // The translated text is now stored in S3, so just pass the S3 path
          'translatedTextS3Path.$': '$.translateTextOutput.Payload.s3Path',
          // targetLanguage is already in commonParameters
        }),
        resultPath: '$.speechOutput',
        outputPath: '$',
      }
    );

    // Task for converting original (formatted) text to speech
    const convertToSpeechNoTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert Formatted Text to Speech',
      {
        lambdaFunction: props.convertToSpeechFn,
        payload: sfn.TaskInput.fromObject({
          ...commonParameters,
          // The formatted text is now stored in S3, so just pass the S3 path
          'formattedTextS3Path.$': '$.formatTextOutput.Payload.s3Path',
          // targetLanguage should be set to the source language (e.g., English) or handled in lambda
          // For simplicity, lambda defaults to English if targetLanguage is not specific for this path
        }),
        resultPath: '$.speechOutput',
        outputPath: '$',
      }
    );

    // Define success states to collect final outputs
    const finalSuccessState = new sfn.Succeed(this, 'Workflow Succeeded');

    // Define the workflow logic
    const definition = extractTextTask.next(formatTextTask).next(
      new sfn.Choice(this, 'Should Translate Text?')
        .when(
          sfn.Condition.booleanEquals('$.doTranslate', true),
          translateTextTask.next(
            new sfn.Choice(
              this,
              'Should Synthesize Speech from Translated Text?'
            )
              .when(
                sfn.Condition.booleanEquals('$.doSpeech', true),
                convertToSpeechWithTranslateTask.next(finalSuccessState)
              )
              .otherwise(finalSuccessState) // No speech after translation
          )
        )
        .otherwise(
          // No translation
          new sfn.Choice(this, 'Should Synthesize Speech from Formatted Text?')
            .when(
              sfn.Condition.booleanEquals('$.doSpeech', true),
              convertToSpeechNoTranslateTask.next(finalSuccessState)
            )
            .otherwise(finalSuccessState) // No translation and no speech
        )
    );

    this.stateMachine = new sfn.StateMachine(this, 'ProcessingWorkflow', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(15),
    });

    // Grant invoke permissions to the state machine for each Lambda
    // This is often handled by the LambdaInvoke construct itself if its `grantPrincipal` is the state machine,
    // but explicit grants can also be added if necessary or for clarity.
    // props.extractTextFn.grantInvoke(this.stateMachine);
    // props.formatTextFn.grantInvoke(this.stateMachine);
    // props.translateTextFn.grantInvoke(this.stateMachine);
    // props.convertToSpeechFn.grantInvoke(this.stateMachine);
  }
}
