/**
 * Model Context Protocol (MCP) 타입 정의
 * JSON-RPC 2.0 기반 실시간 통신 프로토콜
 */

// JSON-RPC 2.0 기본 구조
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, any> | any[];
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any> | any[];
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// MCP 핸드셰이크 프로토콜
export interface MCPInitializeRequest extends JsonRpcRequest {
  method: 'initialize';
  params: {
    protocolVersion: string;
    capabilities: MCPClientCapabilities;
    clientInfo: {
      name: string;
      version: string;
    };
  };
}

export interface MCPInitializeResponse extends JsonRpcResponse {
  result: {
    protocolVersion: string;
    capabilities: MCPServerCapabilities;
    serverInfo: {
      name: string;
      version: string;
    };
    instructions?: string;
  };
}

// MCP 클라이언트 capabilities
export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, any>;
  experimental?: Record<string, any>;
}

// MCP 서버 capabilities
export interface MCPServerCapabilities {
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  logging?: Record<string, any>;
  experimental?: Record<string, any>;
}

// MCP 리소스 관련
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPListResourcesRequest extends JsonRpcRequest {
  method: 'resources/list';
  params?: {
    cursor?: string;
  };
}

export interface MCPListResourcesResponse extends JsonRpcResponse {
  result: {
    resources: MCPResource[];
    nextCursor?: string;
  };
}

export interface MCPReadResourceRequest extends JsonRpcRequest {
  method: 'resources/read';
  params: {
    uri: string;
  };
}

export interface MCPReadResourceResponse extends JsonRpcResponse {
  result: {
    contents: MCPResourceContent[];
  };
}

// MCP 도구 관련
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPListToolsRequest extends JsonRpcRequest {
  method: 'tools/list';
  params?: {
    cursor?: string;
  };
}

export interface MCPListToolsResponse extends JsonRpcResponse {
  result: {
    tools: MCPTool[];
    nextCursor?: string;
  };
}

export interface MCPCallToolRequest extends JsonRpcRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

export interface MCPCallToolResponse extends JsonRpcResponse {
  result: {
    content: MCPToolResult[];
    isError?: boolean;
  };
}

export interface MCPToolResult {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// MCP 프롬프트 관련
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPListPromptsRequest extends JsonRpcRequest {
  method: 'prompts/list';
  params?: {
    cursor?: string;
  };
}

export interface MCPListPromptsResponse extends JsonRpcResponse {
  result: {
    prompts: MCPPrompt[];
    nextCursor?: string;
  };
}

export interface MCPGetPromptRequest extends JsonRpcRequest {
  method: 'prompts/get';
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

export interface MCPGetPromptResponse extends JsonRpcResponse {
  result: {
    description?: string;
    messages: MCPPromptMessage[];
  };
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPMessageContent;
}

export interface MCPMessageContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// MCP 로깅 관련
export interface MCPLogLevel {
  level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
}

export interface MCPSetLogLevelRequest extends JsonRpcRequest {
  method: 'logging/setLevel';
  params: MCPLogLevel;
}

export interface MCPLogMessage extends JsonRpcNotification {
  method: 'notifications/message';
  params: {
    level: MCPLogLevel['level'];
    logger?: string;
    data: any;
  };
}

// MCP 실시간 통신 이벤트
export interface MCPResourceUpdatedNotification extends JsonRpcNotification {
  method: 'notifications/resources/updated';
  params: {
    uri: string;
  };
}

export interface MCPResourceListChangedNotification extends JsonRpcNotification {
  method: 'notifications/resources/list_changed';
}

export interface MCPToolListChangedNotification extends JsonRpcNotification {
  method: 'notifications/tools/list_changed';
}

export interface MCPPromptListChangedNotification extends JsonRpcNotification {
  method: 'notifications/prompts/list_changed';
}

// MCP 연결 상태
export type MCPConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'error'
  | 'reconnecting';

// MCP 클라이언트 설정
export interface MCPClientConfig {
  serverUrl: string;
  protocolVersion: string;
  clientInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPClientCapabilities;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  handshakeTimeout?: number;
  heartbeatInterval?: number;
}

// MCP 클라이언트 이벤트
export interface MCPClientEvents {
  'connection-state-changed': { state: MCPConnectionState; error?: Error };
  'initialized': { serverInfo: any; capabilities: MCPServerCapabilities };
  'resource-updated': { uri: string };
  'resource-list-changed': {};
  'tool-list-changed': {};
  'prompt-list-changed': {};
  'log-message': { level: string; logger?: string; data: any };
  'error': { error: Error; context?: string };
}

// 유틸리티 타입
export type MCPRequest = 
  | MCPInitializeRequest
  | MCPListResourcesRequest
  | MCPReadResourceRequest
  | MCPListToolsRequest
  | MCPCallToolRequest
  | MCPListPromptsRequest
  | MCPGetPromptRequest
  | MCPSetLogLevelRequest;

export type MCPResponse = 
  | MCPInitializeResponse
  | MCPListResourcesResponse
  | MCPReadResourceResponse
  | MCPListToolsResponse
  | MCPCallToolResponse
  | MCPListPromptsResponse
  | MCPGetPromptResponse;

export type MCPNotification = 
  | MCPLogMessage
  | MCPResourceUpdatedNotification
  | MCPResourceListChangedNotification
  | MCPToolListChangedNotification
  | MCPPromptListChangedNotification;

export type MCPMessage = MCPRequest | MCPResponse | MCPNotification;

// 에러 코드 상수
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR_START: -32099,
  SERVER_ERROR_END: -32000,
  // MCP 전용 에러 코드
  HANDSHAKE_TIMEOUT: -32001,
  CAPABILITY_NOT_SUPPORTED: -32002,
  RESOURCE_NOT_FOUND: -32003,
  TOOL_EXECUTION_ERROR: -32004,
  PROMPT_GENERATION_ERROR: -32005,
} as const;

export type MCPErrorCode = typeof MCP_ERROR_CODES[keyof typeof MCP_ERROR_CODES];