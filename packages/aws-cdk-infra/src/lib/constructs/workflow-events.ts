import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

export interface WorkflowEventsProps {
  userWorkflowsTableName: string;
  stateMachineArn: string;
}

export class WorkflowEvents extends Construct {
  public readonly workflowStateChangeFn: lambda.IFunction;
  public readonly workflowStateChangeRule: events.Rule;

  constructor(scope: Construct, id: string, props: WorkflowEventsProps) {
    super(scope, id);

    // Lambda function to handle Step Functions state changes
    this.workflowStateChangeFn = new NodejsFunction(
      this,
      'WorkflowStateChangeFunction',
      {
        entry: path.join(
          __dirname,
          '../../lambda/events/workflow-state-change/index.ts'
        ),
        handler: 'handler',
        description:
          'Handle Step Functions state changes for workflow status updates',
        runtime: lambda.Runtime.NODEJS_18_X,
        timeout: cdk.Duration.seconds(30),
        environment: {
          USER_WORKFLOWS_TABLE: props.userWorkflowsTableName,
        },
        initialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: ['dynamodb:UpdateItem'],
            resources: [
              `arn:aws:dynamodb:*:*:table/${props.userWorkflowsTableName}`,
            ],
          }),
        ],
      }
    );

    // EventBridge rule to trigger Lambda on Step Functions state changes
    this.workflowStateChangeRule = new events.Rule(
      this,
      'WorkflowStateChangeRule',
      {
        description:
          'Trigger Lambda when Step Functions executions time out or are aborted',
        eventPattern: {
          source: ['aws.states'],
          detailType: ['Step Functions Execution Status Change'],
          detail: {
            stateMachineArn: [props.stateMachineArn],
            status: ['TIMED_OUT', 'ABORTED'],
          },
        },
        targets: [new targets.LambdaFunction(this.workflowStateChangeFn)],
      }
    );
  }
}
