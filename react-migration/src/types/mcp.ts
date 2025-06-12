// MCP (Model Context Protocol) Type Definitions

// JSON-RPC 2.0 Base Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// MCP Protocol Types
export type McpServerType = 'sse' | 'stdio' | 'websocket' | 'http';

export interface McpServerConfig {
  id: string;
  name: string;
  type: McpServerType;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {};
}

export interface McpServerInfo {
  name: string;
  version: string;
  description?: string;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: McpCapabilities;
  serverInfo: McpServerInfo;
}

// Tool Types
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, any>;
}

export interface McpToolResult {
  content?: any;
  isError?: boolean;
  error?: string;
}

// Resource Types
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// Prompt Types
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

// Server State Types
export type McpServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerState {
  config: McpServerConfig;
  status: McpServerStatus;
  error?: string;
  capabilities?: McpCapabilities;
  serverInfo?: McpServerInfo;
  tools?: McpTool[];
  resources?: McpResource[];
  prompts?: McpPrompt[];
  lastConnected?: Date;
  lastError?: Date;
}

// Execution Types
export interface McpExecution {
  id: string;
  serverId: string;
  tool: string;
  arguments?: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: McpToolResult;
  error?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

// Log Types
export interface McpLogEntry {
  id: string;
  timestamp: Date;
  serverId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
  direction?: 'sent' | 'received';
}

// Event Types
export interface McpServerEvent {
  type: 'connected' | 'disconnected' | 'error' | 'tools_changed' | 'resources_changed';
  serverId: string;
  timestamp: Date;
  data?: any;
}

// API Response Types
export interface McpApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Configuration Types
export interface McpClientConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
  sseBaseUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  requestTimeout: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}