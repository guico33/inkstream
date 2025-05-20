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
    await client.send(
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
  } catch (err: any) {
    console.error('Error creating test user:', err);
    process.exit(1);
  }
}
