/**
 * Enhanced AI Chat Service with MCP Integration
 * 
 * Extends the base AI Chat Service with MCP capabilities including
 * tool usage, context management, and advanced streaming
 */

import { AIChatService, type ChatMessage, type ChatConversation } from './aiChatService';
import { mcpHelpers, mcpClient, mcpContexts } from '$lib/stores/mcp';
import type { MCPContext, MCPStreamChunk, MCPTool } from '$lib/types/mcp';
import { authService } from './authService';
import { get } from 'svelte/store';

export interface EnhancedChatMessage extends ChatMessage {
	mcp_context_id?: string;
	tools_used?: string[];
	tool_results?: any[];
}

export interface EnhancedChatConversation extends ChatConversation {
	mcp_contexts?: string[];
	tools_enabled?: boolean;
}

export class EnhancedAIChatService extends AIChatService {
	private mcpInitialized = false;
	private enabledTools = new Set<string>(['web_search', 'calculator', 'datetime', 'memory']);

	constructor() {
		// No token needed, OAuth2 handles authentication
		super('');
	}

	/**
	 * Initialize service with MCP
	 */
	async initialize(): Promise<void> {
		try {
			// Get OAuth2 token for MCP
			const token = await authService.getAccessToken();
			
			// Initialize MCP client with OAuth2 token
			await mcpHelpers.initialize({
				url: 'wss://ai.ugot.uk/mcp',
				token: token,
				reconnect: true,
				reconnectInterval: 5000,
				maxReconnectAttempts: 10
			});

			this.mcpInitialized = true;
			console.log('Enhanced AI Chat Service initialized with MCP');
		} catch (error) {
			console.error('Failed to initialize MCP:', error);
			// Continue without MCP - fallback to basic service
			this.mcpInitialized = false;
		}
	}

	/**
	 * Create enhanced conversation
	 */
	createConversation(title?: string): EnhancedChatConversation {
		const conversation = super.createConversation(title) as EnhancedChatConversation;
		conversation.mcp_contexts = [];
		conversation.tools_enabled = true;
		return conversation;
	}

	/**
	 * Send enhanced message with MCP context
	 */
	async sendEnhancedMessage(
		conversationId: string,
		message: string,
		provider: 'openai' | 'ollama' = 'openai',
		includeContext: boolean = true,
		enableTools: boolean = true
	): Promise<EnhancedChatMessage> {
		const conversation = this.getConversation(conversationId) as EnhancedChatConversation;
		if (!conversation) {
			throw new Error('Conversation not found');
		}

		// Add user message
		const userMessage = this.addUserMessage(conversationId, message) as EnhancedChatMessage;

		try {
			// Store MCP context if enabled
			let contextId: string | undefined;
			if (this.mcpInitialized && includeContext) {
				const context = await this.storeMessageContext(
					conversationId,
					message,
					userMessage.id,
					provider
				);
				contextId = context.id;
				userMessage.mcp_context_id = contextId;
				
				// Add to conversation contexts
				if (!conversation.mcp_contexts?.includes(contextId)) {
					conversation.mcp_contexts?.push(contextId);
				}
			}

			// Prepare enhanced request
			const request = {
				message,
				provider,
				conversation_id: conversationId,
				mcp_enabled: this.mcpInitialized,
				mcp_context_id: contextId,
				tools_enabled: enableTools && this.mcpInitialized,
				enabled_tools: enableTools ? Array.from(this.enabledTools) : []
			};

			// Send request to AI server using OAuth2
			const response = await authService.fetch('https://ai.ugot.uk/api/v2/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(request)
			});

			if (!response.ok) {
				throw new Error(`AI request failed: ${response.statusText}`);
			}

			const result = await response.json();

			// Create enhanced assistant message
			const assistantMessage = this.addAssistantMessage(
				conversationId,
				result.response,
				result.model,
				result.provider,
				result.usage
			) as EnhancedChatMessage;

			// Add MCP metadata
			if (result.mcp_context_id) {
				assistantMessage.mcp_context_id = result.mcp_context_id;
			}
			
			if (result.tools_used) {
				assistantMessage.tools_used = result.tools_used;
			}
			
			if (result.tool_results) {
				assistantMessage.tool_results = result.tool_results;
			}

			// Store assistant context
			if (this.mcpInitialized && includeContext) {
				const assistantContext = await this.storeMessageContext(
					conversationId,
					result.response,
					assistantMessage.id,
					provider,
					{
						tools_used: result.tools_used,
						tool_results: result.tool_results
					}
				);
				
				if (!conversation.mcp_contexts?.includes(assistantContext.id)) {
					conversation.mcp_contexts?.push(assistantContext.id);
				}
			}

			return assistantMessage;

		} catch (error) {
			console.error('Failed to send enhanced message:', error);
			throw error;
		}
	}

	/**
	 * Send streaming message with MCP
	 */
	async sendEnhancedStreamingMessage(
		conversationId: string,
		message: string,
		provider: 'openai' | 'ollama' = 'openai',
		onChunk?: (chunk: string, metadata?: any) => void,
		onComplete?: (message: EnhancedChatMessage) => void,
		onError?: (error: Error) => void,
		includeContext: boolean = true,
		enableTools: boolean = true
	): Promise<void> {
		const conversation = this.getConversation(conversationId) as EnhancedChatConversation;
		if (!conversation) {
			throw new Error('Conversation not found');
		}

		// Add user message
		const userMessage = this.addUserMessage(conversationId, message) as EnhancedChatMessage;
		
		// Create placeholder assistant message
		const assistantMessage: EnhancedChatMessage = {
			id: uuidv4(),
			role: 'assistant',
			content: '',
			timestamp: new Date(),
			provider,
			tools_used: [],
			tool_results: []
		};

		conversation.messages.push(assistantMessage);
		conversation.updated_at = new Date();

		try {
			// Store MCP context if enabled
			let contextId: string | undefined;
			if (this.mcpInitialized && includeContext) {
				const context = await this.storeMessageContext(
					conversationId,
					message,
					userMessage.id,
					provider
				);
				contextId = context.id;
				userMessage.mcp_context_id = contextId;
			}

			// Use MCP streaming if available
			if (this.mcpInitialized) {
				await mcpHelpers.sendStreamingMessage(
					message,
					conversationId,
					(chunk: MCPStreamChunk) => {
						assistantMessage.content += chunk.content;
						
						if (chunk.metadata?.model) {
							assistantMessage.model = chunk.metadata.model;
						}
						
						onChunk?.(chunk.content, chunk.metadata);
						
						if (chunk.done) {
							// Store final context
							if (includeContext) {
								this.storeMessageContext(
									conversationId,
									assistantMessage.content,
									assistantMessage.id,
									provider,
									{
										tools_used: assistantMessage.tools_used,
										tool_results: assistantMessage.tool_results
									}
								).then(context => {
									assistantMessage.mcp_context_id = context.id;
								});
							}
							
							onComplete?.(assistantMessage);
						}
					},
					{
						provider,
						tools_enabled: enableTools,
						enabled_tools: Array.from(this.enabledTools)
					}
				);
			} else {
				// Fallback to regular streaming
				await super.sendStreamingMessage(
					conversationId,
					message,
					provider,
					onChunk,
					() => onComplete?.(assistantMessage),
					onError
				);
			}
		} catch (error) {
			// Remove failed message
			const messageIndex = conversation.messages.findIndex(m => m.id === assistantMessage.id);
			if (messageIndex > -1) {
				conversation.messages.splice(messageIndex, 1);
			}
			
			onError?.(error as Error);
			throw error;
		}
	}

	/**
	 * Store message context in MCP
	 */
	private async storeMessageContext(
		conversationId: string,
		content: string,
		messageId: string,
		provider: string,
		additionalData?: any
	): Promise<MCPContext> {
		const userContext = await this.getUserContext();
		
		return await mcpHelpers.storeContext(
			conversationId,
			{
				message_id: messageId,
				content,
				...additionalData
			},
			{
				model: 'gemini-2.0-flash',
				provider,
				user_id: userContext.user_id,
				session_id: userContext.session_id,
				timestamp: Date.now()
			}
		);
	}

	/**
	 * Get user context for MCP
	 */
	private async getUserContext(): Promise<any> {
		return {
			user_agent: navigator.userAgent,
			timestamp: new Date().toISOString(),
			page_url: window.location.href,
			user_id: authService.getUserInfo()?.sub || 'anonymous',
			session_id: sessionStorage.getItem('session_id') || this.generateSessionId()
		};
	}

	/**
	 * Generate session ID
	 */
	private generateSessionId(): string {
		const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
		sessionStorage.setItem('session_id', sessionId);
		return sessionId;
	}

	/**
	 * Get conversation contexts from MCP
	 */
	async getConversationContexts(conversationId: string): Promise<MCPContext[]> {
		if (!this.mcpInitialized) {
			return [];
		}

		const contexts = await mcpHelpers.retrieveContexts({
			conversation_id: conversationId
		});

		return contexts;
	}

	/**
	 * Enable/disable specific tools
	 */
	setEnabledTools(tools: string[]): void {
		this.enabledTools = new Set(tools);
	}

	/**
	 * Get available tools
	 */
	getAvailableTools(): MCPTool[] {
		const client = get(mcpClient);
		if (!client) return [];
		
		const tools = client.getTools();
		return Array.from(tools.values());
	}

	/**
	 * Check if MCP is initialized
	 */
	isMCPEnabled(): boolean {
		return this.mcpInitialized;
	}

	/**
	 * Cleanup and disconnect
	 */
	async cleanup(): Promise<void> {
		if (this.mcpInitialized) {
			mcpHelpers.disconnect();
		}
		this.clearAllConversations();
	}
}

// Helper to generate UUID
function uuidv4(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}