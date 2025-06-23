/**
 * DCR OAuth2 Client Implementation
 * 
 * Complete OAuth2 client with Dynamic Client Registration support
 * Replaces the legacy token-based authentication
 */

import type {
	ClientRegistrationRequest,
	ClientRegistrationResponse,
	TokenRequest,
	TokenResponse,
	OAuthError,
	AuthorizationRequest,
	PKCEChallenge,
	OAuthDiscoveryDocument,
	UserInfo,
	OAuth2Session,
	OAuth2State,
	TokenIntrospectionResponse
} from '$lib/types/oauth2';

export class DCROAuth2Client {
	private discoveryDocument: OAuthDiscoveryDocument | null = null;
	private session: OAuth2Session | null = null;
	private pendingStates: Map<string, OAuth2State> = new Map();
	
	constructor(
		private authServerUrl: string,
		private clientName: string,
		private redirectUri: string
	) {
		// Load existing session if available
		this.loadSession();
	}

	/**
	 * Initialize OAuth2 client
	 */
	async initialize(): Promise<boolean> {
		try {
			// Discover OAuth2 endpoints
			await this.discover();
			
			// Check if we have a valid session
			if (this.session) {
				// Validate tokens
				const isValid = await this.validateSession();
				if (isValid) {
					return true;
				}
				
				// Try to refresh if expired
				if (this.session.tokens.refresh_token) {
					try {
						await this.refreshTokens();
						return true;
					} catch (error) {
						console.warn('Failed to refresh tokens:', error);
					}
				}
			}
			
			// Check if we have stored client registration
			const storedRegistration = this.loadClientRegistration();
			if (!storedRegistration) {
				// Register new client
				await this.registerClient();
			}
			
			return false; // Requires authentication
		} catch (error) {
			console.error('OAuth2 initialization failed:', error);
			throw error;
		}
	}

	/**
	 * Discover OAuth2 endpoints
	 */
	private async discover(): Promise<void> {
		const wellKnownUrl = `${this.authServerUrl}/.well-known/openid-configuration`;
		
		try {
			const response = await fetch(wellKnownUrl);
			if (!response.ok) {
				throw new Error(`Discovery failed: ${response.statusText}`);
			}
			
			this.discoveryDocument = await response.json();
			console.log('OAuth2 discovery successful');
		} catch (error) {
			// Fallback to manual configuration
			console.warn('Discovery failed, using fallback configuration');
			this.discoveryDocument = {
				issuer: this.authServerUrl,
				authorization_endpoint: `${this.authServerUrl}/authorize`,
				token_endpoint: `${this.authServerUrl}/token`,
				registration_endpoint: `${this.authServerUrl}/register`,
				userinfo_endpoint: `${this.authServerUrl}/userinfo`,
				revocation_endpoint: `${this.authServerUrl}/revoke`,
				introspection_endpoint: `${this.authServerUrl}/introspect`,
				grant_types_supported: ['authorization_code', 'refresh_token'],
				response_types_supported: ['code'],
				code_challenge_methods_supported: ['S256']
			};
		}
	}

	/**
	 * Register OAuth2 client dynamically
	 */
	async registerClient(): Promise<ClientRegistrationResponse> {
		if (!this.discoveryDocument?.registration_endpoint) {
			throw new Error('Registration endpoint not available');
		}

		const registrationRequest: ClientRegistrationRequest = {
			client_name: this.clientName,
			client_uri: window.location.origin,
			redirect_uris: [this.redirectUri],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			scope: 'openid profile email offline_access',
			token_endpoint_auth_method: 'client_secret_basic',
			software_id: 'ai-chat-client',
			software_version: '1.0.0'
		};

		const response = await fetch(this.discoveryDocument.registration_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json'
			},
			body: JSON.stringify(registrationRequest)
		});

		if (!response.ok) {
			const error: OAuthError = await response.json();
			throw new Error(`Client registration failed: ${error.error_description || error.error}`);
		}

		const registration = await response.json();
		this.saveClientRegistration(registration);
		return registration;
	}

	/**
	 * Start OAuth2 authorization flow
	 */
	async startAuthorization(): Promise<string> {
		if (!this.discoveryDocument?.authorization_endpoint) {
			throw new Error('Authorization endpoint not available');
		}

		const registration = this.loadClientRegistration();
		if (!registration) {
			throw new Error('Client not registered');
		}

		// Generate PKCE challenge
		const pkce = this.generatePKCEChallenge();
		
		// Generate state for CSRF protection
		const state = this.generateState();
		
		// Store state with PKCE verifier
		const stateData: OAuth2State = {
			value: state,
			created_at: Date.now(),
			redirect_uri: this.redirectUri,
			code_verifier: pkce.code_verifier
		};
		this.pendingStates.set(state, stateData);
		
		// Clean old states
		this.cleanExpiredStates();

		// Build authorization URL
		const params: AuthorizationRequest = {
			response_type: 'code',
			client_id: registration.client_id,
			redirect_uri: this.redirectUri,
			scope: 'openid profile email offline_access',
			state,
			code_challenge: pkce.code_challenge,
			code_challenge_method: pkce.code_challenge_method,
			nonce: this.generateNonce()
		};

		const url = new URL(this.discoveryDocument.authorization_endpoint);
		Object.entries(params).forEach(([key, value]) => {
			if (value) url.searchParams.append(key, value);
		});

		return url.toString();
	}

	/**
	 * Handle OAuth2 callback
	 */
	async handleCallback(code: string, state: string): Promise<OAuth2Session> {
		// Verify state
		const stateData = this.pendingStates.get(state);
		if (!stateData) {
			throw new Error('Invalid state parameter');
		}
		
		// Check state expiry (5 minutes)
		if (Date.now() - stateData.created_at > 300000) {
			this.pendingStates.delete(state);
			throw new Error('State expired');
		}

		const registration = this.loadClientRegistration();
		if (!registration) {
			throw new Error('Client not registered');
		}

		// Exchange code for tokens
		const tokenRequest: TokenRequest = {
			grant_type: 'authorization_code',
			client_id: registration.client_id,
			client_secret: registration.client_secret,
			code,
			redirect_uri: stateData.redirect_uri,
			code_verifier: stateData.code_verifier
		};

		const tokens = await this.requestTokens(tokenRequest);
		
		// Get user info
		const userInfo = await this.getUserInfo(tokens.access_token);
		
		// Create session
		this.session = {
			client_registration: registration,
			tokens,
			user_info: userInfo,
			expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
			refresh_expires_at: tokens.refresh_token 
				? Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
				: undefined
		};

		// Save session
		this.saveSession();
		
		// Clean up state
		this.pendingStates.delete(state);
		
		return this.session;
	}

	/**
	 * Get valid access token
	 */
	async getAccessToken(): Promise<string> {
		if (!this.session) {
			throw new Error('Not authenticated');
		}

		// Check if token is expired (with 1 minute buffer)
		if (Date.now() > this.session.expires_at - 60000) {
			await this.refreshTokens();
		}

		return this.session.tokens.access_token;
	}

	/**
	 * Refresh access token
	 */
	private async refreshTokens(): Promise<void> {
		if (!this.session?.tokens.refresh_token) {
			throw new Error('No refresh token available');
		}

		const tokenRequest: TokenRequest = {
			grant_type: 'refresh_token',
			client_id: this.session.client_registration.client_id,
			client_secret: this.session.client_registration.client_secret,
			refresh_token: this.session.tokens.refresh_token
		};

		const tokens = await this.requestTokens(tokenRequest);
		
		// Update session
		this.session.tokens = tokens;
		this.session.expires_at = Date.now() + (tokens.expires_in || 3600) * 1000;
		
		// Save updated session
		this.saveSession();
	}

	/**
	 * Request tokens from token endpoint
	 */
	private async requestTokens(request: TokenRequest): Promise<TokenResponse> {
		if (!this.discoveryDocument?.token_endpoint) {
			throw new Error('Token endpoint not available');
		}

		const headers: HeadersInit = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Accept': 'application/json'
		};

		// Add client authentication
		if (request.client_secret) {
			const credentials = btoa(`${request.client_id}:${request.client_secret}`);
			headers['Authorization'] = `Basic ${credentials}`;
		}

		const body = new URLSearchParams();
		Object.entries(request).forEach(([key, value]) => {
			if (value && key !== 'client_secret') {
				body.append(key, value);
			}
		});

		const response = await fetch(this.discoveryDocument.token_endpoint, {
			method: 'POST',
			headers,
			body
		});

		if (!response.ok) {
			const error: OAuthError = await response.json();
			throw new Error(`Token request failed: ${error.error_description || error.error}`);
		}

		return await response.json();
	}

	/**
	 * Get user info
	 */
	private async getUserInfo(accessToken: string): Promise<UserInfo | undefined> {
		if (!this.discoveryDocument?.userinfo_endpoint) {
			return undefined;
		}

		try {
			const response = await fetch(this.discoveryDocument.userinfo_endpoint, {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				console.warn('Failed to get user info');
				return undefined;
			}

			return await response.json();
		} catch (error) {
			console.warn('User info request failed:', error);
			return undefined;
		}
	}

	/**
	 * Make authenticated request
	 */
	async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
		const token = await this.getAccessToken();
		
		const headers = new Headers(options.headers);
		headers.set('Authorization', `Bearer ${token}`);
		
		return fetch(url, { ...options, headers });
	}

	/**
	 * Logout
	 */
	async logout(): Promise<void> {
		// Revoke tokens if endpoint available
		if (this.session?.tokens.access_token && this.discoveryDocument?.revocation_endpoint) {
			try {
				await this.revokeToken(this.session.tokens.access_token);
			} catch (error) {
				console.warn('Token revocation failed:', error);
			}
		}

		// Clear session
		this.session = null;
		this.clearStoredData();
	}

	/**
	 * Revoke token
	 */
	private async revokeToken(token: string): Promise<void> {
		if (!this.discoveryDocument?.revocation_endpoint) {
			return;
		}

		const registration = this.loadClientRegistration();
		if (!registration) return;

		const body = new URLSearchParams({
			token,
			token_type_hint: 'access_token',
			client_id: registration.client_id,
			client_secret: registration.client_secret || ''
		});

		await fetch(this.discoveryDocument.revocation_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body
		});
	}

	/**
	 * Validate current session
	 */
	private async validateSession(): Promise<boolean> {
		if (!this.session) return false;

		// Check expiry
		if (Date.now() > this.session.expires_at) {
			return false;
		}

		// Optionally introspect token
		if (this.discoveryDocument?.introspection_endpoint) {
			try {
				const introspection = await this.introspectToken(this.session.tokens.access_token);
				return introspection.active;
			} catch (error) {
				console.warn('Token introspection failed:', error);
			}
		}

		return true;
	}

	/**
	 * Introspect token
	 */
	private async introspectToken(token: string): Promise<TokenIntrospectionResponse> {
		if (!this.discoveryDocument?.introspection_endpoint) {
			throw new Error('Introspection endpoint not available');
		}

		const registration = this.loadClientRegistration();
		if (!registration) {
			throw new Error('Client not registered');
		}

		const body = new URLSearchParams({
			token,
			token_type_hint: 'access_token',
			client_id: registration.client_id,
			client_secret: registration.client_secret || ''
		});

		const response = await fetch(this.discoveryDocument.introspection_endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json'
			},
			body
		});

		if (!response.ok) {
			throw new Error('Introspection failed');
		}

		return await response.json();
	}

	/**
	 * Generate PKCE challenge
	 */
	private generatePKCEChallenge(): PKCEChallenge {
		const verifier = this.generateRandomString(128);
		const challenge = this.base64UrlEncode(
			crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
		);

		return {
			code_verifier: verifier,
			code_challenge: challenge,
			code_challenge_method: 'S256'
		};
	}

	/**
	 * Generate random string
	 */
	private generateRandomString(length: number): string {
		const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
		const values = crypto.getRandomValues(new Uint8Array(length));
		return Array.from(values, v => charset[v % charset.length]).join('');
	}

	/**
	 * Base64 URL encode
	 */
	private base64UrlEncode(buffer: ArrayBuffer | Promise<ArrayBuffer>): string {
		const encode = (buf: ArrayBuffer) => {
			const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
			return base64
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=/g, '');
		};

		if (buffer instanceof Promise) {
			return buffer.then(encode) as any;
		}
		return encode(buffer);
	}

	/**
	 * Generate state
	 */
	private generateState(): string {
		return this.generateRandomString(32);
	}

	/**
	 * Generate nonce
	 */
	private generateNonce(): string {
		return this.generateRandomString(32);
	}

	/**
	 * Clean expired states
	 */
	private cleanExpiredStates(): void {
		const now = Date.now();
		const expired: string[] = [];
		
		this.pendingStates.forEach((state, key) => {
			if (now - state.created_at > 300000) { // 5 minutes
				expired.push(key);
			}
		});
		
		expired.forEach(key => this.pendingStates.delete(key));
	}

	/**
	 * Storage methods
	 */
	
	private saveClientRegistration(registration: ClientRegistrationResponse): void {
		localStorage.setItem('oauth2_client_registration', JSON.stringify(registration));
	}

	private loadClientRegistration(): ClientRegistrationResponse | null {
		const stored = localStorage.getItem('oauth2_client_registration');
		return stored ? JSON.parse(stored) : null;
	}

	private saveSession(): void {
		if (this.session) {
			// Don't store sensitive tokens in localStorage in production
			// Use secure httpOnly cookies or session storage
			sessionStorage.setItem('oauth2_session', JSON.stringify(this.session));
		}
	}

	private loadSession(): void {
		const stored = sessionStorage.getItem('oauth2_session');
		if (stored) {
			this.session = JSON.parse(stored);
		}
	}

	private clearStoredData(): void {
		localStorage.removeItem('oauth2_client_registration');
		sessionStorage.removeItem('oauth2_session');
	}

	/**
	 * Get current session info
	 */
	getSession(): OAuth2Session | null {
		return this.session;
	}

	/**
	 * Check if authenticated
	 */
	isAuthenticated(): boolean {
		return !!this.session && Date.now() < this.session.expires_at;
	}

	/**
	 * Get user info
	 */
	getUserInfo(): UserInfo | undefined {
		return this.session?.user_info;
	}
}