import { EventEmitter } from 'events';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';

export interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface AuthState {
  isAuthenticated: boolean;
  email?: string;
  userId?: string;
  tokens?: AuthTokens;
}

/**
 * CognitoAuthService - Manages authentication with AWS Cognito
 *
 * Features:
 * - Sign up / Sign in / Sign out
 * - Auto token refresh before expiry (5 min buffer)
 * - Persists refresh token for seamless re-auth on app restart
 * - Emits events for state changes
 */
export class CognitoAuthService extends EventEmitter {
  private client: CognitoIdentityProviderClient;
  private clientId: string;
  private tokens: AuthTokens | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private email: string | null = null;
  private userId: string | null = null;

  constructor(options: { region: string; clientId: string }) {
    super();
    this.client = new CognitoIdentityProviderClient({ region: options.region });
    this.clientId = options.clientId;
  }

  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string): Promise<{ success: boolean; needsConfirmation: boolean; error?: string }> {
    try {
      const result = await this.client.send(new SignUpCommand({
        ClientId: this.clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }],
      }));

      return {
        success: true,
        needsConfirmation: !result.UserConfirmed,
      };
    } catch (err: any) {
      return { success: false, needsConfirmation: false, error: err.message ?? String(err) };
    }
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.send(new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: code,
      }));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? String(err) };
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.client.send(new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }));

      const auth = result.AuthenticationResult;
      if (!auth?.IdToken || !auth?.AccessToken || !auth?.RefreshToken) {
        return { success: false, error: 'Incomplete auth response' };
      }

      this.email = email;
      this.tokens = {
        idToken: auth.IdToken,
        accessToken: auth.AccessToken,
        refreshToken: auth.RefreshToken,
        expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
      };

      // Extract userId from IdToken payload
      try {
        const payload = JSON.parse(Buffer.from(auth.IdToken.split('.')[1], 'base64').toString());
        this.userId = payload.sub;
      } catch { /* non-critical */ }

      this.scheduleRefresh();
      this.emit('authenticated', this.getState());

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? String(err) };
    }
  }

  /**
   * Restore session from persisted tokens (app restart)
   */
  async restoreSession(tokens: AuthTokens, email: string): Promise<boolean> {
    this.email = email;
    this.tokens = tokens;

    // Extract userId
    try {
      const payload = JSON.parse(Buffer.from(tokens.idToken.split('.')[1], 'base64').toString());
      this.userId = payload.sub;
    } catch { /* non-critical */ }

    // Check if token is still valid
    if (Date.now() < tokens.expiresAt - 60000) {
      // Still valid, schedule refresh
      this.scheduleRefresh();
      this.emit('authenticated', this.getState());
      return true;
    }

    // Token expired — try refreshing
    const refreshed = await this.refreshTokens();
    if (refreshed) {
      this.emit('authenticated', this.getState());
      return true;
    }

    // Refresh failed — user needs to sign in again
    this.tokens = null;
    this.emit('auth-expired');
    return false;
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.tokens?.accessToken) {
      try {
        await this.client.send(new GlobalSignOutCommand({
          AccessToken: this.tokens.accessToken,
        }));
      } catch { /* best effort */ }
    }

    this.tokens = null;
    this.email = null;
    this.userId = null;
    this.emit('signed-out');
  }

  /**
   * Get current ID token (for API calls)
   * Auto-refreshes if near expiry
   */
  async getIdToken(): Promise<string | null> {
    if (!this.tokens) return null;

    // Refresh if within 5 min of expiry
    if (Date.now() > this.tokens.expiresAt - 5 * 60 * 1000) {
      await this.refreshTokens();
    }

    return this.tokens?.idToken ?? null;
  }

  /**
   * Get current auth state
   */
  getState(): AuthState {
    return {
      isAuthenticated: !!this.tokens && Date.now() < this.tokens.expiresAt,
      email: this.email ?? undefined,
      userId: this.userId ?? undefined,
      tokens: this.tokens ?? undefined,
    };
  }

  /**
   * Get tokens for persistence
   */
  getTokensForStorage(): { tokens: AuthTokens; email: string } | null {
    if (!this.tokens || !this.email) return null;
    return { tokens: this.tokens, email: this.email };
  }

  /**
   * Refresh tokens using the refresh token
   */
  private async refreshTokens(): Promise<boolean> {
    if (!this.tokens?.refreshToken) return false;

    try {
      const result = await this.client.send(new InitiateAuthCommand({
        ClientId: this.clientId,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: {
          REFRESH_TOKEN: this.tokens.refreshToken,
        },
      }));

      const auth = result.AuthenticationResult;
      if (!auth?.IdToken || !auth?.AccessToken) return false;

      this.tokens = {
        idToken: auth.IdToken,
        accessToken: auth.AccessToken,
        refreshToken: this.tokens.refreshToken, // Refresh token doesn't change
        expiresAt: Date.now() + (auth.ExpiresIn ?? 3600) * 1000,
      };

      this.scheduleRefresh();
      this.emit('token-refreshed', this.tokens);
      return true;
    } catch (err) {
      console.error('[Auth] Token refresh failed:', err);
      this.emit('auth-expired');
      return false;
    }
  }

  /**
   * Schedule automatic token refresh 5 minutes before expiry
   */
  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokens) return;

    const msUntilRefresh = Math.max(
      (this.tokens.expiresAt - Date.now()) - 5 * 60 * 1000,
      10000 // at least 10 seconds from now
    );

    this.refreshTimer = setTimeout(async () => {
      const success = await this.refreshTokens();
      if (!success) {
        this.emit('auth-expired');
      }
    }, msUntilRefresh);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
