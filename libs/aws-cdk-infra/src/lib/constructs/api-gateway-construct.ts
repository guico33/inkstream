import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface ApiGatewayConstructProps {
  startWorkflowFn: lambda.IFunction;
  workflowStatusFn: lambda.IFunction;
}

export class ApiGatewayConstruct extends Construct {
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `dev-inkstream-api-${
        scope.node.tryGetContext('account') || 'dev'
      }`,
    });

    this.httpApi.addRoutes({
      path: '/workflow/start',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'StartWorkflowIntegration',
        props.startWorkflowFn
      ),
    });

    this.httpApi.addRoutes({
      path: '/workflow/status',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'WorkflowStatusIntegration',
        props.workflowStatusFn
      ),
    });
  }
}
