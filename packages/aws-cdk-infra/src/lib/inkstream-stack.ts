import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiGatewayConstruct } from './constructs/api-gateway-construct';
import { AuthConstruct } from './constructs/auth-construct';
import { StorageConstruct } from './constructs/storage-construct';
import { SecretsConstruct } from './constructs/secrets-construct';
import { WorkflowControlLambdas } from './constructs/workflow-control-lambdas';
import { WorkflowStepLambdas } from './constructs/workflow-step-lambdas';
import { WorkflowStepFunctions } from './constructs/workflow-stepfunctions';

function requireEnvVars(vars: string[]) {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

export class InkstreamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    requireEnvVars([
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET_SECRET_NAME',
      'AWS_ACCOUNT_ID',
      'AWS_REGION',
      'AI_PROVIDER',
    ]);
    super(scope, id, props);

    // Secrets Manager for API keys and other secrets
    const secrets = new SecretsConstruct(this, 'Secrets', {
      envName: 'dev',
      appName: 'inkstream',
      openaiApiKeySecretName: process.env.OPENAI_API_KEY_SECRET_NAME,
      googleClientSecretSecretName:
        process.env.GOOGLE_CLIENT_SECRET_SECRET_NAME!,
    });

    // Cognito User Pool and Client
    const auth = new AuthConstruct(this, 'Auth', {
      envName: 'dev',
      googleClientId: process.env.GOOGLE_CLIENT_ID!,
      googleClientSecret: secrets.googleClientSecretSecret,
    });

    // S3 and DynamoDB setup (StorageConstruct must be created before WorkflowStepLambdas)
    const storage = new StorageConstruct(this, 'Storage');

    // Lambdas for workflow steps
    const stepLambdas = new WorkflowStepLambdas(this, 'WorkflowStepLambdas', {
      storageBucketName: storage.storageBucket.bucketName,
      bedrockModelId: process.env.CLAUDE_MODEL_ID, // Pass the environment variable here
      textractJobTokensTableName: storage.textractJobTokensTable.tableName,
      userWorkflowsTableName: storage.userWorkflowsTable.tableName,
      openaiApiKeySecretName: secrets.getOpenAIApiKeySecretName(),
    });

    // Now that stepLambdas is created, set the S3 event notification
    storage.storageBucket.addEventNotification(
      cdk.aws_s3.EventType.OBJECT_CREATED,
      new cdk.aws_s3_notifications.LambdaDestination(
        stepLambdas.processTextractS3EventFn
      ),
      { prefix: 'textract-output/' }
    );

    // Step Functions workflow definition
    const workflowSF = new WorkflowStepFunctions(
      this,
      'WorkflowStepFunctions',
      {
        formatTextFn: stepLambdas.formatTextFn,
        translateTextFn: stepLambdas.translateTextFn,
        convertToSpeechFn: stepLambdas.convertToSpeechFn,
        startTextractJobFn: stepLambdas.startTextractJobFn,
      }
    );
    const stateMachine = workflowSF.stateMachine;

    // Lambdas for workflow control
    const controlLambdas = new WorkflowControlLambdas(
      this,
      'WorkflowControlLambdas',
      {
        stateMachineArn: stateMachine.stateMachineArn,
        userWorkflowsTableName: storage.userWorkflowsTable.tableName,
        storageBucket: storage.storageBucket.bucketName,
      }
    );

    // Grant permissions to the state machine to invoke the Lambda functions
    stateMachine.grantStartExecution(controlLambdas.startWorkflowFn);
    stateMachine.grantRead(controlLambdas.workflowStatusFn);

    // Grant permissions to the workflow state table for the Lambda functions
    storage.userWorkflowsTable.grantWriteData(controlLambdas.startWorkflowFn);
    storage.userWorkflowsTable.grantReadData(controlLambdas.workflowStatusFn); // Added missing read permission for workflow-status Lambda
    storage.userWorkflowsTable.grantReadData(stepLambdas.startTextractJobFn);

    // Grant DynamoDB write permissions to step lambdas for workflow status updates
    storage.userWorkflowsTable.grantWriteData(stepLambdas.startTextractJobFn);
    storage.userWorkflowsTable.grantWriteData(stepLambdas.formatTextFn);
    storage.userWorkflowsTable.grantWriteData(stepLambdas.translateTextFn);
    storage.userWorkflowsTable.grantWriteData(stepLambdas.convertToSpeechFn);

    // Grant Secrets Manager read permissions to AI workflow lambdas
    secrets.grantSecretRead(stepLambdas.formatTextFn);
    secrets.grantSecretRead(stepLambdas.translateTextFn);

    // API Gateway
    const api = new ApiGatewayConstruct(this, 'ApiGateway', {
      startWorkflowFn: controlLambdas.startWorkflowFn,
      workflowStatusFn: controlLambdas.workflowStatusFn,
      userPool: auth.userPool,
      userPoolClientId: auth.userPoolClient.userPoolClientId, // Pass userPoolClientId here
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
