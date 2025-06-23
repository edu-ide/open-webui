/**
 * OAuth2 and DCR (Dynamic Client Registration) Type Definitions
 * 
 * Types for OAuth2 authentication flow with dynamic client registration
 */

// Dynamic Client Registration types
export interface ClientRegistrationRequest {
	client_name: string;
	client_uri?: string;
	logo_uri?: string;
	scope?: string;
	redirect_uris: string[];
	token_endpoint_auth_method?: string;
	grant_types?: string[];
	response_types?: string[];
	software_id?: string;
	software_version?: string;
	contacts?: string[];
	tos_uri?: string;
	policy_uri?: string;
}

export interface ClientRegistrationResponse {
	client_id: string;
	client_secret?: string;
	client_id_issued_at?: number;
	client_secret_expires_at?: number;
	registration_access_token?: string;
	registration_client_uri?: string;
	grant_types: string[];
	response_types: string[];
	redirect_uris: string[];
	scope?: string;
	token_endpoint_auth_method?: string;
	software_id?: string;
	software_version?: string;
}

// OAuth2 token types
export interface TokenRequest {
	grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
	client_id: string;
	client_secret?: string;
	code?: string;
	redirect_uri?: string;
	refresh_token?: string;
	scope?: string;
	code_verifier?: string; // For PKCE
}

export interface TokenResponse {
	access_token: string;
	token_type: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	id_token?: string; // For OpenID Connect
}

// OAuth2 error response
export interface OAuthError {
	error: string;
	error_description?: string;
	error_uri?: string;
}

// Authorization request parameters
export interface AuthorizationRequest {
	response_type: string;
	client_id: string;
	redirect_uri: string;
	scope?: string;
	state?: string;
	code_challenge?: string; // For PKCE
	code_challenge_method?: string; // For PKCE
	nonce?: string; // For OpenID Connect
}

// PKCE (Proof Key for Code Exchange) types
export interface PKCEChallenge {
	code_verifier: string;
	code_challenge: string;
	code_challenge_method: 'S256' | 'plain';
}

// OAuth2 configuration discovery
export interface OAuthDiscoveryDocument {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	userinfo_endpoint?: string;
	jwks_uri?: string;
	registration_endpoint?: string;
	scopes_supported?: string[];
	response_types_supported?: string[];
	grant_types_supported?: string[];
	token_endpoint_auth_methods_supported?: string[];
	code_challenge_methods_supported?: string[];
	revocation_endpoint?: string;
	introspection_endpoint?: string;
}

// User info response (OpenID Connect)
export interface UserInfo {
	sub: string; // Subject identifier
	name?: string;
	preferred_username?: string;
	email?: string;
	email_verified?: boolean;
	picture?: string;
	locale?: string;
	updated_at?: number;
	[key: string]: any; // Additional claims
}

// OAuth2 session types
export interface OAuth2Session {
	client_registration: ClientRegistrationResponse;
	tokens: TokenResponse;
	user_info?: UserInfo;
	expires_at: number;
	refresh_expires_at?: number;
}

// OAuth2 state for CSRF protection
export interface OAuth2State {
	value: string;
	created_at: number;
	redirect_uri: string;
	code_verifier?: string; // For PKCE
}

// Token introspection response
export interface TokenIntrospectionResponse {
	active: boolean;
	scope?: string;
	client_id?: string;
	username?: string;
	token_type?: string;
	exp?: number;
	iat?: number;
	nbf?: number;
	sub?: string;
	aud?: string | string[];
	iss?: string;
	jti?: string;
}