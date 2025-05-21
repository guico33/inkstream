import { Construct } from 'constructs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowStepFunctionsProps {
  formatTextFn: lambda.IFunction;
  translateTextFn: lambda.IFunction;
  convertToSpeechFn: lambda.IFunction;
  startTextractJobFn: lambda.IFunction; // Added for starting Textract job
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

    // Event-driven Textract: Start job and wait for callback
    const startTextractJobTask = new tasks.LambdaInvoke(
      this,
      'Start Textract Job',
      {
        lambdaFunction: props.startTextractJobFn,
        integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        payload: sfn.TaskInput.fromObject({
          s3Path: {
            bucket: sfn.JsonPath.stringAt('$.originalFileBucket'),
            key: sfn.JsonPath.stringAt('$.fileKey'),
          },
          workflowId: sfn.JsonPath.stringAt('$.workflowId'),
          userId: sfn.JsonPath.stringAt('$.userId'),
          taskToken: sfn.JsonPath.taskToken,
        }),
        resultPath: '$.extractTextOutput',
        outputPath: '$',
        timeout: cdk.Duration.minutes(10), // Textract jobs can take a while
      }
    );

    const formatTextTask = new tasks.LambdaInvoke(this, 'Format Text', {
      lambdaFunction: props.formatTextFn,
      payload: sfn.TaskInput.fromObject({
        ...commonParameters,
        'textractOutputS3Path.$': '$.extractTextOutput.s3Path',
      }),
      resultPath: '$.formatTextOutput',
      outputPath: '$',
    });

    // Define the Translate Text LambdaInvoke task
    const translateTextTask = new tasks.LambdaInvoke(this, 'Translate Text', {
      lambdaFunction: props.translateTextFn,
      payload: sfn.TaskInput.fromObject({
        ...commonParameters,
        // Assumes formatTextTask output structure if successful:
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
          // Assumes translateTextTask output structure if successful:
          'translatedTextS3Path.$': '$.translateTextOutput.Payload.s3Path',
        }),
        resultPath: '$.speechOutput',
        outputPath: '$',
      }
    );

    // Task for converting original (formatted) text to speech
    const convertToSpeechNoTranslateFromFormatText = new tasks.LambdaInvoke(
      this,
      'Convert Formatted Text to Speech',
      {
        lambdaFunction: props.convertToSpeechFn,
        payload: sfn.TaskInput.fromObject({
          ...commonParameters,
          // Assumes formatTextTask output structure if successful:
          'formattedTextS3Path.$': '$.formatTextOutput.Payload.s3Path',
        }),
        resultPath: '$.speechOutput',
        outputPath: '$',
      }
    );

    // Define success state
    const finalSuccessState = new sfn.Succeed(this, 'Workflow Succeeded');

    // Define Fail states for task failures
    const formatTextFailed = new sfn.Fail(this, 'Format Text Failed State', {
      cause:
        'FormatText Lambda encountered an error. Check task execution logs.',
      error: 'FormatTextError',
    });

    const translateTextFailed = new sfn.Fail(
      this,
      'Translate Text Failed State',
      {
        cause:
          'TranslateText Lambda encountered an error. Check task execution logs.',
        error: 'TranslateTextError',
      }
    );

    const speechFailed = new sfn.Fail(this, 'ConvertToSpeech Failed State', {
      cause:
        'ConvertToSpeech Lambda encountered an error. Check task execution logs.',
      error: 'ConvertToSpeechError',
    });

    // Workflow logic: Speech synthesis after successful translation
    const synthesizeSpeechFromTranslatedText = new sfn.Choice(
      this,
      'Should Synthesize Speech from Translated Text?'
    )
      .when(
        sfn.Condition.booleanEquals('$.doSpeech', true),
        convertToSpeechWithTranslateTask
          .addCatch(speechFailed, { resultPath: sfn.JsonPath.DISCARD })
          .next(finalSuccessState)
      )
      .otherwise(finalSuccessState);

    // Workflow logic: Speech synthesis from formatted text (no translation)
    const synthesizeSpeechFromFormattedText = new sfn.Choice(
      this,
      'Should Synthesize Speech from Formatted Text?'
    )
      .when(
        sfn.Condition.booleanEquals('$.doSpeech', true),
        convertToSpeechNoTranslateFromFormatText
          .addCatch(speechFailed, { resultPath: sfn.JsonPath.DISCARD })
          .next(finalSuccessState)
      )
      .otherwise(finalSuccessState);

    // Workflow logic: Branch for translation
    const translationBranch = translateTextTask
      .addCatch(translateTextFailed, {
        resultPath: sfn.JsonPath.DISCARD,
      })
      .next(synthesizeSpeechFromTranslatedText);

    // Workflow logic: Main choice after formatting text
    const mainProcessingBranch = new sfn.Choice(this, 'Should Translate Text?')
      .when(
        sfn.Condition.booleanEquals('$.doTranslate', true),
        translationBranch
      )
      .otherwise(synthesizeSpeechFromFormattedText);

    // Define the main workflow chain
    const definition = startTextractJobTask.next(
      formatTextTask
        .addCatch(formatTextFailed, {
          resultPath: sfn.JsonPath.DISCARD,
        })
        .next(mainProcessingBranch)
    );

    this.stateMachine = new sfn.StateMachine(this, 'ProcessingWorkflow', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(15),
    });

    // Grant invoke permissions (LambdaInvoke usually handles this, but explicit grants can be added if needed)
    // props.startTextractJobFn.grantInvoke(this.stateMachine);
    // props.formatTextFn.grantInvoke(this.stateMachine);
    // props.translateTextFn.grantInvoke(this.stateMachine);
    // props.convertToSpeechFn.grantInvoke(this.stateMachine);
  }
}
