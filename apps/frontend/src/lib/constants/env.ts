// apps/frontend/src/lib/constants/env.ts
// Centralized export of all environment variables for the frontend app.

export const ENV = {
  AWS_REGION: import.meta.env.VITE_AWS_REGION,
  S3_BUCKET: import.meta.env.VITE_S3_BUCKET,
  COGNITO_IDENTITY_POOL_ID: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
  COGNITO_USER_POOL_ID: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  COGNITO_DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN,
  COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID,
  API_ENDPOINT_URL: import.meta.env.VITE_API_ENDPOINT_URL,
};
