# Inkstream Authentication Flow

This document details the authentication flow used in the Inkstream application, which uses Amazon Cognito with Google OAuth for user authentication.

## Overview

The authentication system uses:
- **Amazon Cognito User Pool** - Manages user accounts and authentication
- **Google OAuth 2.0** - Primary identity provider
- **JWT tokens** - For secure API access
- **React Context** - For client-side state management

## Architecture Components

### Backend (AWS CDK)
- **Cognito User Pool** (`eu-west-3_3w2Im0QFN`) - Central user directory
- **Cognito User Pool Client** (`5i4ajimnhchqns254ivf57lqlp`) - OAuth application configuration
- **Cognito Identity Pool** (`eu-west-3:91745367-3878-4c18-840b-cf1730631c75`) - AWS credentials for authenticated users
- **Google Identity Provider** - Integrated with Cognito for OAuth

### Frontend
- **AuthService** - Centralized authentication logic
- **AuthContext** - React context for auth state management
- **AuthCallback** - Handles OAuth callback processing
- **Protected Routes** - Route-level authentication guards

## Authentication Flow Steps

### 1. Initial Page Load
```
User visits app → Check localStorage for existing tokens → 
If valid tokens exist: Auto-login → 
If no/invalid tokens: Redirect to login
```

### 2. Login Initiation
```
User clicks "Sign in with Google" → 
LoginPage redirects to Cognito Hosted UI → 
Cognito redirects to Google OAuth
```

**Generated URL:**
```
https://dev-inkstream.auth.eu-west-3.amazoncognito.com/oauth2/authorize?
  client_id=5i4ajimnhchqns254ivf57lqlp&
  response_type=code&
  scope=openid+email+profile&
  redirect_uri=http://localhost:5174/auth/callback&
  identity_provider=Google
```

### 3. Google Authentication
```
User authenticates with Google → 
Google returns authorization code to Cognito → 
Cognito redirects to app callback URL with code
```

**Callback URL:**
```
http://localhost:5174/auth/callback?code=561794ec-b67b-4b09-a4dc-43400708df33
```

### 4. Token Exchange
```
AuthCallback component receives code → 
Exchange authorization code for JWT tokens → 
Store tokens and user info → 
Redirect to home page
```

**Token Exchange Request:**
```typescript
POST https://dev-inkstream.auth.eu-west-3.amazoncognito.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
client_id=5i4ajimnhchqns254ivf57lqlp&
code=561794ec-b67b-4b09-a4dc-43400708df33&
redirect_uri=http://localhost:5174/auth/callback
```

**Token Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJjdHkiOiJKV1QiLCJlbmMi...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### 5. User Session Management
```
Parse ID token for user info → 
Store in localStorage and React context → 
Set up automatic token refresh → 
Enable protected routes
```

## File Structure

```
src/
├── lib/
│   ├── auth/
│   │   └── auth-service.ts          # Core authentication logic
│   ├── contexts/
│   │   └── auth-context.tsx         # React context provider
│   └── constants/
│       └── index.ts                 # Environment variables
├── components/
│   ├── AuthCallback.tsx             # OAuth callback handler
│   ├── LoginPage.tsx                # Login initiation
│   ├── ProtectedRoute.tsx           # Route guards
│   └── Header.tsx                   # Auth UI components
└── AppRoutes.tsx                    # Route configuration
```

## Key Components

### AuthService
**Location:** `src/lib/auth/auth-service.ts`

Singleton service that handles:
- OAuth URL generation
- Token exchange and refresh
- User session management
- Local storage operations
- Error handling

**Key Methods:**
- `getLoginUrl()` - Generates Cognito OAuth URL
- `exchangeCodeForTokens(code)` - Exchanges auth code for JWT tokens
- `getIdToken()` - Returns current ID token (with auto-refresh)
- `signOut()` - Clears session and redirects to logout

### AuthContext
**Location:** `src/lib/contexts/auth-context.tsx`

React context that provides:
- Current user state
- Authentication status
- Auth methods (login, logout, token exchange)
- Loading states

**Exposed Interface:**
```typescript
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  getLoginUrl: () => string;
  exchangeCodeForTokens: (code: string) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}
```

### AuthCallback Component
**Location:** `src/components/AuthCallback.tsx`

Handles OAuth callback processing:
- Extracts authorization code from URL
- Calls token exchange
- Handles errors and redirects
- Prevents double execution (React StrictMode)

**Flow:**
1. Check for OAuth errors in URL params
2. Extract authorization code
3. Exchange code for tokens via AuthService
4. Redirect to home page on success
5. Show error and redirect to login on failure

### Protected Routes
**Location:** `src/components/ProtectedRoute.tsx`

Route wrapper that:
- Checks authentication status
- Redirects to login if not authenticated
- Allows access to protected content
- Handles loading states

## Token Management

### Token Types
1. **ID Token** - Contains user identity claims (email, name, etc.)
2. **Access Token** - Used for API authorization
3. **Refresh Token** - Used to obtain new access/ID tokens

### Token Storage
- Stored in `localStorage` with keys:
  - `inkstream_user` - User profile data
  - `inkstream_tokens` - JWT tokens and expiration

### Token Refresh
- Automatic refresh when tokens expire (60-second buffer)
- Uses refresh token to obtain new access/ID tokens
- Falls back to re-authentication if refresh fails

## Environment Configuration

### Frontend (.env)
```bash
VITE_COGNITO_DOMAIN=https://dev-inkstream.auth.eu-west-3.amazoncognito.com
VITE_COGNITO_CLIENT_ID=5i4ajimnhchqns254ivf57lqlp
VITE_COGNITO_USER_POOL_ID=eu-west-3_3w2Im0QFN
VITE_COGNITO_IDENTITY_POOL_ID=eu-west-3:91745367-3878-4c18-840b-cf1730631c75
VITE_AWS_REGION=eu-west-3
```

### Backend (CDK)
```bash
GOOGLE_CLIENT_ID=151261073953-6a60al92rdl5ea28c9f0p9ppgm5br9to.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET_SECRET_ARN=arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/google/clientsecret-FkFt1s
```

## Common Issues & Solutions

### Issue: "400 Bad Request" during token exchange
**Cause:** Authorization code used multiple times (React StrictMode)
**Solution:** `useRef` guard in AuthCallback to prevent double execution

### Issue: User sees error briefly before successful login
**Cause:** Race condition between error display and token processing
**Solution:** Improved state management and loading indicators

### Issue: Redirect URI mismatch
**Cause:** Different redirect URIs in authorization vs token exchange
**Solution:** Ensure consistent `redirect_uri` parameter

### Issue: Token refresh fails
**Cause:** Refresh token expired or invalid
**Solution:** Automatic fallback to re-authentication flow

## Security Considerations

1. **HTTPS Required** - OAuth requires secure connections in production
2. **Token Expiration** - ID tokens expire after 1 hour
3. **Refresh Token Rotation** - Cognito can rotate refresh tokens
4. **CORS Configuration** - Cognito domain must allow frontend origin
5. **Client Secret** - Stored securely in AWS Secrets Manager

## Debugging

### Enable Debug Logging
The AuthService includes console logging for:
- Token exchange requests
- Authentication state changes
- Error conditions
- Component lifecycle events

### Common Debug Points
1. Check browser dev tools for OAuth redirects
2. Verify environment variables are loaded
3. Inspect localStorage for token storage
4. Monitor network tab for Cognito API calls
5. Check React StrictMode double execution

## Production Deployment

### Required Changes
1. Update callback URLs in Cognito configuration
2. Add production domain to CORS settings
3. Use HTTPS for all OAuth redirects
4. Configure proper CSP headers
5. Set secure cookie flags for token storage

### Monitoring
- Track authentication success/failure rates
- Monitor token refresh patterns
- Alert on authentication errors
- Track user session duration
