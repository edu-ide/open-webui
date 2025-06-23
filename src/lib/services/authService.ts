/**
 * Authentication Service
 * 
 * Manages OAuth2 authentication flow and integrates with DCR OAuth2 client
 */

import { DCROAuth2Client } from './dcrOAuth2Client';
import { oauth2Helpers } from '$lib/stores/oauth2';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

export class AuthService {
	private static instance: AuthService;
	private oauthClient: DCROAuth2Client;
	private initPromise: Promise<boolean> | null = null;

	private constructor() {
		// Configure OAuth2 client
		const authServerUrl = import.meta.env.VITE_AUTH_SERVER_URL || 'https://auth.ugot.uk';
		const clientName = import.meta.env.VITE_CLIENT_NAME || 'AI Chat Client';
		const redirectUri = browser 
			? `${window.location.origin}/auth/callback`
			: 'http://localhost:5173/auth/callback';

		this.oauthClient = new DCROAuth2Client(
			authServerUrl,
			clientName,
			redirectUri
		);
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): AuthService {
		if (!AuthService.instance) {
			AuthService.instance = new AuthService();
		}
		return AuthService.instance;
	}

	/**
	 * Initialize authentication
	 */
	async initialize(): Promise<boolean> {
		// Prevent multiple initializations
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this._initialize();
		return this.initPromise;
	}

	private async _initialize(): Promise<boolean> {
		try {
			oauth2Helpers.setLoading(true);
			oauth2Helpers.clearError();

			// Initialize OAuth2 client
			const isAuthenticated = await this.oauthClient.initialize();

			if (isAuthenticated) {
				// Update stores with session info
				const session = this.oauthClient.getSession();
				if (session) {
					oauth2Helpers.setSession(session);
					oauth2Helpers.setClientRegistration(session.client_registration);
					
					// Set up token refresh timer
					this.setupTokenRefresh();
					
					return true;
				}
			}

			// Not authenticated but initialized
			oauth2Helpers.setAuthenticated(false);
			return false;

		} catch (error) {
			console.error('Authentication initialization failed:', error);
			oauth2Helpers.setError(error as Error);
			return false;
		} finally {
			oauth2Helpers.setLoading(false);
		}
	}

	/**
	 * Start login flow
	 */
	async login(): Promise<void> {
		try {
			oauth2Helpers.setAuthenticating(true);
			oauth2Helpers.clearError();

			// Get authorization URL
			const authUrl = await this.oauthClient.startAuthorization();

			// Redirect to authorization server
			if (browser) {
				window.location.href = authUrl;
			}
		} catch (error) {
			console.error('Login failed:', error);
			oauth2Helpers.setError(error as Error);
			oauth2Helpers.setAuthenticating(false);
			throw error;
		}
	}

	/**
	 * Handle OAuth2 callback
	 */
	async handleCallback(code: string, state: string): Promise<boolean> {
		try {
			oauth2Helpers.setAuthenticating(true);
			oauth2Helpers.clearError();

			// Exchange code for tokens
			const session = await this.oauthClient.handleCallback(code, state);

			// Update stores
			oauth2Helpers.setSession(session);
			oauth2Helpers.setClientRegistration(session.client_registration);

			// Set up token refresh
			this.setupTokenRefresh();

			return true;
		} catch (error) {
			console.error('Callback handling failed:', error);
			oauth2Helpers.setError(error as Error);
			return false;
		} finally {
			oauth2Helpers.setAuthenticating(false);
		}
	}

	/**
	 * Get valid access token
	 */
	async getAccessToken(): Promise<string> {
		try {
			return await this.oauthClient.getAccessToken();
		} catch (error) {
			// If refresh fails, user needs to re-authenticate
			oauth2Helpers.setAuthenticated(false);
			throw error;
		}
	}

	/**
	 * Make authenticated request
	 */
	async fetch(url: string, options?: RequestInit): Promise<Response> {
		try {
			return await this.oauthClient.makeAuthenticatedRequest(url, options);
		} catch (error) {
			// Check if it's an authentication error
			if (error instanceof Response && error.status === 401) {
				// Try to refresh token
				try {
					await this.getAccessToken(); // This will trigger refresh if needed
					// Retry request
					return await this.oauthClient.makeAuthenticatedRequest(url, options);
				} catch (refreshError) {
					// Refresh failed, need to re-authenticate
					oauth2Helpers.setAuthenticated(false);
					throw new Error('Authentication required');
				}
			}
			throw error;
		}
	}

	/**
	 * Logout
	 */
	async logout(): Promise<void> {
		try {
			oauth2Helpers.setLoading(true);

			// Clear any refresh timers
			this.clearTokenRefresh();

			// Logout from OAuth2 server
			await this.oauthClient.logout();

			// Clear stores
			oauth2Helpers.clearAll();

			// Redirect to home
			if (browser) {
				window.location.href = '/';
			}
		} catch (error) {
			console.error('Logout failed:', error);
			oauth2Helpers.setError(error as Error);
		} finally {
			oauth2Helpers.setLoading(false);
		}
	}

	/**
	 * Check if authenticated
	 */
	isAuthenticated(): boolean {
		return this.oauthClient.isAuthenticated();
	}

	/**
	 * Get user info
	 */
	getUserInfo() {
		return this.oauthClient.getUserInfo();
	}

	/**
	 * Set up automatic token refresh
	 */
	private tokenRefreshTimer: NodeJS.Timeout | null = null;

	private setupTokenRefresh(): void {
		this.clearTokenRefresh();

		const session = this.oauthClient.getSession();
		if (!session || !session.tokens.refresh_token) {
			return;
		}

		// Calculate when to refresh (5 minutes before expiry)
		const refreshTime = session.expires_at - Date.now() - 300000;
		
		if (refreshTime > 0) {
			this.tokenRefreshTimer = setTimeout(async () => {
				try {
					oauth2Helpers.setRefreshing(true);
					await this.getAccessToken(); // This will trigger refresh
					
					// Set up next refresh
					this.setupTokenRefresh();
				} catch (error) {
					console.error('Token refresh failed:', error);
					oauth2Helpers.setAuthenticated(false);
				} finally {
					oauth2Helpers.setRefreshing(false);
				}
			}, refreshTime);
		}
	}

	private clearTokenRefresh(): void {
		if (this.tokenRefreshTimer) {
			clearTimeout(this.tokenRefreshTimer);
			this.tokenRefreshTimer = null;
		}
	}

	/**
	 * Handle authentication errors
	 */
	handleAuthError(error: any): void {
		console.error('Authentication error:', error);
		
		// Clear authentication state
		oauth2Helpers.setAuthenticated(false);
		
		// Redirect to login if needed
		if (browser && !window.location.pathname.startsWith('/auth')) {
			window.location.href = '/auth/login';
		}
	}
}

// Export singleton instance
export const authService = AuthService.getInstance();