// env.ts
// Centralized export of all environment variables for the frontend app.

export const ENV = {
  REGION: import.meta.env.VITE_AWS_REGION,
  BUCKET: import.meta.env.VITE_S3_BUCKET,
  IDENTITY_POOL_ID: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID,
  USER_POOL_ID: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  COGNITO_DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN,
  COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID,
};
