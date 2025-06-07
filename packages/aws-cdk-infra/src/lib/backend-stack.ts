import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiGatewayConstruct } from './constructs/api-gateway-construct';
import { AuthConstruct } from './constructs/auth-construct';
import { StorageConstruct } from './constructs/storage-construct';
import { SecretsConstruct } from './constructs/secrets-construct';
import { WorkflowControlLambdas } from './constructs/workflow-control-lambdas';
import { WorkflowStepLambdas } from './constructs/workflow-step-lambdas';
import { WorkflowStepFunctions } from './constructs/workflow-stepfunctions';
import { WorkflowEvents } from './constructs/workflow-events';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { EnvironmentConfig } from '../../config/environments';

function requireEnvVars(vars: string[]) {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

export class BackendStack extends cdk.Stack {
  public readonly userPool: cdk.aws_cognito.UserPool;
  public readonly userPoolClient: cdk.aws_cognito.UserPoolClient;
  public readonly identityPool: cdk.aws_cognito.CfnIdentityPool;
  public readonly apiUrl: string;
  public readonly storageBucket: cdk.aws_s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
    config: EnvironmentConfig
  ) {
    requireEnvVars([
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET_SECRET_ARN',
      'AI_PROVIDER',
    ]);
    super(scope, id, props);

    // Environment name for resource naming
    const envName = config.stackPrefix.toLowerCase();

    // Secrets Manager for API keys and other secrets
    const secrets = new SecretsConstruct(this, 'Secrets', {
      envName,
      appName: 'inkstream',
      openaiApiKeySecretArn: process.env.OPENAI_API_KEY_SECRET_ARN,
      googleClientSecretSecretArn: process.env.GOOGLE_CLIENT_SECRET_SECRET_ARN!,
    });

    // S3 and DynamoDB setup (StorageConstruct must be created before WorkflowStepLambdas)
    const storage = new StorageConstruct(this, 'Storage', {
      config,
    });

    // Cognito User Pool and Client
    const auth = new AuthConstruct(this, 'Auth', {
      envName,
      googleClientId: process.env.GOOGLE_CLIENT_ID!,
      googleClientSecret: secrets.googleClientSecretSecret,
      domainName: config.domainName,
      webAppDomain: config.subdomains.web,
      cloudFrontDomain: config.cloudFrontDomain,
      storageBucketName: storage.storageBucket.bucketName,
    });

    // Lambdas for workflow steps
    const stepLambdas = new WorkflowStepLambdas(this, 'WorkflowStepLambdas', {
      storageBucketName: storage.storageBucket.bucketName,
      bedrockModelId: process.env.CLAUDE_MODEL_ID, // Pass the environment variable here
      textractJobTokensTableName: storage.textractJobTokensTable.tableName,
      userWorkflowsTableName: storage.userWorkflowsTable.tableName,
      openaiApiKeySecretArn: secrets.getOpenAIApiKeySecretArn(),
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

    // EventBridge rules and lambdas for workflow state changes
    const workflowEvents = new WorkflowEvents(this, 'WorkflowEvents', {
      userWorkflowsTableName: storage.userWorkflowsTable.tableName,
      stateMachineArn: stateMachine.stateMachineArn,
    });

    // Grant permissions to the state machine to invoke the Lambda functions
    stateMachine.grantStartExecution(controlLambdas.startWorkflowFn);
    stateMachine.grantRead(controlLambdas.workflowFn);

    // Grant permissions to the workflow state table for the Lambda functions
    storage.userWorkflowsTable.grantWriteData(controlLambdas.startWorkflowFn);
    storage.userWorkflowsTable.grantReadData(controlLambdas.workflowFn); // Added missing read permission for workflow Lambda
    storage.userWorkflowsTable.grantReadData(controlLambdas.userWorkflowsFn); // Grant read permissions for user-workflows Lambda
    storage.userWorkflowsTable.grantReadData(stepLambdas.startTextractJobFn);

    // Grant DynamoDB write permissions to step lambdas for workflow status updates
    storage.userWorkflowsTable.grantWriteData(stepLambdas.startTextractJobFn);
    storage.userWorkflowsTable.grantWriteData(stepLambdas.formatTextFn);
    storage.userWorkflowsTable.grantWriteData(stepLambdas.translateTextFn);
    storage.userWorkflowsTable.grantWriteData(stepLambdas.convertToSpeechFn);

    // Grant DynamoDB write permissions to workflow events lambda for status updates
    storage.userWorkflowsTable.grantWriteData(
      workflowEvents.workflowStateChangeFn
    );

    // Grant Secrets Manager read permissions to AI workflow lambdas (OpenAI only)
    secrets.grantOpenAISecretRead(stepLambdas.formatTextFn);
    secrets.grantOpenAISecretRead(stepLambdas.translateTextFn);

    console.log('building API Gateway...');
    // API Gateway
    const api = new ApiGatewayConstruct(this, 'ApiGateway', {
      startWorkflowFn: controlLambdas.startWorkflowFn,
      workflowStatusFn: controlLambdas.workflowFn,
      userWorkflowsFn: controlLambdas.userWorkflowsFn,
      userPool: auth.userPool,
      userPoolClientId: auth.userPoolClient.userPoolClientId, // Pass userPoolClientId here
      config,
    });

    // Create Route53 A record for API Gateway custom domain (only if custom domain exists)
    if (api.customDomain && config.subdomains.api && config.domainName) {
      // Look up existing hosted zone
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: config.domainName,
      });

      // Create A record pointing to API Gateway custom domain
      new route53.ARecord(this, 'ApiARecord', {
        zone: hostedZone,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.ApiGatewayv2DomainProperties(
            api.customDomain.regionalDomainName,
            api.customDomain.regionalHostedZoneId
          )
        ),
        recordName: config.subdomains.api,
      });
    }

    // Store references for cross-stack outputs
    this.userPool = auth.userPool;
    this.userPoolClient = auth.userPoolClient;
    this.identityPool = auth.identityPool;
    this.apiUrl = api.httpApi.url ?? '';
    this.storageBucket = storage.storageBucket;

    // Backend Stack Outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.httpApi.url ?? 'undefined',
      description: 'API Gateway URL for frontend configuration',
      exportName: `${config.stackPrefix}-ApiGatewayUrl`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID for frontend configuration',
      exportName: `${config.stackPrefix}-UserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolWebClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for frontend configuration',
      exportName: `${config.stackPrefix}-UserPoolWebClientId`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: auth.identityPool.ref,
      description: 'Cognito Identity Pool ID for frontend configuration',
      exportName: `${config.stackPrefix}-IdentityPoolId`,
    });

    new cdk.CfnOutput(this, 'StorageBucketName', {
      value: storage.storageBucket.bucketName,
      description: 'S3 storage bucket name for frontend configuration',
      exportName: `${config.stackPrefix}-StorageBucketName`,
    });

    new cdk.CfnOutput(this, 'StateMachineArn', {
      value: stateMachine.stateMachineArn,
      description: 'Step Functions state machine ARN',
    });

    // Output custom domain information if available
    if (api.customDomain) {
      new cdk.CfnOutput(this, 'ApiCustomDomainName', {
        value: api.customDomain.name,
        description: 'Custom domain name for API Gateway',
      });

      new cdk.CfnOutput(this, 'ApiDomainNameAlias', {
        value: api.customDomain.regionalDomainName,
        description: 'Regional domain name for Route53 alias record',
      });

      new cdk.CfnOutput(this, 'ApiDomainNameHostedZoneId', {
        value: api.customDomain.regionalHostedZoneId,
        description: 'Hosted zone ID for Route53 alias record',
      });
    }

    new cdk.CfnOutput(this, 'ManualCognitoSetup', {
      value: `IMPORTANT: Manual step required for per-user S3 folder access.\n1. Go to AWS Console -> Cognito -> Identity Pools -> ${auth.identityPool.identityPoolName} (or ${auth.identityPool.ref}).\n2. Under "Identity providers", select your Cognito User Pool (${auth.userPool.userPoolProviderName}).\n3. Click "Edit attributes for access control".\n4. Select "Use custom mappings".\n5. Add a mapping: Tag key "sub", Claim "sub".\n6. Save changes.\nThis enables the \${aws:PrincipalTag/sub} variable in IAM policies.`,
      description:
        'Manual steps required in Cognito Identity Pool for session tags.',
    });
  }
}