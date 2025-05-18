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

    const extractTextTask = new tasks.LambdaInvoke(this, 'Extract Text', {
      lambdaFunction: props.extractTextFn,
      payloadResponseOnly: true,
    });
    const formatTextTask = new tasks.LambdaInvoke(this, 'Format Text', {
      lambdaFunction: props.formatTextFn,
      payloadResponseOnly: true,
    });
    const translateTextTask = new tasks.LambdaInvoke(this, 'Translate Text', {
      lambdaFunction: props.translateTextFn,
      payloadResponseOnly: true,
    });
    const convertToSpeechWithTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert to Speech With Translate',
      {
        lambdaFunction: props.convertToSpeechFn,
        payloadResponseOnly: true,
      }
    );
    const convertToSpeechNoTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert to Speech No Translate',
      {
        lambdaFunction: props.convertToSpeechFn,
        payloadResponseOnly: true,
      }
    );
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
    this.stateMachine = new sfn.StateMachine(this, 'ProcessingWorkflow', {
      definition: workflow,
      timeout: cdk.Duration.minutes(5),
    });
  }
}
