/**
 * AI Chat Service
 * 
 * Service layer for managing AI chat functionality with AI Server
 * Handles message processing, streaming, and conversation management
 */

import { v4 as uuidv4 } from 'uuid';
import { sendChatMessage, sendStreamingChatMessage, type ChatRequest, type ChatResponse } from '$lib/apis/aiserver';

export interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
	model?: string;
	provider?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

export interface ChatConversation {
	id: string;
	title: string;
	messages: ChatMessage[];
	created_at: Date;
	updated_at: Date;
	model?: string;
	provider?: string;
}

export class AIChatService {
	private token: string;
	private conversations: Map<string, ChatConversation> = new Map();

	constructor(token: string) {
		this.token = token;
	}

	/**
	 * Create a new conversation
	 */
	createConversation(title?: string): ChatConversation {
		const conversation: ChatConversation = {
			id: uuidv4(),
			title: title || 'New Chat',
			messages: [],
			created_at: new Date(),
			updated_at: new Date()
		};

		this.conversations.set(conversation.id, conversation);
		return conversation;
	}

	/**
	 * Get conversation by ID
	 */
	getConversation(conversationId: string): ChatConversation | undefined {
		return this.conversations.get(conversationId);
	}

	/**
	 * Get all conversations
	 */
	getAllConversations(): ChatConversation[] {
		return Array.from(this.conversations.values()).sort(
			(a, b) => b.updated_at.getTime() - a.updated_at.getTime()
		);
	}

	/**
	 * Add user message to conversation
	 */
	addUserMessage(conversationId: string, content: string): ChatMessage {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) {
			throw new Error('Conversation not found');
		}

		const message: ChatMessage = {
			id: uuidv4(),
			role: 'user',
			content,
			timestamp: new Date()
		};

		conversation.messages.push(message);
		conversation.updated_at = new Date();
		
		return message;
	}

	/**
	 * Add assistant message to conversation
	 */
	addAssistantMessage(
		conversationId: string, 
		content: string, 
		model?: string, 
		provider?: string,
		usage?: ChatMessage['usage']
	): ChatMessage {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) {
			throw new Error('Conversation not found');
		}

		const message: ChatMessage = {
			id: uuidv4(),
			role: 'assistant',
			content,
			timestamp: new Date(),
			model,
			provider,
			usage
		};

		conversation.messages.push(message);
		conversation.updated_at = new Date();
		
		// Update conversation metadata
		if (model) conversation.model = model;
		if (provider) conversation.provider = provider;
		
		return message;
	}

	/**
	 * Send message to AI and get response
	 */
	async sendMessage(
		conversationId: string,
		message: string,
		provider: 'openai' | 'ollama' = 'openai'
	): Promise<ChatMessage> {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) {
			throw new Error('Conversation not found');
		}

		// Add user message
		this.addUserMessage(conversationId, message);

		// Prepare request
		const request: ChatRequest = {
			message,
			provider,
			conversation_id: conversationId
		};

		try {
			// Send to AI Server
			const response: ChatResponse = await sendChatMessage(this.token, request);

			if (!response.success) {
				throw new Error('AI Server request failed');
			}

			// Add assistant response
			const assistantMessage = this.addAssistantMessage(
				conversationId,
				response.response,
				response.model,
				response.provider,
				response.usage
			);

			return assistantMessage;
		} catch (error) {
			console.error('Failed to send message to AI:', error);
			throw error;
		}
	}

	/**
	 * Send streaming message to AI
	 */
	async sendStreamingMessage(
		conversationId: string,
		message: string,
		provider: 'openai' | 'ollama' = 'openai',
		onChunk?: (chunk: string) => void,
		onComplete?: (message: ChatMessage) => void,
		onError?: (error: Error) => void
	): Promise<void> {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) {
			throw new Error('Conversation not found');
		}

		// Add user message
		this.addUserMessage(conversationId, message);

		// Create placeholder assistant message
		const assistantMessage: ChatMessage = {
			id: uuidv4(),
			role: 'assistant',
			content: '',
			timestamp: new Date(),
			provider
		};

		conversation.messages.push(assistantMessage);
		conversation.updated_at = new Date();

		// Prepare request
		const request: ChatRequest = {
			message,
			provider,
			conversation_id: conversationId,
			stream: true
		};

		try {
			// Send streaming request
			const stream = await sendStreamingChatMessage(this.token, request);
			const reader = stream.getReader();
			const decoder = new TextDecoder();

			let fullResponse = '';

			while (true) {
				const { done, value } = await reader.read();
				
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						try {
							const data = line.slice(6);
							if (data.trim() === '[DONE]') {
								break;
							}

							const parsed = JSON.parse(data);
							if (parsed.content) {
								fullResponse += parsed.content;
								assistantMessage.content = fullResponse;
								
								if (onChunk) {
									onChunk(parsed.content);
								}
							}
						} catch (parseError) {
							console.warn('Failed to parse streaming chunk:', parseError);
						}
					}
				}
			}

			// Update final message
			assistantMessage.content = fullResponse;
			
			if (onComplete) {
				onComplete(assistantMessage);
			}

		} catch (error) {
			console.error('Failed to send streaming message to AI:', error);
			
			// Remove failed message
			const messageIndex = conversation.messages.findIndex(m => m.id === assistantMessage.id);
			if (messageIndex > -1) {
				conversation.messages.splice(messageIndex, 1);
			}

			if (onError) {
				onError(error as Error);
			}
		}
	}

	/**
	 * Delete conversation
	 */
	deleteConversation(conversationId: string): boolean {
		return this.conversations.delete(conversationId);
	}

	/**
	 * Update conversation title
	 */
	updateConversationTitle(conversationId: string, title: string): boolean {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) {
			return false;
		}

		conversation.title = title;
		conversation.updated_at = new Date();
		return true;
	}

	/**
	 * Clear all conversations
	 */
	clearAllConversations(): void {
		this.conversations.clear();
	}

	/**
	 * Export conversation to JSON
	 */
	exportConversation(conversationId: string): string | null {
		const conversation = this.conversations.get(conversationId);
		if (!conversation) {
			return null;
		}

		return JSON.stringify(conversation, null, 2);
	}

	/**
	 * Import conversation from JSON
	 */
	importConversation(jsonData: string): ChatConversation | null {
		try {
			const conversation: ChatConversation = JSON.parse(jsonData);
			
			// Validate conversation structure
			if (!conversation.id || !conversation.messages || !Array.isArray(conversation.messages)) {
				throw new Error('Invalid conversation format');
			}

			// Ensure dates are Date objects
			conversation.created_at = new Date(conversation.created_at);
			conversation.updated_at = new Date(conversation.updated_at);
			
			// Ensure message timestamps are Date objects
			conversation.messages.forEach(message => {
				message.timestamp = new Date(message.timestamp);
			});

			this.conversations.set(conversation.id, conversation);
			return conversation;
		} catch (error) {
			console.error('Failed to import conversation:', error);
			return null;
		}
	}
}