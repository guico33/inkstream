#!/usr/bin/env ts-node
// Script to create a Cognito test user (if not exists) and authenticate, returning the ID token.
// Reads config from .env.test in the current directory.
import path from 'path';
import dotenv from 'dotenv';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

const REGION = process.env.AWS_REGION;
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.USER_POOL_WEB_CLIENT_ID;
const USERNAME = process.env.TEST_USERNAME;
const PASSWORD = process.env.TEST_PASSWORD;

if (!REGION || !USER_POOL_ID || !CLIENT_ID || !USERNAME || !PASSWORD) {
  console.error('Missing required environment variables in .env.test');
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: REGION });

async function ensureUserExists() {
  try {
    await client.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID!,
        Username: USERNAME!,
      })
    );
    // User exists
    return;
  } catch (err: any) {
    if (err.name === 'UserNotFoundException') {
      // Create user
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID!,
          Username: USERNAME!,
          UserAttributes: [
            { Name: 'email', Value: USERNAME! },
            { Name: 'email_verified', Value: 'true' },
          ],
          MessageAction: 'SUPPRESS', // Don't send invite email
        })
      );
      // Set password
      await client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID!,
          Username: USERNAME!,
          Password: PASSWORD!,
          Permanent: true,
        })
      );
      return;
    }
    throw err;
  }
}

async function authenticate() {
  const resp = await client.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID!,
      AuthParameters: {
        USERNAME: USERNAME!,
        PASSWORD: PASSWORD!,
      },
    })
  );
  return resp.AuthenticationResult?.IdToken;
}

(async () => {
  try {
    await ensureUserExists();
    const token = await authenticate();
    if (!token) {
      throw new Error('Authentication failed, no IdToken returned');
    }
    console.log(token);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
