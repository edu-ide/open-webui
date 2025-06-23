/**
 * Spring AI Output Parsers
 * 
 * AI 모델의 출력을 구조화된 데이터로 파싱하고 검증하는 시스템
 */

// 타입 정의
export type {
  Schema,
  SchemaProperty,
  ParseResult,
  ParseError,
  OutputFormatConfig,
  OutputParser,
  ParseOptions,
  SchemaBuilder as ISchemaBuilder,
  SchemaTemplate,
  OutputFormat
} from './types';

// 기본 클래스
export { BaseOutputParser } from './BaseOutputParser';

// 구체적인 파서들
export { 
  JsonOutputParser, 
  SimpleJsonParser, 
  StrictJsonParser 
} from './JsonOutputParser';
export { XmlOutputParser } from './XmlOutputParser';
export { YamlOutputParser } from './YamlOutputParser';

// 스키마 빌더 및 유틸리티
export { 
  SchemaBuilder, 
  schema, 
  SchemaTemplates, 
  SchemaUtils 
} from './SchemaBuilder';

// 팩토리 및 매니저
export { 
  OutputParserFactory, 
  OutputParserManager, 
  globalOutputParserManager 
} from './OutputParserFactory';

/**
 * 편의 함수들
 */
import type { Schema } from './types';
import { OutputParserFactory } from './OutputParserFactory';
import { SchemaTemplates } from './SchemaBuilder';

// 빠른 JSON 파싱
export const parseJson = async (output: string, schema?: Schema) => {
  const parser = OutputParserFactory.createSimpleJson();
  if (schema) parser.setSchema(schema);
  return await parser.parse(output);
};

// 빠른 XML 파싱
export const parseXml = async (output: string, schema?: Schema) => {
  const parser = OutputParserFactory.createXml(schema);
  return await parser.parse(output);
};

// 빠른 YAML 파싱
export const parseYaml = async (output: string, schema?: Schema) => {
  const parser = OutputParserFactory.createYaml(schema);
  return await parser.parse(output);
};

// 자동 형식 감지 파싱
export const parseAuto = async (output: string, schema?: Schema) => {
  return await OutputParserFactory.autoParse(output, schema);
};

/**
 * 미리 정의된 스키마들
 */
export const predefinedSchemas = {
  user: SchemaTemplates.findTemplate('User Profile')?.schema,
  product: SchemaTemplates.findTemplate('Product Info')?.schema,
  tasks: SchemaTemplates.findTemplate('Task List')?.schema,
  analytics: SchemaTemplates.findTemplate('Analytics Report')?.schema
};