import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowControlLambdasProps {
  stateMachineArn: string;
  userWorkflowsTableName: string;
  storageBucket: string;
}

export class WorkflowControlLambdas extends Construct {
  public readonly startWorkflowFn: lambda.IFunction;
  public readonly workflowFn: lambda.IFunction;
  public readonly userWorkflowsFn: lambda.IFunction;

  constructor(
    scope: Construct,
    id: string,
    props: WorkflowControlLambdasProps
  ) {
    super(scope, id);

    this.startWorkflowFn = new NodejsFunction(this, 'StartWorkflowFunction', {
      entry: path.join(__dirname, '../../lambda/api/start-workflow/index.ts'),
      handler: 'handler',
      description: 'Start a workflow execution',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        STATE_MACHINE_ARN: props.stateMachineArn,
        USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
        STORAGE_BUCKET: props.storageBucket,
      },
    });

    this.workflowFn = new NodejsFunction(this, 'WorkflowFunction', {
      entry: path.join(__dirname, '../../lambda/api/workflow/index.ts'),
      handler: 'handler',
      description: 'Get the details of a workflow execution',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
      },
    });

    this.userWorkflowsFn = new NodejsFunction(this, 'UserWorkflowsFunction', {
      entry: path.join(__dirname, '../../lambda/api/user-workflows/index.ts'),
      handler: 'handler',
      description: 'Get all workflows for a user',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
      },
    });
  }
}
