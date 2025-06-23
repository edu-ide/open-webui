/**
 * MCP (Model Context Protocol) Client Implementation
 * 
 * Provides WebSocket-based communication with MCP server
 * Supports tool registration, context management, and streaming
 */

import { v4 as uuidv4 } from 'uuid';
import type {
	MCPMessage,
	MCPRequest,
	MCPResponse,
	MCPNotification,
	MCPError,
	MCPContext,
	MCPTool,
	MCPConnectionOptions,
	MCPEventHandlers,
	MCPServerInfo,
	MCPMethod,
	MCPErrorCode,
	MCPToolResult,
	MCPContextQuery,
	MCPStreamChunk
} from '$lib/types/mcp';

export class MCPClient {
	private websocket: WebSocket | null = null;
	private options: Required<MCPConnectionOptions>;
	private eventHandlers: MCPEventHandlers;
	private tools: Map<string, MCPTool> = new Map();
	private contexts: Map<string, MCPContext> = new Map();
	private pendingRequests: Map<string, {
		resolve: (response: MCPResponse) => void;
		reject: (error: Error) => void;
		timeout: NodeJS.Timeout;
	}> = new Map();
	
	private reconnectAttempts = 0;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private pingTimer: NodeJS.Timeout | null = null;
	private isAuthenticated = false;
	private serverInfo: MCPServerInfo | null = null;

	constructor(options: MCPConnectionOptions, handlers: MCPEventHandlers = {}) {
		this.options = {
			url: options.url,
			token: options.token || '',
			reconnect: options.reconnect ?? true,
			reconnectInterval: options.reconnectInterval ?? 5000,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
			pingInterval: options.pingInterval ?? 30000,
			requestTimeout: options.requestTimeout ?? 30000
		};
		
		this.eventHandlers = handlers;
	}

	/**
	 * Connect to MCP server
	 */
	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				// Create WebSocket connection
				this.websocket = new WebSocket(this.options.url, ['mcp-v1']);
				
				this.websocket.onopen = async () => {
					console.log('MCP WebSocket connected');
					this.reconnectAttempts = 0;
					
					// Initialize connection
					try {
						await this.initialize();
						
						// Authenticate if token provided
						if (this.options.token) {
							await this.authenticate();
						}
						
						// Start ping timer
						this.startPingTimer();
						
						this.eventHandlers.onOpen?.();
						resolve();
					} catch (error) {
						reject(error);
					}
				};

				this.websocket.onmessage = (event) => {
					try {
						const message: MCPMessage = JSON.parse(event.data);
						this.handleMessage(message);
					} catch (error) {
						console.error('Failed to parse MCP message:', error);
					}
				};

				this.websocket.onclose = (event) => {
					console.log('MCP WebSocket closed:', event.code, event.reason);
					this.cleanup();
					this.eventHandlers.onClose?.(event);
					
					// Attempt reconnection if enabled
					if (this.options.reconnect && !event.wasClean) {
						this.attemptReconnect();
					}
				};

				this.websocket.onerror = (error) => {
					console.error('MCP WebSocket error:', error);
					this.eventHandlers.onError?.(new Error('WebSocket error'));
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Initialize MCP connection
	 */
	private async initialize(): Promise<void> {
		const response = await this.sendRequest({
			method: MCPMethod.INITIALIZE,
			params: {
				client_name: 'AI Chat Client',
				client_version: '1.0.0',
				capabilities: {
					tools: true,
					context: true,
					streaming: true,
					functions: true,
					knowledge: true
				}
			}
		});

		if (response.result) {
			this.serverInfo = response.result;
			console.log('MCP initialized with server:', this.serverInfo);
		}
	}

	/**
	 * Authenticate with MCP server
	 */
	private async authenticate(): Promise<void> {
		const response = await this.sendRequest({
			method: MCPMethod.AUTHENTICATE,
			params: {
				token: this.options.token
			}
		});

		if (response.result?.authenticated) {
			this.isAuthenticated = true;
			this.eventHandlers.onAuthenticated?.();
			console.log('MCP authenticated successfully');
		} else {
			throw new Error('MCP authentication failed');
		}
	}

	/**
	 * Handle incoming messages
	 */
	private handleMessage(message: MCPMessage): void {
		// Handle responses to requests
		if ('id' in message && !message.method) {
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pendingRequests.delete(message.id);
				
				if (message.error) {
					pending.reject(new Error(message.error.message));
				} else {
					pending.resolve(message as MCPResponse);
				}
			}
		}
		// Handle requests from server
		else if (message.method) {
			this.handleRequest(message as MCPRequest);
		}
		// Handle notifications
		else if (!('id' in message) && message.method) {
			this.handleNotification(message as MCPNotification);
		}

		this.eventHandlers.onMessage?.(message);
	}

	/**
	 * Handle requests from server
	 */
	private async handleRequest(request: MCPRequest): Promise<void> {
		let response: MCPResponse = {
			id: request.id,
			jsonrpc: '2.0'
		};

		try {
			switch (request.method) {
				case MCPMethod.TOOL_CALL:
					response.result = await this.handleToolCall(request.params);
					break;
				
				case MCPMethod.PING:
					response.result = { pong: true };
					break;
				
				default:
					response.error = {
						code: MCPErrorCode.METHOD_NOT_FOUND,
						message: `Method not found: ${request.method}`
					};
			}
		} catch (error) {
			response.error = {
				code: MCPErrorCode.INTERNAL_ERROR,
				message: error.message
			};
		}

		this.send(response);
	}

	/**
	 * Handle tool call from server
	 */
	private async handleToolCall(params: any): Promise<MCPToolResult> {
		const { tool_name, parameters } = params;
		const tool = this.tools.get(tool_name);
		
		if (!tool) {
			return {
				success: false,
				error: `Tool not found: ${tool_name}`
			};
		}

		const startTime = Date.now();
		
		try {
			const result = await tool.handler(parameters);
			return {
				success: true,
				result,
				metadata: {
					execution_time: Date.now() - startTime
				}
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
				metadata: {
					execution_time: Date.now() - startTime
				}
			};
		}
	}

	/**
	 * Handle notifications from server
	 */
	private handleNotification(notification: MCPNotification): void {
		switch (notification.method) {
			case MCPMethod.CONTEXT_UPDATE:
				const context = notification.params as MCPContext;
				this.contexts.set(context.id, context);
				break;
		}
	}

	/**
	 * Send request to server
	 */
	async sendRequest(request: Omit<MCPRequest, 'id' | 'jsonrpc'>): Promise<MCPResponse> {
		return new Promise((resolve, reject) => {
			if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
				reject(new Error('WebSocket not connected'));
				return;
			}

			const id = uuidv4();
			const fullRequest: MCPRequest = {
				id,
				jsonrpc: '2.0',
				...request
			};

			// Set timeout
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Request timeout: ${request.method}`));
			}, this.options.requestTimeout);

			// Store pending request
			this.pendingRequests.set(id, { resolve, reject, timeout });

			// Send request
			this.send(fullRequest);
		});
	}

	/**
	 * Send notification to server
	 */
	sendNotification(notification: Omit<MCPNotification, 'jsonrpc'>): void {
		if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
			console.warn('Cannot send notification: WebSocket not connected');
			return;
		}

		const fullNotification: MCPNotification = {
			jsonrpc: '2.0',
			...notification
		};

		this.send(fullNotification);
	}

	/**
	 * Send message to server
	 */
	private send(message: MCPMessage): void {
		if (this.websocket?.readyState === WebSocket.OPEN) {
			this.websocket.send(JSON.stringify(message));
		}
	}

	/**
	 * Register a tool
	 */
	async registerTool(tool: MCPTool): Promise<void> {
		this.tools.set(tool.name, tool);

		if (this.isAuthenticated) {
			await this.sendRequest({
				method: MCPMethod.TOOL_REGISTER,
				params: {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters
				}
			});
		}
	}

	/**
	 * Unregister a tool
	 */
	async unregisterTool(toolName: string): Promise<void> {
		this.tools.delete(toolName);

		if (this.isAuthenticated) {
			await this.sendRequest({
				method: MCPMethod.TOOL_UNREGISTER,
				params: { name: toolName }
			});
		}
	}

	/**
	 * Store context
	 */
	async storeContext(conversationId: string, content: any, metadata?: any): Promise<MCPContext> {
		const context: MCPContext = {
			id: uuidv4(),
			conversation_id: conversationId,
			content,
			metadata: {
				timestamp: Date.now(),
				model: metadata?.model || 'unknown',
				provider: metadata?.provider || 'unknown',
				tokens_used: metadata?.tokens_used,
				user_id: metadata?.user_id,
				session_id: metadata?.session_id
			}
		};

		const response = await this.sendRequest({
			method: MCPMethod.CONTEXT_STORE,
			params: context
		});

		if (response.result) {
			this.contexts.set(context.id, context);
			return context;
		}

		throw new Error('Failed to store context');
	}

	/**
	 * Retrieve contexts
	 */
	async retrieveContexts(query: MCPContextQuery): Promise<MCPContext[]> {
		const response = await this.sendRequest({
			method: MCPMethod.CONTEXT_RETRIEVE,
			params: query
		});

		return response.result?.contexts || [];
	}

	/**
	 * Send streaming chat message
	 */
	async sendStreamingMessage(
		message: string,
		conversationId: string,
		onChunk: (chunk: MCPStreamChunk) => void,
		metadata?: any
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const streamId = uuidv4();
			
			// Send stream request
			this.sendRequest({
				method: MCPMethod.CHAT_STREAM,
				params: {
					stream_id: streamId,
					message,
					conversation_id: conversationId,
					metadata
				}
			}).then(() => {
				// Handle stream chunks via notifications
				const originalHandler = this.eventHandlers.onMessage;
				
				this.eventHandlers.onMessage = (message) => {
					if (message.method === 'stream/chunk' && 
						message.params?.stream_id === streamId) {
						
						const chunk = message.params as MCPStreamChunk;
						onChunk(chunk);
						
						if (chunk.done) {
							this.eventHandlers.onMessage = originalHandler;
							resolve();
						}
					}
					
					originalHandler?.(message);
				};
			}).catch(reject);
		});
	}

	/**
	 * Ping server
	 */
	private async ping(): Promise<void> {
		try {
			await this.sendRequest({
				method: MCPMethod.PING,
				params: {}
			});
		} catch (error) {
			console.error('Ping failed:', error);
		}
	}

	/**
	 * Start ping timer
	 */
	private startPingTimer(): void {
		this.stopPingTimer();
		
		this.pingTimer = setInterval(() => {
			this.ping();
		}, this.options.pingInterval);
	}

	/**
	 * Stop ping timer
	 */
	private stopPingTimer(): void {
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
	}

	/**
	 * Attempt reconnection
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
			console.error('Max reconnection attempts reached');
			return;
		}

		this.reconnectAttempts++;
		this.eventHandlers.onReconnect?.(this.reconnectAttempts);

		this.reconnectTimer = setTimeout(() => {
			console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}`);
			this.connect().catch(console.error);
		}, this.options.reconnectInterval);
	}

	/**
	 * Cleanup resources
	 */
	private cleanup(): void {
		this.stopPingTimer();
		
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		// Clear pending requests
		this.pendingRequests.forEach(({ reject, timeout }) => {
			clearTimeout(timeout);
			reject(new Error('Connection closed'));
		});
		this.pendingRequests.clear();

		this.isAuthenticated = false;
		this.serverInfo = null;
	}

	/**
	 * Disconnect from server
	 */
	disconnect(): void {
		this.options.reconnect = false;
		
		if (this.websocket) {
			this.websocket.close(1000, 'Client disconnect');
			this.websocket = null;
		}
		
		this.cleanup();
	}

	/**
	 * Get connection status
	 */
	isConnected(): boolean {
		return this.websocket?.readyState === WebSocket.OPEN;
	}

	/**
	 * Get authentication status
	 */
	isAuthenticatedStatus(): boolean {
		return this.isAuthenticated;
	}

	/**
	 * Get server info
	 */
	getServerInfo(): MCPServerInfo | null {
		return this.serverInfo;
	}

	/**
	 * Get registered tools
	 */
	getTools(): Map<string, MCPTool> {
		return new Map(this.tools);
	}

	/**
	 * Get cached contexts
	 */
	getCachedContexts(): Map<string, MCPContext> {
		return new Map(this.contexts);
	}
}