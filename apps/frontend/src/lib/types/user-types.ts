// apps/frontend/src/lib/types/user-types.ts
// Shared types for authentication and user info.
// The User interface matches the structure of the Cognito/Google ID token payload.
export interface User {
  sub: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
}
