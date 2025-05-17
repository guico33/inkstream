import * as cdk from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { ApiGatewayConstruct } from './constructs/api-gateway-construct';
import { StorageConstruct } from './constructs/storage-construct';
import { WorkflowControlLambdas } from './constructs/workflow-control-lambdas';
import { WorkflowStepLambdas } from './constructs/workflow-step-lambdas';

export class InkstreamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 and DynamoDB setup
    const bucketName = `dev-inkstream-uploads-${cdk.Stack.of(this).account}`;
    const tableName = `dev-inkstream-user-files-${cdk.Stack.of(this).account}`;
    const storage = new StorageConstruct(this, 'Storage', {
      bucketName,
      tableName,
    });

    // Lambdas for workflow steps
    const stepLambdas = new WorkflowStepLambdas(this, 'WorkflowStepLambdas', {
      tableName,
      bucketName,
    });

    // Step Functions workflow definition
    const extractTextTask = new tasks.LambdaInvoke(this, 'Extract Text', {
      lambdaFunction: stepLambdas.extractTextFn,
      payloadResponseOnly: true,
    });
    const formatTextTask = new tasks.LambdaInvoke(this, 'Format Text', {
      lambdaFunction: stepLambdas.formatTextFn,
      payloadResponseOnly: true,
    });
    const translateTextTask = new tasks.LambdaInvoke(this, 'Translate Text', {
      lambdaFunction: stepLambdas.translateTextFn,
      payloadResponseOnly: true,
    });
    const convertToSpeechWithTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert to Speech With Translate',
      {
        lambdaFunction: stepLambdas.convertToSpeechFn,
        payloadResponseOnly: true,
      }
    );
    const convertToSpeechNoTranslateTask = new tasks.LambdaInvoke(
      this,
      'Convert to Speech No Translate',
      {
        lambdaFunction: stepLambdas.convertToSpeechFn,
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
    const stateMachine = new sfn.StateMachine(this, 'ProcessingWorkflow', {
      definition: workflow,
      timeout: cdk.Duration.minutes(5),
    });

    // Lambdas for workflow control
    const controlLambdas = new WorkflowControlLambdas(
      this,
      'WorkflowControlLambdas',
      {
        stateMachineArn: stateMachine.stateMachineArn,
      }
    );

    // Grant permissions to the state machine to invoke the Lambda functions
    stateMachine.grantStartExecution(controlLambdas.startWorkflowFn);
    stateMachine.grantRead(controlLambdas.workflowStatusFn);

    // API Gateway
    const api = new ApiGatewayConstruct(this, 'ApiGateway', {
      startWorkflowFn: controlLambdas.startWorkflowFn,
      workflowStatusFn: controlLambdas.workflowStatusFn,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: api.httpApi.url ?? 'undefined',
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
    });
  }
}
