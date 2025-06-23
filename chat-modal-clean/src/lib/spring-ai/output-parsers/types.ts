/**
 * Structured Output 파싱 시스템 타입 정의
 */

export interface Schema {
  type: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  items?: Schema;
  enum?: any[];
  format?: string;
  description?: string;
}

export interface SchemaProperty {
  type: string;
  description?: string;
  format?: string;
  items?: Schema;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  enum?: any[];
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  errors?: ParseError[];
  rawOutput: string;
  parsedAt: Date;
}

export interface ParseError {
  path: string;
  message: string;
  code: string;
  value?: any;
}

export interface OutputFormatConfig {
  type: 'json' | 'xml' | 'yaml' | 'csv';
  schema?: Schema;
  strict?: boolean;
  allowPartial?: boolean;
  transformKeys?: 'camelCase' | 'snake_case' | 'kebab-case';
}

/**
 * 기본 OutputParser 인터페이스
 */
export interface OutputParser<T = any> {
  readonly formatType: string;
  readonly schema?: Schema;
  
  parse(output: string): Promise<ParseResult<T>>;
  parseSync(output: string): ParseResult<T>;
  validate(data: any): ParseResult<T>;
  getInstructions(): string;
  getSchema(): Schema | undefined;
  setSchema(schema: Schema): void;
}

/**
 * 파싱 옵션
 */
export interface ParseOptions {
  strict?: boolean;
  allowPartial?: boolean;
  maxRetries?: number;
  fallbackValue?: any;
  customValidators?: Record<string, (value: any) => boolean>;
  transformKeys?: 'camelCase' | 'snake_case' | 'kebab-case';
}

/**
 * 스키마 생성 헬퍼 타입들
 */
export type SchemaBuilder = {
  string(options?: { 
    minLength?: number; 
    maxLength?: number; 
    format?: string; 
    enum?: string[];
    description?: string;
  }): SchemaProperty;
  
  number(options?: { 
    minimum?: number; 
    maximum?: number; 
    description?: string;
  }): SchemaProperty;
  
  boolean(options?: { 
    description?: string;
  }): SchemaProperty;
  
  array(items: SchemaProperty, options?: { 
    minItems?: number; 
    maxItems?: number;
    description?: string;
  }): SchemaProperty;
  
  object(properties: Record<string, SchemaProperty>, options?: {
    required?: string[];
    description?: string;
  }): SchemaProperty;
  
  enum(values: any[], options?: {
    description?: string;
  }): SchemaProperty;
};

/**
 * 미리 정의된 스키마 템플릿
 */
export interface SchemaTemplate {
  name: string;
  description: string;
  schema: Schema;
  example: any;
}

export type OutputFormat = 'json' | 'xml' | 'yaml' | 'csv';