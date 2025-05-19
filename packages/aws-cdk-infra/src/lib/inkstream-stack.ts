import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiGatewayConstruct } from './constructs/api-gateway-construct';
import { AuthConstruct } from './constructs/auth-construct';
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

    // Authentication setup
    const auth = new AuthConstruct(this, 'Auth', {
      envName: 'dev',
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
      userPool: auth.userPool,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: api.httpApi.url ?? 'undefined',
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
    });

    // Output Cognito IDs for frontend configuration
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolWebClientId', {
      value: auth.userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: auth.identityPool.ref,
    });

    new cdk.CfnOutput(this, 'ManualCognitoSetup', {
      value: `IMPORTANT: Manual step required for per-user S3 folder access.\n1. Go to AWS Console -> Cognito -> Identity Pools -> ${auth.identityPool.identityPoolName} (or ${auth.identityPool.ref}).\n2. Under "Identity providers", select your Cognito User Pool (${auth.userPool.userPoolProviderName}).\n3. Click "Edit attributes for access control".\n4. Select "Use custom mappings".\n5. Add a mapping: Tag key "sub", Claim "sub".\n6. Save changes.\nThis enables the \${aws:PrincipalTag/sub} variable in IAM policies.`,
      description:
        'Manual steps required in Cognito Identity Pool for session tags.',
    });
  }
}
