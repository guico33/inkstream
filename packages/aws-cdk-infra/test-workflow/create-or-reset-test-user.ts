import 'dotenv/config';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const REGION = process.env.AWS_REGION;
const USER_POOL_ID = process.env.USER_POOL_ID;
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;

if (!REGION || !USER_POOL_ID || !USERNAME || !PASSWORD) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

// Initialize AWS SDK clients.
// The SDK will automatically use credentials from the environment:
// - For local development with SSO: Ensure your environment is configured (e.g., via AWS CLI login for SSO)
//   or that AWS_PROFILE in .env.test points to an SSO-configured profile.
// - For CI with OIDC: Ensure AWS_ROLE_ARN and AWS_WEB_IDENTITY_TOKEN_FILE are set.
const client = new CognitoIdentityProviderClient({ region: REGION });

export async function deleteUserIfExists() {
  console.log(`Deleting user ${USERNAME} if it exists...`);
  try {
    await client.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: USERNAME,
      })
    );
    await client.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: USERNAME,
      })
    );
    console.log(`Deleted existing user: ${USERNAME}`);
  } catch (err: any) {
    if (err.name === 'UserNotFoundException') {
      console.log(`User ${USERNAME} does not exist, nothing to delete.`);
      return;
    }
    throw err;
  }
}

export async function createTestUser() {
  try {
    console.log(`Creating test user ${USERNAME}...`);
    const createUserResponse = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: USERNAME,
        UserAttributes: [
          { Name: 'email', Value: USERNAME },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      })
    );
    console.log('Setting password for test user...');
    await client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: USERNAME,
        Password: PASSWORD,
        Permanent: true,
      })
    );
    console.log(`Created and set password for user: ${USERNAME}`);
    if (!createUserResponse.User?.Attributes) {
      throw new Error('User created but attributes not found.');
    }
    const subAttribute = createUserResponse.User.Attributes.find(
      (attr) => attr.Name === 'sub'
    );
    if (!subAttribute || !subAttribute.Value) {
      throw new Error('User created but sub attribute not found.');
    }
    console.log(`User sub: ${subAttribute.Value}`);
    return subAttribute.Value;
  } catch (err: any) {
    console.error('Error creating test user:', err);
    process.exit(1);
  }
}
