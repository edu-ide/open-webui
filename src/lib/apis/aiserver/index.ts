/**
 * AI Server API Client
 * 
 * Provides integration with the AI Server (https://ai.ugot.uk)
 * Supporting Gemini Flash and other AI models
 */

// AI Server API Base URL
export const AI_SERVER_BASE_URL = 'https://ai.ugot.uk/api/v2';

export interface ChatRequest {
	message: string;
	provider?: 'openai' | 'ollama';
	conversation_id?: string;
	stream?: boolean;
}

export interface ChatResponse {
	response: string;
	provider: string;
	success: boolean;
	model?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
	conversation_id?: string;
	message_id?: string;
}

export interface ModelStatus {
	openai_available: boolean;
	ollama_available: boolean;
	total_models: number;
	timestamp: number;
}

export interface AIModel {
	provider: string;
	description: string;
	available: boolean;
	models: string[];
}

/**
 * Send a chat message to AI Server
 */
export const sendChatMessage = async (
	token: string,
	request: ChatRequest
): Promise<ChatResponse> => {
	let error = null;

	const res = await fetch(`${AI_SERVER_BASE_URL}/chat`, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		},
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
	const response = await fetch(`${AI_SERVER_BASE_URL}/chat/stream`, {
		method: 'POST',
		headers: {
			Accept: 'text/event-stream',
			'Content-Type': 'application/json',
			authorization: `Bearer ${token}`
		},
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
	let error = null;

	const res = await fetch(`${AI_SERVER_BASE_URL}/models`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			authorization: `Bearer ${token}`
		}
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
	let error = null;

	const res = await fetch(`${AI_SERVER_BASE_URL}/models/status`, {
		method: 'GET',
		headers: {
			Accept: 'application/json',
			authorization: `Bearer ${token}`
		}
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