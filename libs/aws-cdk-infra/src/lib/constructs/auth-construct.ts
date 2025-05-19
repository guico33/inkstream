import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * Properties for the AuthConstruct
 */
export interface AuthConstructProps {
  // Environment name used to prefix resource names
  envName: string;
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
          'http://localhost:3000', // Local development for Next.js
          'https://your-domain.com', // Replace with your production domain when ready
        ],
        logoutUrls: [
          'http://localhost:3000', // Local development for Next.js
          'https://your-domain.com', // Replace with your production domain when ready
        ],
      },
      preventUserExistenceErrors: true,
    });

    // Add Google as identity provider (requires setting up Google OAuth credentials)
    // Uncomment and configure when you have your Google OAuth credentials
    /*
    const provider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
      userPool: this.userPool,
      clientId: 'your-google-client-id',
      clientSecret: 'your-google-client-secret',
      scopes: ['profile', 'email', 'openid'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });
    
    // Ensure the provider is created before the user pool client
    this.userPoolClient.node.addDependency(provider);
    */

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
    });

    // Define permissions for authenticated users
    // This policy allows users to access only their own folder in the S3 bucket
    // The ${cognito-identity.amazonaws.com:sub} variable is replaced with the user's unique ID at runtime
    authenticatedRole.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [
          `arn:aws:s3:::dev-inkstream-storage-${
            cdk.Stack.of(this).account
          }/uploads/\${cognito-identity.amazonaws.com:sub}/*`,
        ],
      })
    );

    // Attach roles to identity pool
    // This connects the IAM roles to the identity pool so that authenticated users
    // get the correct permissions when accessing AWS resources
    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      'IdentityPoolRoleAttachment',
      {
        identityPoolId: this.identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
        },
      }
    );
  }
}
