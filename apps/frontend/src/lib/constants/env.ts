// apps/frontend/src/lib/constants/env.ts
// Centralized export of all environment variables for the frontend app.

// Simple existence check - nothing fancy
const requiredEnvVars = [
  'VITE_AWS_REGION',
  'VITE_S3_BUCKET',
  'VITE_COGNITO_IDENTITY_POOL_ID',
  'VITE_COGNITO_USER_POOL_ID',
  'VITE_COGNITO_DOMAIN',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_API_ENDPOINT_URL'
];

const missing = requiredEnvVars.filter(key => !import.meta.env[key]);
if (missing.length > 0) {
  console.error('Missing required environment variables:', missing);
  // Don't throw in production, just warn
}

export const ENV = {
  AWS_REGION: import.meta.env.VITE_AWS_REGION,
  S3_BUCKET: import.meta.env.VITE_S3_BUCKET,
  COGNITO_IDENTITY_POOL_ID: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
  COGNITO_USER_POOL_ID: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  COGNITO_DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN,
  COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID,
  API_ENDPOINT_URL: import.meta.env.VITE_API_ENDPOINT_URL,
};
