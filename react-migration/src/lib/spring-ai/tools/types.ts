/**
 * Function Calling / Tool 시스템 타입 정의
 */

export interface FunctionParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: FunctionParameter;
  properties?: Record<string, FunctionParameter>;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: FunctionParameter[];
  returnType?: string;
  returnDescription?: string;
  examples?: FunctionExample[];
  category?: string;
  tags?: string[];
  isAsync?: boolean;
  timeout?: number;
  requiresAuth?: boolean;
  dangerous?: boolean;
}

export interface FunctionExample {
  description: string;
  parameters: Record<string, any>;
  expectedResult?: any;
}

export interface FunctionCallRequest {
  functionName: string;
  parameters: Record<string, any>;
  callId?: string;
  context?: any;
}

export interface FunctionCallResult {
  success: boolean;
  result?: any;
  error?: FunctionError;
  callId?: string;
  executionTime?: number;
  timestamp: Date;
}

export interface FunctionError {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface ToolExecutionContext {
  userId?: string;
  sessionId?: string;
  permissions?: string[];
  rateLimits?: RateLimit;
  environment?: 'development' | 'staging' | 'production';
}

export interface RateLimit {
  maxCalls: number;
  windowMs: number;
  currentCalls?: number;
  resetTime?: Date;
}

export interface FunctionTool {
  definition: FunctionDefinition;
  execute(request: FunctionCallRequest, context?: ToolExecutionContext): Promise<FunctionCallResult>;
  validate(parameters: Record<string, any>): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  parameter: string;
  message: string;
  code: string;
  value?: any;
}

export interface ToolRegistry {
  register(tool: FunctionTool): void;
  unregister(name: string): boolean;
  get(name: string): FunctionTool | undefined;
  list(): FunctionTool[];
  listByCategory(category: string): FunctionTool[];
  search(query: string): FunctionTool[];
}

export interface ToolExecutionHistory {
  id: string;
  functionName: string;
  parameters: Record<string, any>;
  result: FunctionCallResult;
  timestamp: Date;
  executionTime: number;
  userId?: string;
  sessionId?: string;
}

export interface SecurityPolicy {
  allowedFunctions?: string[];
  blockedFunctions?: string[];
  requireAuth?: boolean;
  maxExecutionTime?: number;
  rateLimits?: Record<string, RateLimit>;
  sandboxed?: boolean;
}

export type ToolCategory = 
  | 'math'
  | 'web'
  | 'utility'
  | 'data'
  | 'api'
  | 'file'
  | 'search'
  | 'weather'
  | 'time'
  | 'conversion'
  | 'custom';