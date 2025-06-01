import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { WorkflowCommonState } from '@inkstream/shared';

export interface WorkflowStepFunctionsProps {
  formatTextFn: lambda.IFunction;
  translateTextFn: lambda.IFunction;
  convertToSpeechFn: lambda.IFunction;
  startTextractJobFn: lambda.IFunction; // Added for starting Textract jobme
}

/**
 * Type helper to convert WorkflowCommonState properties to Step Functions JSONPath parameters
 * Maps each property key to its JSONPath equivalent with '.$' suffix
 */
type StepFunctionsParams<T> = {
  [K in keyof T as `${string & K}.$`]: string;
};

/**
 * Utility function to create Step Functions JSONPath parameters from WorkflowCommonState type
 * Automatically maps each property to its execution state path (e.g., 'originalFileKey.$': '$.originalFileKey')
 */
function createCommonStepFunctionsParams(): StepFunctionsParams<WorkflowCommonState> & {
  workflowId: string;
} {
  return {
    'originalFileKey.$': '$.originalFileKey',
    'storageBucket.$': '$.storageBucket',
    'userId.$': '$.userId',
    'doTranslate.$': '$.doTranslate',
    'doSpeech.$': '$.doSpeech',
    'targetLanguage.$': '$.targetLanguage',
    'timestamp.$': '$.timestamp',
    workflowId: sfn.JsonPath.executionId, // Use execution name as workflowId
  };
}

/**
 * Common Step Functions parameters that are passed to all workflow Lambda tasks
 * Dynamically typed based on WorkflowCommonState to ensure type safety
 */
const COMMON_WORKFLOW_PARAMS = createCommonStepFunctionsParams();

export class WorkflowStepFunctions extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowStepFunctionsProps) {
    super(scope, id);

    // Event-driven Textract: Start job and wait for callback
    const startTextractJobTask = new tasks.LambdaInvoke(
      this,
      'Start Textract Job',
      {
        lambdaFunction: props.startTextractJobFn,
        integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        resultPath: '$.textractResult', // Preserve original input and add result
        payload: sfn.TaskInput.fromObject({
          taskToken: sfn.JsonPath.taskToken,
          ...COMMON_WORKFLOW_PARAMS,
        }),
        timeout: cdk.Duration.minutes(30), // Textract jobs can take a while
      }
    );

    const formatTextTask = new tasks.LambdaInvoke(this, 'Format Text', {
      lambdaFunction: props.formatTextFn,
      resultPath: '$.formatResult',
      payload: sfn.TaskInput.fromObject({
        // Merge original execution input with Textract result
        'textractMergedFileKey.$': '$.textractResult.textractMergedFileKey',
        ...COMMON_WORKFLOW_PARAMS,
      }),
    });

    // Define the Translate Text LambdaInvoke task
    const translateTextTask = new tasks.LambdaInvoke(this, 'Translate Text', {
      lambdaFunction: props.translateTextFn,
      resultPath: '$.translateResult',
      payload: sfn.TaskInput.fromObject({
        // Pass the formatted text file key from previous step
        'formattedTextFileKey.$': '$.formatResult.Payload.formattedTextFileKey',
        ...COMMON_WORKFLOW_PARAMS,
      }),
    });

    // Task for converting translated text to speech
    const convertToSpeechWithTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert Translated Text to Speech',
      {
        lambdaFunction: props.convertToSpeechFn,
        resultPath: '$.speechResult',
        payload: sfn.TaskInput.fromObject({
          // Pass the translated text file key from previous step
          'translatedTextFileKey.$':
            '$.translateResult.Payload.translatedTextFileKey',
          ...COMMON_WORKFLOW_PARAMS,
        }),
      }
    );

    // Task for converting original (formatted) text to speech
    const convertToSpeechNoTranslateFromFormatText = new tasks.LambdaInvoke(
      this,
      'Convert Formatted Text to Speech',
      {
        lambdaFunction: props.convertToSpeechFn,
        resultPath: '$.speechResult',
        payload: sfn.TaskInput.fromObject({
          // Pass the formatted text file key from format step
          'formattedTextFileKey.$':
            '$.formatResult.Payload.formattedTextFileKey',
          ...COMMON_WORKFLOW_PARAMS,
        }),
      }
    );

    // Define success state
    const finalSuccessState = new sfn.Succeed(this, 'Workflow Succeeded');

    // Define Fail states for task failures with dynamic error information
    const textractJobFailed = new sfn.Fail(this, 'Textract Job Failed State', {
      causePath: '$.errorInfo.Cause',
      errorPath: '$.errorInfo.Error',
    });

    const formatTextFailed = new sfn.Fail(this, 'Format Text Failed State', {
      causePath: '$.errorInfo.Cause',
      errorPath: '$.errorInfo.Error',
    });

    const translateTextFailed = new sfn.Fail(
      this,
      'Translate Text Failed State',
      {
        causePath: '$.errorInfo.Cause',
        errorPath: '$.errorInfo.Error',
      }
    );

    const speechFailed = new sfn.Fail(this, 'ConvertToSpeech Failed State', {
      causePath: '$.errorInfo.Cause',
      errorPath: '$.errorInfo.Error',
    });

    // Workflow logic: Speech synthesis after successful translation
    const synthesizeSpeechFromTranslatedText = new sfn.Choice(
      this,
      'Should Synthesize Speech from Translated Text?'
    )
      .when(
        sfn.Condition.booleanEquals('$.doSpeech', true),
        convertToSpeechWithTranslateTask
          .addCatch(speechFailed, { resultPath: '$.errorInfo' })
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
          .addCatch(speechFailed, { resultPath: '$.errorInfo' })
          .next(finalSuccessState)
      )
      .otherwise(finalSuccessState);

    // Workflow logic: Branch for translation
    const translationBranch = translateTextTask
      .addCatch(translateTextFailed, {
        resultPath: '$.errorInfo',
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
    const definition = startTextractJobTask
      .addCatch(textractJobFailed, {
        resultPath: '$.errorInfo',
      })
      .next(
        formatTextTask
          .addCatch(formatTextFailed, {
            resultPath: '$.errorInfo',
          })
          .next(mainProcessingBranch)
      );

    this.stateMachine = new sfn.StateMachine(this, 'ProcessingWorkflow', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(31), // Allow enough time for Textract jobs + other tasks
    });
  }
}
