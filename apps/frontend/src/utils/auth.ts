import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from '@aws-amplify/auth/cognito';

interface CognitoConfig {
  userPoolId: string;
  userPoolWebClientId: string;
  identityPoolId: string;
  region?: string;
}

export function configureAmplify(config: CognitoConfig) {
  // Initialize Amplify
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolWebClientId,
        identityPoolId: config.identityPoolId,
        loginWith: {
          email: true,
        },
      },
    },
  });

  // Configure token provider
  cognitoUserPoolsTokenProvider.setKeyValueStorage({
    setItem: async (key: string, value: string): Promise<void> => {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, value);
      }
    },
    getItem: async (key: string): Promise<string | null> => {
      if (typeof window !== 'undefined') {
        return localStorage.getItem(key);
      }
      return null;
    },
    removeItem: async (key: string): Promise<void> => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
    },
    clear: async (): Promise<void> => {
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }
    },
  });
}
