import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiGatewayConstruct } from './constructs/api-gateway-construct';
import { StorageConstruct } from './constructs/storage-construct';
import { WorkflowControlLambdas } from './constructs/workflow-control-lambdas';
import { WorkflowStepLambdas } from './constructs/workflow-step-lambdas';
import { WorkflowStepFunctions } from './constructs/workflow-stepfunctions';

export class InkstreamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 and DynamoDB setup
    const bucketName = `dev-inkstream-storage-${cdk.Stack.of(this).account}`;
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
    const workflowSF = new WorkflowStepFunctions(
      this,
      'WorkflowStepFunctions',
      {
        extractTextFn: stepLambdas.extractTextFn,
        formatTextFn: stepLambdas.formatTextFn,
        translateTextFn: stepLambdas.translateTextFn,
        convertToSpeechFn: stepLambdas.convertToSpeechFn,
      }
    );
    const stateMachine = workflowSF.stateMachine;

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
