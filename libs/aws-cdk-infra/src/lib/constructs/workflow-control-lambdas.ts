import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

export interface WorkflowControlLambdasProps {
  stateMachineArn: string;
}

export class WorkflowControlLambdas extends Construct {
  public readonly startWorkflowFn: lambda.IFunction;
  public readonly workflowStatusFn: lambda.IFunction;

  constructor(
    scope: Construct,
    id: string,
    props: WorkflowControlLambdasProps
  ) {
    super(scope, id);

    this.startWorkflowFn = new NodejsFunction(this, 'StartWorkflowFunction', {
      entry: path.join(__dirname, '../../lambda/start-workflow/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        STATE_MACHINE_ARN: props.stateMachineArn,
      },
    });

    this.workflowStatusFn = new NodejsFunction(this, 'WorkflowStatusFunction', {
      entry: path.join(__dirname, '../../lambda/workflow-status/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      timeout: cdk.Duration.seconds(10),
    });
  }
}
