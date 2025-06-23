/**
 * MCP (Model Context Protocol) Type Definitions
 * 
 * Defines types for MCP client implementation including messages,
 * contexts, tools, and error handling
 */

export interface MCPMessage {
	id: string;
	jsonrpc: '2.0';
	method?: string;
	params?: any;
	result?: any;
	error?: MCPError;
}

export interface MCPRequest extends MCPMessage {
	method: string;
	params?: any;
}

export interface MCPResponse extends MCPMessage {
	result?: any;
	error?: MCPError;
}

export interface MCPNotification extends MCPMessage {
	method: string;
	params?: any;
}

export interface MCPError {
	code: number;
	message: string;
	data?: any;
}

export interface MCPContext {
	id: string;
	conversation_id: string;
	content: any;
	metadata: {
		timestamp: number;
		model: string;
		provider: string;
		tokens_used?: number;
		user_id?: string;
		session_id?: string;
	};
}

export interface MCPTool {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, any>;
		required?: string[];
		additionalProperties?: boolean;
	};
	handler: (params: any) => Promise<any>;
}

export interface MCPCapabilities {
	tools?: boolean;
	context?: boolean;
	streaming?: boolean;
	functions?: boolean;
	knowledge?: boolean;
}

export interface MCPServerInfo {
	name: string;
	version: string;
	capabilities: MCPCapabilities;
	description?: string;
}

// MCP Methods
export enum MCPMethod {
	// Connection
	INITIALIZE = 'initialize',
	AUTHENTICATE = 'authenticate',
	PING = 'ping',
	
	// Context
	CONTEXT_STORE = 'context/store',
	CONTEXT_RETRIEVE = 'context/retrieve',
	CONTEXT_UPDATE = 'context/update',
	CONTEXT_DELETE = 'context/delete',
	
	// Tools
	TOOL_REGISTER = 'tool/register',
	TOOL_UNREGISTER = 'tool/unregister',
	TOOL_LIST = 'tool/list',
	TOOL_CALL = 'tool/call',
	
	// Chat
	CHAT_MESSAGE = 'chat/message',
	CHAT_STREAM = 'chat/stream',
	
	// Knowledge
	KNOWLEDGE_QUERY = 'knowledge/query',
	KNOWLEDGE_STORE = 'knowledge/store'
}

// Error Codes
export enum MCPErrorCode {
	// JSON-RPC 2.0 standard errors
	PARSE_ERROR = -32700,
	INVALID_REQUEST = -32600,
	METHOD_NOT_FOUND = -32601,
	INVALID_PARAMS = -32602,
	INTERNAL_ERROR = -32603,
	
	// MCP specific errors
	NOT_AUTHENTICATED = -32000,
	CONTEXT_NOT_FOUND = -32001,
	TOOL_NOT_FOUND = -32002,
	TOOL_EXECUTION_ERROR = -32003,
	RATE_LIMIT_EXCEEDED = -32004,
	INVALID_CONTEXT = -32005,
	CAPABILITY_NOT_SUPPORTED = -32006
}

export interface MCPConnectionOptions {
	url: string;
	token?: string;
	reconnect?: boolean;
	reconnectInterval?: number;
	maxReconnectAttempts?: number;
	pingInterval?: number;
	requestTimeout?: number;
}

export interface MCPEventHandlers {
	onOpen?: () => void;
	onClose?: (event: CloseEvent) => void;
	onError?: (error: Error) => void;
	onMessage?: (message: MCPMessage) => void;
	onReconnect?: (attempt: number) => void;
	onAuthenticated?: () => void;
}

// Tool execution result
export interface MCPToolResult {
	success: boolean;
	result?: any;
	error?: string;
	metadata?: {
		execution_time?: number;
		tokens_used?: number;
	};
}

// Context query options
export interface MCPContextQuery {
	conversation_id?: string;
	user_id?: string;
	session_id?: string;
	limit?: number;
	offset?: number;
	start_time?: number;
	end_time?: number;
	metadata_filter?: Record<string, any>;
}

// Streaming message chunk
export interface MCPStreamChunk {
	id: string;
	content: string;
	done: boolean;
	metadata?: {
		model?: string;
		tokens?: number;
		finish_reason?: string;
	};
}