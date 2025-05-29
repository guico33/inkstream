// Centralized authentication service
// Handles all auth operations: login, logout, token management, storage

import type { User } from '../types/user-types';
import { ENV } from '../constants';

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface CognitoTokenResponse {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export class AuthError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.details = details;
  }
}

export class AuthService {
  private static instance: AuthService;
  private user: User | null = null;
  private tokens: AuthTokens | null = null;
  private listeners: Set<(user: User | null) => void> = new Set();

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private constructor() {
    this.loadFromStorage();
  }

  // Subscribe to auth state changes
  subscribe(listener: (user: User | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.user));
  }

  // Get current auth state
  getCurrentUser(): User | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.user !== null && this.isTokenValid();
  }

  // Generate login URL for Cognito Hosted UI
  getLoginUrl(): string {
    const params = new URLSearchParams({
      client_id: ENV.COGNITO_CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: window.location.origin + '/auth/callback',
      identity_provider: 'Google',
    });
    return `${ENV.COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
  }

  // Exchange OAuth code for tokens
  async exchangeCodeForTokens(code: string): Promise<void> {
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ENV.COGNITO_CLIENT_ID,
        code,
        redirect_uri: window.location.origin + '/auth/callback',
      });

      const response = await fetch(`${ENV.COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AuthError(
          'TOKEN_EXCHANGE_FAILED',
          'Failed to exchange code for tokens',
          errorText
        );
      }

      const data = await response.json();
      await this.processTokenResponse(data);
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  // Process token response and extract user info
  private async processTokenResponse(
    tokenData: CognitoTokenResponse
  ): Promise<void> {
    if (!tokenData.id_token) {
      throw new AuthError('MISSING_ID_TOKEN', 'No ID token in response');
    }

    const tokens: AuthTokens = {
      accessToken: tokenData.access_token,
      idToken: tokenData.id_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };

    const user = this.parseIdToken(tokens.idToken);

    this.tokens = tokens;
    this.user = user;
    this.saveToStorage();
    this.notifyListeners();
  }

  // Parse JWT ID token (with proper error handling)
  private parseIdToken(idToken: string): User {
    try {
      const [, payload] = idToken.split('.');
      if (!payload) {
        throw new Error('Invalid token format');
      }

      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      const parsed = JSON.parse(decoded);

      // Validate required fields
      if (!parsed.sub || !parsed.email) {
        throw new Error('Missing required user fields');
      }

      return {
        sub: parsed.sub,
        email: parsed.email,
        given_name: parsed.given_name,
        family_name: parsed.family_name,
        name: parsed.name,
        picture: parsed.picture,
      };
    } catch (error) {
      throw new AuthError(
        'TOKEN_PARSE_ERROR',
        'Failed to parse ID token',
        error
      );
    }
  }

  // Check if current token is valid
  private isTokenValid(): boolean {
    if (!this.tokens) return false;
    return Date.now() < this.tokens.expiresAt - 60000; // 1 minute buffer
  }

  // Refresh tokens if needed
  async refreshTokensIfNeeded(): Promise<void> {
    if (!this.tokens || this.isTokenValid()) return;

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ENV.COGNITO_CLIENT_ID,
        refresh_token: this.tokens.refreshToken,
      });

      const response = await fetch(`${ENV.COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!response.ok) {
        // Refresh failed, user needs to re-authenticate
        await this.signOut();
        throw new AuthError('REFRESH_FAILED', 'Token refresh failed');
      }

      const data = await response.json();
      await this.processTokenResponse(data);
    } catch (error) {
      this.handleAuthError(error);
      throw error;
    }
  }

  // Get current ID token (refreshing if needed)
  async getIdToken(): Promise<string | null> {
    if (!this.tokens) return null;

    await this.refreshTokensIfNeeded();
    return this.tokens?.idToken || null;
  }

  // Sign out user
  async signOut(): Promise<void> {
    try {
      // Clear local state first
      this.user = null;
      this.tokens = null;
      this.clearStorage();
      this.notifyListeners();

      // Redirect to Cognito logout
      const logoutUrl = `${ENV.COGNITO_DOMAIN}/logout?client_id=${ENV.COGNITO_CLIENT_ID}&logout_uri=${window.location.origin}`;
      window.location.href = logoutUrl;
    } catch (error) {
      this.handleAuthError(error);
    }
  }

  // Storage operations
  private saveToStorage(): void {
    if (this.user) {
      localStorage.setItem('inkstream_user', JSON.stringify(this.user));
    }
    if (this.tokens) {
      localStorage.setItem('inkstream_tokens', JSON.stringify(this.tokens));
    }
  }

  private loadFromStorage(): void {
    try {
      const userStr = localStorage.getItem('inkstream_user');
      const tokensStr = localStorage.getItem('inkstream_tokens');

      if (userStr) {
        this.user = JSON.parse(userStr);
      }
      if (tokensStr) {
        this.tokens = JSON.parse(tokensStr);
      }

      // Validate loaded tokens
      if (this.tokens && !this.isTokenValid()) {
        this.refreshTokensIfNeeded().catch(() => {
          // Silent fail, user will need to re-authenticate
          this.clearStorage();
        });
      }
    } catch (error) {
      console.warn('Failed to load auth state from storage:', error);
      this.clearStorage();
    }
  }

  private clearStorage(): void {
    localStorage.removeItem('inkstream_user');
    localStorage.removeItem('inkstream_tokens');
    // Clean up legacy storage keys
    localStorage.removeItem('user');
    localStorage.removeItem('id_token');
  }

  private handleAuthError(error: unknown): void {
    console.error('[AuthService] Error:', error);
    // Could integrate with error reporting service here
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
