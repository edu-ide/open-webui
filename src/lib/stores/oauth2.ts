/**
 * OAuth2 Store Management
 * 
 * Svelte stores for managing OAuth2 authentication state
 */

import { writable, derived, type Writable } from 'svelte/store';
import type { 
	ClientRegistrationResponse, 
	OAuth2Session, 
	UserInfo,
	OAuthError 
} from '$lib/types/oauth2';

// Authentication state
export const oauth2Authenticated = writable(false);
export const oauth2Authenticating = writable(false);
export const oauth2Session: Writable<OAuth2Session | null> = writable(null);

// User information
export const oauth2User: Writable<UserInfo | null> = writable(null);

// Client registration
export const oauth2ClientRegistration: Writable<ClientRegistrationResponse | null> = writable(null);

// Error handling
export const oauth2Error: Writable<string | null> = writable(null);
export const oauth2LastError: Writable<{ timestamp: number; error: OAuthError | Error } | null> = writable(null);

// Loading states
export const oauth2Loading = writable(false);
export const oauth2Refreshing = writable(false);

// Derived stores
export const oauth2Status = derived(
	[oauth2Authenticated, oauth2Authenticating, oauth2Refreshing],
	([$authenticated, $authenticating, $refreshing]) => {
		if ($authenticating) return 'authenticating';
		if ($refreshing) return 'refreshing';
		if ($authenticated) return 'authenticated';
		return 'unauthenticated';
	}
);

export const oauth2TokenExpiry = derived(
	oauth2Session,
	($session) => {
		if (!$session) return null;
		return new Date($session.expires_at);
	}
);

export const oauth2TokenExpiresIn = derived(
	oauth2Session,
	($session) => {
		if (!$session) return null;
		const remaining = $session.expires_at - Date.now();
		return Math.max(0, Math.floor(remaining / 1000));
	}
);

// OAuth2 Store Helpers
export const oauth2Helpers = {
	/**
	 * Set authenticated state
	 */
	setAuthenticated(authenticated: boolean): void {
		oauth2Authenticated.set(authenticated);
		if (!authenticated) {
			oauth2Session.set(null);
			oauth2User.set(null);
		}
	},

	/**
	 * Set session
	 */
	setSession(session: OAuth2Session | null): void {
		oauth2Session.set(session);
		if (session) {
			oauth2Authenticated.set(true);
			oauth2User.set(session.user_info || null);
		} else {
			oauth2Authenticated.set(false);
			oauth2User.set(null);
		}
	},

	/**
	 * Set client registration
	 */
	setClientRegistration(registration: ClientRegistrationResponse | null): void {
		oauth2ClientRegistration.set(registration);
	},

	/**
	 * Set error
	 */
	setError(error: string | Error | OAuthError | null): void {
		if (!error) {
			oauth2Error.set(null);
			return;
		}

		let errorMessage: string;
		let errorObject: OAuthError | Error;

		if (typeof error === 'string') {
			errorMessage = error;
			errorObject = new Error(error);
		} else if ('error' in error) {
			// OAuthError
			errorMessage = error.error_description || error.error;
			errorObject = error;
		} else {
			// Error
			errorMessage = error.message;
			errorObject = error;
		}

		oauth2Error.set(errorMessage);
		oauth2LastError.set({
			timestamp: Date.now(),
			error: errorObject
		});
	},

	/**
	 * Clear error
	 */
	clearError(): void {
		oauth2Error.set(null);
	},

	/**
	 * Set loading state
	 */
	setLoading(loading: boolean): void {
		oauth2Loading.set(loading);
	},

	/**
	 * Set authenticating state
	 */
	setAuthenticating(authenticating: boolean): void {
		oauth2Authenticating.set(authenticating);
	},

	/**
	 * Set refreshing state
	 */
	setRefreshing(refreshing: boolean): void {
		oauth2Refreshing.set(refreshing);
	},

	/**
	 * Clear all OAuth2 data
	 */
	clearAll(): void {
		oauth2Authenticated.set(false);
		oauth2Authenticating.set(false);
		oauth2Session.set(null);
		oauth2User.set(null);
		oauth2ClientRegistration.set(null);
		oauth2Error.set(null);
		oauth2LastError.set(null);
		oauth2Loading.set(false);
		oauth2Refreshing.set(false);
	},

	/**
	 * Update token expiry
	 */
	updateTokenExpiry(expiresIn: number): void {
		oauth2Session.update(session => {
			if (session) {
				session.expires_at = Date.now() + expiresIn * 1000;
			}
			return session;
		});
	}
};