import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface ApiGatewayConstructProps {
  startWorkflowFn: lambda.IFunction;
  workflowStatusFn: lambda.IFunction;
  userWorkflowsFn: lambda.IFunction;
  userPool: cognito.IUserPool;
  userPoolClientId: string;
}

export class ApiGatewayConstruct extends Construct {
  public readonly httpApi: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `dev-inkstream-api-${
        scope.node.tryGetContext('account') || 'dev'
      }`,
      corsPreflight: {
        allowOrigins: ['*'], // In production, restrict to your domain
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
        maxAge: cdk.Duration.days(10),
      },
    });

    // Custom implementation of IHttpRouteAuthorizer to wrap HttpAuthorizer
    class CustomHttpAuthorizer implements apigwv2.IHttpRouteAuthorizer {
      constructor(private readonly authorizer: apigwv2.HttpAuthorizer) {}

      bind(): apigwv2.HttpRouteAuthorizerConfig {
        return {
          authorizationType: apigwv2.HttpAuthorizerType.JWT,
          authorizerId: this.authorizer.authorizerId,
        };
      }
    }

    // Create a Cognito User Pool authorizer
    const httpAuthorizer = new apigwv2.HttpAuthorizer(
      this,
      'CognitoAuthorizer',
      {
        httpApi: this.httpApi,
        type: apigwv2.HttpAuthorizerType.JWT,
        identitySource: ['$request.header.Authorization'],
        jwtAudience: [props.userPoolClientId],
        jwtIssuer: `https://cognito-idp.${
          cdk.Stack.of(this).region
        }.amazonaws.com/${props.userPool.userPoolId}`,
      }
    );

    const customAuthorizer = new CustomHttpAuthorizer(httpAuthorizer);

    // Update routes to use the custom authorizer
    this.httpApi.addRoutes({
      path: '/workflow/start',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration(
        'StartWorkflowIntegration',
        props.startWorkflowFn
      ),
      authorizer: customAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/workflow/status',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new apigwv2_integrations.HttpLambdaIntegration(
        'WorkflowStatusIntegration',
        props.workflowStatusFn
      ),
      authorizer: customAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/user-workflows',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration(
        'UserWorkflowsIntegration',
        props.userWorkflowsFn
      ),
      authorizer: customAuthorizer,
    });
  }
}
