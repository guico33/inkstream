import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * Properties for the AuthConstruct
 */
export interface AuthConstructProps {
  // Environment name used to prefix resource names
  envName: string;

  // Google OAuth Client ID (not sensitive) - required
  googleClientId: string;

  // Google OAuth Client Secret (from SecretsConstruct) - required
  googleClientSecret: secretsmanager.ISecret;

  // Domain configuration for OAuth callbacks
  domainName?: string; // e.g., 'inkstream.cloud' for prod, 'dev.inkstream.cloud' for dev
  webAppDomain?: string; // e.g., 'app.inkstream.cloud' for prod
  cloudFrontDomain?: string; // e.g., 'd2l0j0z2j75g3e.cloudfront.net' for dev

  // Email whitelist for pre-signup validation (dev environments only)
  allowedEmails?: string; // Comma-separated list passed from environment variable

  // Storage bucket name for S3 permissions
  storageBucketName: string;
}

/**
 * AuthConstruct - Provides authentication and authorization for the Inkstream application
 *
 * This construct sets up:
 * 1. Amazon Cognito User Pool - handles user registration, sign-in, and account recovery
 * 2. User Pool Client - allows the frontend application to interact with Cognito
 * 3. Identity Pool - provides AWS credentials for authenticated users
 * 4. IAM Roles - defines permissions for authenticated users to access S3 resources
 */
export class AuthConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: AuthConstructProps) {
    super(scope, id);

    // Create the user pool
    // This is the main user directory that stores user accounts and handles:
    // - User registration and confirmation
    // - User sign-in and sign-out
    // - Account recovery workflows
    // - Multi-factor authentication
    // Create pre-signup Lambda trigger for dev environments only
    let preSignupTrigger: lambda.IFunction | undefined;
    if (props.envName === 'dev') {
      preSignupTrigger = new lambdaNodejs.NodejsFunction(this, 'PreSignupTrigger', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handler',
        entry: path.join(__dirname, '../../lambda/auth/pre-signup.ts'),
        environment: {
          ALLOWED_EMAILS: props.allowedEmails || '', // Default empty, managed via AWS Console
        },
        timeout: cdk.Duration.seconds(30),
        description: 'Validates email whitelist before allowing user signup (dev only)',
      });
    }

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${props.envName}-inkstream-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development; use RETAIN for production
      // Add pre-signup trigger if provided
      lambdaTriggers: preSignupTrigger ? {
        preSignUp: preSignupTrigger,
      } : undefined,
    });

    // Create the app client
    // This client allows the frontend application to:
    // - Register users
    // - Authenticate users
    // - Verify user attributes
    // - Request and verify recovery codes
    this.userPoolClient = this.userPool.addClient('InkstreamAppClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:5174/auth/callback', // Local development (must match frontend redirect_uri)
          ...(props.domainName
            ? [`https://${props.domainName}/auth/callback`]
            : []),
          ...(props.webAppDomain
            ? [`https://${props.webAppDomain}/auth/callback`]
            : []),
          ...(props.cloudFrontDomain
            ? [`https://${props.cloudFrontDomain}/auth/callback`]
            : []),
        ].filter(Boolean),
        logoutUrls: [
          'http://localhost:5174', // Local development
          ...(props.domainName ? [`https://${props.domainName}`] : []),
          ...(props.webAppDomain ? [`https://${props.webAppDomain}`] : []),
          ...(props.cloudFrontDomain ? [`https://${props.cloudFrontDomain}`] : []),
        ].filter(Boolean),
      },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });

    // Add Google as identity provider with required credentials
    // Use the secret passed from SecretsConstruct
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'GoogleProvider',
      {
        userPool: this.userPool,
        clientId: props.googleClientId,
        clientSecretValue: props.googleClientSecret.secretValue,
        scopes: ['profile', 'email', 'openid'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
        },
      }
    );

    this.userPoolClient.node.addDependency(googleProvider);

    console.log('Google OAuth provider configured with Secrets Manager');

    // Create the identity pool
    // The identity pool provides AWS credentials to users who sign in through the user pool
    // This allows authenticated users to directly access AWS services like S3
    // without having to proxy through a backend service
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `${props.envName}InkstreamIdentityPool`,
      allowUnauthenticatedIdentities: false, // Set to true if you want to support guest access
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // IMPORTANT: Manual step required after deployment
    // For per-user folder access with ${aws:PrincipalTag/sub} variable substitution to work,
    // you must enable session tags for federated users in the AWS Console:
    // 1. Go to AWS Console -> Cognito -> Identity Pools -> [your pool] -> Identity providers -> Cognito user pool
    // 2. Find "Edit attributes for access control" under the Identity Provider settings
    // 3. Select "Use custom mappings" (add "sub" -> "sub" mapping)
    // 4. Save changes
    //
    // This step cannot be automated with CDK as the principal tags configuration
    // is not supported in the AWS::Cognito::IdentityPool CloudFormation resource.

    // Create roles for authenticated users
    // This role defines what AWS resources authenticated users can access
    const authenticatedRole = new cdk.aws_iam.Role(this, 'AuthenticatedRole', {
      assumedBy: new cdk.aws_iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for authenticated users to access S3',
    });

    // Add sts:TagSession to the trust policy for session tags
    const cfnRole = authenticatedRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnRole.addOverride(
      'Properties.AssumeRolePolicyDocument.Statement.0.Action',
      ['sts:AssumeRoleWithWebIdentity', 'sts:TagSession']
    );

    // Define permissions for authenticated users
    // Secure per-user folder policy using variable substitution
    authenticatedRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          // Allow access to all user folders for downloading processed files
          `arn:aws:s3:::${props.storageBucketName}/users/\${aws:PrincipalTag/sub}/*`,
        ],
      })
    );

    // Attach roles to identity pool
    // Use CfnJson to allow deploy-time resolution of the roleMappings key
    const roleMappings = new cdk.CfnJson(this, 'RoleMappings', {
      value: {
        [`${this.userPool.userPoolProviderName}:${this.userPoolClient.userPoolClientId}`]:
          {
            Type: 'Token',
            AmbiguousRoleResolution: 'AuthenticatedRole',
            // IdentityProvider field removed as it's not strictly needed for Type: 'Token'
          },
      },
    });

    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      'IdentityPoolRoleAttachment',
      {
        identityPoolId: this.identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
        },
        roleMappings: roleMappings.value,
      }
    );

    // Create Cognito domain if not already set
    this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `${props.envName}-inkstream`, // Change as needed for uniqueness
      },
    });
  }
}
