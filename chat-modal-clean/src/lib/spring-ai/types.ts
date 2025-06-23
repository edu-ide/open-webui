// Spring AI 호환 타입 정의

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  stream?: boolean;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  name?: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finishReason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChatStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finishReason?: string;
  }>;
}

// Advisor 인터페이스 (기본 버전 - base.ts와 호환을 위해 간소화)
export interface Advisor {
  name: string;
  adviseRequest?: (request: ChatRequest) => ChatRequest | Promise<ChatRequest>;
  adviseResponse?: (response: ChatResponse, originalRequest: ChatRequest) => ChatResponse | Promise<ChatResponse>;
}

// ChatRequest 인터페이스
export interface ChatRequest {
  messages: ChatMessage[];
  options: ChatOptions;
}

// Function calling 관련 타입
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Structured output 관련 타입
export interface OutputParser<T = any> {
  parse(response: string): T | Promise<T>;
  getFormatInstructions(): string;
}

// Vector Store 관련 타입
export interface VectorStoreDocument {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
}

export interface SimilaritySearchResult {
  document: VectorStoreDocument;
  score: number;
}

// Model Provider 관련 타입
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  maxOutputTokens: number;
  inputPricing: number; // per 1K tokens
  outputPricing: number; // per 1K tokens
  capabilities: ModelCapability[];
  parameters?: ModelParameters;
}

export interface ModelCapability {
  type: 'chat' | 'completion' | 'embedding' | 'function_calling' | 'vision' | 'code' | 'json_mode';
  supported: boolean;
  notes?: string;
}

export interface ModelParameters {
  temperature?: { min: number; max: number; default: number };
  maxTokens?: { min: number; max: number; default: number };
  topP?: { min: number; max: number; default: number };
  frequencyPenalty?: { min: number; max: number; default: number };
  presencePenalty?: { min: number; max: number; default: number };
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  timeout?: number;
  retryCount?: number;
  rateLimitPerMinute?: number;
  customHeaders?: Record<string, string>;
}

export interface ProviderStatus {
  name: string;
  isAvailable: boolean;
  lastChecked: Date;
  latency?: number; // ms
  errorRate?: number; // 0-1
  usage?: {
    requests: number;
    tokens: number;
    cost: number;
  };
  limits?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsRemaining?: number;
    tokensRemaining?: number;
    resetTime?: Date;
  };
}

export interface ModelProvider {
  name: string;
  displayName: string;
  description: string;
  iconUrl?: string;
  website?: string;
  models: ModelInfo[];
  defaultModel: string;
  
  // Core methods
  isAvailable(): Promise<boolean>;
  complete(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterableIterator<ChatStreamChunk>;
  
  // Configuration
  getConfiguration(): ProviderConfig;
  setConfiguration(config: ProviderConfig): void;
  validateConfiguration(): Promise<boolean>;
  
  // Monitoring
  getStatus(): Promise<ProviderStatus>;
  getUsage(): Promise<ProviderStatus['usage']>;
  
  // Model management
  getModel(modelId: string): ModelInfo | null;
  getAvailableModels(): Promise<ModelInfo[]>;
  estimateCost(request: ChatRequest, modelId: string): number;
}

// Observability 관련 타입
export interface MetricEvent {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'error' | 'stream_chunk';
  data: any;
  duration?: number;
  error?: Error;
}

export interface ChatMetrics {
  totalRequests: number;
  totalTokens: number;
  averageResponseTime: number;
  errorRate: number;
  recentEvents: MetricEvent[];
}