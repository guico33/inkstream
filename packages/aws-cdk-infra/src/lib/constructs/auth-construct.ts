import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../../.env' });

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
          'https://your-domain.com/auth/callback', // Production (update as needed)
        ],
        logoutUrls: [
          'http://localhost:5174', // Local development
          'https://your-domain.com', // Production (update as needed)
        ],
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
    // This step is required because AWS CDK doesn't support configuring session tags directly yet.
    // Future improvement: Consider migrating to the L2 IdentityPool construct from aws-cdk-lib/aws-cognito-identitypool,
    // which supports configuring attribute mapping in code.

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
          `arn:aws:s3:::dev-inkstream-storage-${
            cdk.Stack.of(this).account
          }/users/\${aws:PrincipalTag/sub}/uploads/*`,
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
