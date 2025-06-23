/**
 * Enhanced AI Server API Client with OAuth2 Support
 * 
 * Provides integration with the AI Server (https://ai.ugot.uk)
 * Supporting OAuth2 authentication alongside token-based auth
 */

import { authService } from '$lib/services/authService';
import { get } from 'svelte/store';
import { oauth2Authenticated } from '$lib/stores/oauth2';
import type { ChatRequest, ChatResponse, ModelStatus, AIModel } from './index';

// AI Server API Base URL
export const AI_SERVER_BASE_URL = 'https://ai.ugot.uk/api/v2';

/**
 * Get authentication headers
 */
async function getAuthHeaders(token?: string): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		'Accept': 'application/json',
		'Content-Type': 'application/json'
	};

	// Check if OAuth2 is authenticated
	if (get(oauth2Authenticated)) {
		try {
			const accessToken = await authService.getAccessToken();
			headers['Authorization'] = `Bearer ${accessToken}`;
		} catch (error) {
			console.error('Failed to get OAuth2 token:', error);
			// Fallback to provided token if OAuth2 fails
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}
		}
	} else if (token) {
		// Use provided token if OAuth2 not available
		headers['Authorization'] = `Bearer ${token}`;
	}

	return headers;
}

/**
 * Send a chat message to AI Server
 */
export const sendChatMessage = async (
	token: string,
	request: ChatRequest
): Promise<ChatResponse> => {
	// Use authService if OAuth2 is available
	if (get(oauth2Authenticated)) {
		const res = await authService.fetch(`${AI_SERVER_BASE_URL}/chat`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(request)
		});

		if (!res.ok) {
			const errorData = await res.json();
			throw errorData;
		}

		return res.json();
	}

	// Fallback to token-based auth
	let error = null;
	const headers = await getAuthHeaders(token);

	const res = await fetch(`${AI_SERVER_BASE_URL}/chat`, {
		method: 'POST',
		headers,
		body: JSON.stringify(request)
	})
		.then(async (res) => {
			if (!res.ok) {
				const errorData = await res.json();
				throw errorData;
			}
			return res.json();
		})
		.catch((err) => {
			error = err;
			console.error('AI Chat API Error:', err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

/**
 * Send a streaming chat message to AI Server
 */
export const sendStreamingChatMessage = async (
	token: string,
	request: ChatRequest
): Promise<ReadableStream> => {
	// Use authService if OAuth2 is available
	if (get(oauth2Authenticated)) {
		const response = await authService.fetch(`${AI_SERVER_BASE_URL}/chat/stream`, {
			method: 'POST',
			headers: {
				'Accept': 'text/event-stream',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(request)
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw errorData;
		}

		return response.body!;
	}

	// Fallback to token-based auth
	const headers = await getAuthHeaders(token);
	headers['Accept'] = 'text/event-stream';

	const response = await fetch(`${AI_SERVER_BASE_URL}/chat/stream`, {
		method: 'POST',
		headers,
		body: JSON.stringify(request)
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw errorData;
	}

	return response.body!;
};

/**
 * Get available AI models
 */
export const getAvailableModels = async (token: string): Promise<AIModel[]> => {
	// Use authService if OAuth2 is available
	if (get(oauth2Authenticated)) {
		const res = await authService.fetch(`${AI_SERVER_BASE_URL}/models`, {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});

		if (!res.ok) {
			const errorData = await res.json();
			throw errorData;
		}

		const data = await res.json();
		return data.models || [];
	}

	// Fallback to token-based auth
	let error = null;
	const headers = await getAuthHeaders(token);

	const res = await fetch(`${AI_SERVER_BASE_URL}/models`, {
		method: 'GET',
		headers
	})
		.then(async (res) => {
			if (!res.ok) {
				const errorData = await res.json();
				throw errorData;
			}
			return res.json();
		})
		.catch((err) => {
			error = err;
			console.error('AI Models API Error:', err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res.models || [];
};

/**
 * Get AI models status
 */
export const getModelsStatus = async (token: string): Promise<ModelStatus> => {
	// Use authService if OAuth2 is available
	if (get(oauth2Authenticated)) {
		const res = await authService.fetch(`${AI_SERVER_BASE_URL}/models/status`, {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});

		if (!res.ok) {
			const errorData = await res.json();
			throw errorData;
		}

		return res.json();
	}

	// Fallback to token-based auth
	let error = null;
	const headers = await getAuthHeaders(token);

	const res = await fetch(`${AI_SERVER_BASE_URL}/models/status`, {
		method: 'GET',
		headers
	})
		.then(async (res) => {
			if (!res.ok) {
				const errorData = await res.json();
				throw errorData;
			}
			return res.json();
		})
		.catch((err) => {
			error = err;
			console.error('AI Models Status API Error:', err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

/**
 * Test AI Server connectivity
 */
export const testConnectivity = async (): Promise<boolean> => {
	try {
		const response = await fetch(`${AI_SERVER_BASE_URL}/test/connectivity`, {
			method: 'GET',
			headers: {
				Accept: 'application/json'
			}
		});
		
		return response.ok;
	} catch (error) {
		console.error('AI Server connectivity test failed:', error);
		return false;
	}
};

/**
 * Health check for AI Server
 */
export const healthCheck = async (): Promise<{
	status: string;
	service: string;
	models: ModelStatus;
	timestamp: number;
}> => {
	try {
		const response = await fetch('https://ai.ugot.uk/health', {
			method: 'GET',
			headers: {
				Accept: 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error(`Health check failed: ${response.status}`);
		}

		return await response.json();
	} catch (error) {
		console.error('AI Server health check failed:', error);
		throw error;
	}
};