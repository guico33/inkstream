import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { EnvironmentConfig } from '../../../config/environments';

export interface ApiGatewayConstructProps {
  startWorkflowFn: lambda.IFunction;
  workflowStatusFn: lambda.IFunction;
  userWorkflowsFn: lambda.IFunction;
  userPool: cognito.IUserPool;
  userPoolClientId: string;
  config: EnvironmentConfig;
}

export class ApiGatewayConstruct extends Construct {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly customDomain?: apigwv2.DomainName;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    // Build CORS allowed origins based on environment
    const allowedOrigins = [
      'http://localhost:5174', // Local development
    ];

    // Add production web domain if available
    if (props.config.subdomains.web) {
      allowedOrigins.push(`https://${props.config.subdomains.web}`);
    }

    // Add CloudFront domain for dev environments
    if (props.config.cloudFrontDomain) {
      allowedOrigins.push(`https://${props.config.cloudFrontDomain}`);
    }

    // Create custom domain if SSL certificate is provided and API subdomain is configured
    let customDomainName: apigwv2.DomainName | undefined;
    if (props.config.certificateArn && props.config.subdomains.api) {
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'ApiCertificate',
        props.config.certificateArn
      );

      customDomainName = new apigwv2.DomainName(this, 'ApiCustomDomain', {
        domainName: props.config.subdomains.api,
        certificate,
      });

      // Store reference for external access (e.g., for Route53 configuration)
      this.customDomain = customDomainName;
    }

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${props.config.stackPrefix.toLowerCase()}-inkstream-api-${
        scope.node.tryGetContext('account') || props.config.accountId
      }`,
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
        maxAge: cdk.Duration.days(10),
      },
      // Attach custom domain if available
      defaultDomainMapping: customDomainName
        ? {
            domainName: customDomainName,
          }
        : undefined,
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
      path: '/workflow/{workflowId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwv2_integrations.HttpLambdaIntegration(
        'WorkflowIntegration',
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
