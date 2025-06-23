import type { OutputParser, OutputFormat, Schema, ParseOptions } from './types';
import { JsonOutputParser, SimpleJsonParser, StrictJsonParser } from './JsonOutputParser';
import { XmlOutputParser } from './XmlOutputParser';
import { YamlOutputParser } from './YamlOutputParser';

/**
 * OutputParser 팩토리
 */
export class OutputParserFactory {
  private static parsers: Map<string, new (schema?: Schema, options?: ParseOptions) => OutputParser> = new Map();

  /**
   * 기본 파서들 등록
   */
  static initialize(): void {
    this.register('json', JsonOutputParser);
    this.register('xml', XmlOutputParser);
    this.register('yaml', YamlOutputParser);
    this.register('yml', YamlOutputParser); // YAML 별칭
  }

  /**
   * 파서 등록
   */
  static register(
    format: string, 
    parserClass: new (schema?: Schema, options?: ParseOptions) => OutputParser
  ): void {
    this.parsers.set(format.toLowerCase(), parserClass);
  }

  /**
   * 파서 생성
   */
  static create(
    format: OutputFormat, 
    schema?: Schema, 
    options?: ParseOptions
  ): OutputParser {
    const ParserClass = this.parsers.get(format.toLowerCase());
    
    if (!ParserClass) {
      throw new Error(`Unsupported output format: ${format}`);
    }

    return new ParserClass(schema, options);
  }

  /**
   * 사전 정의된 파서들
   */
  static createSimpleJson(): OutputParser {
    return new SimpleJsonParser();
  }

  static createStrictJson(schema: Schema): OutputParser {
    return new StrictJsonParser(schema);
  }

  static createXml(schema?: Schema): OutputParser {
    return new XmlOutputParser(schema);
  }

  static createYaml(schema?: Schema): OutputParser {
    return new YamlOutputParser(schema);
  }

  /**
   * 지원되는 형식 목록
   */
  static getSupportedFormats(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * 형식 감지
   */
  static detectFormat(output: string): OutputFormat | null {
    const trimmed = output.trim();

    // JSON 감지
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        trimmed.includes('```json')) {
      return 'json';
    }

    // XML 감지
    if (trimmed.startsWith('<') && trimmed.endsWith('>') ||
        trimmed.includes('<?xml') ||
        trimmed.includes('```xml')) {
      return 'xml';
    }

    // YAML 감지
    if (trimmed.includes('```yaml') || 
        trimmed.includes('```yml') ||
        /^[\w\s]*:\s*[\s\S]*$/m.test(trimmed)) {
      return 'yaml';
    }

    return null;
  }

  /**
   * 자동 파싱 (형식 자동 감지)
   */
  static async autoParse(output: string, schema?: Schema): Promise<{
    format: OutputFormat | null;
    result: any;
  }> {
    const detectedFormat = this.detectFormat(output);
    
    if (!detectedFormat) {
      throw new Error('Could not detect output format');
    }

    const parser = this.create(detectedFormat, schema);
    const result = await parser.parse(output);

    return {
      format: detectedFormat,
      result
    };
  }
}

/**
 * OutputParser 매니저
 */
export class OutputParserManager {
  private parsers: Map<string, OutputParser> = new Map();
  private defaultParser?: OutputParser;

  constructor() {
    // 기본 파서 초기화
    OutputParserFactory.initialize();
  }

  /**
   * 파서 등록
   */
  registerParser(name: string, parser: OutputParser): void {
    this.parsers.set(name, parser);
  }

  /**
   * 기본 파서 설정
   */
  setDefaultParser(parser: OutputParser): void {
    this.defaultParser = parser;
  }

  /**
   * 파서 조회
   */
  getParser(name: string): OutputParser | undefined {
    return this.parsers.get(name);
  }

  /**
   * 파싱 실행
   */
  async parse(output: string, parserName?: string): Promise<any> {
    let parser: OutputParser | undefined;

    if (parserName) {
      parser = this.getParser(parserName);
      if (!parser) {
        throw new Error(`Parser not found: ${parserName}`);
      }
    } else {
      parser = this.defaultParser;
      if (!parser) {
        // 자동 감지 시도
        const autoResult = await OutputParserFactory.autoParse(output);
        return autoResult.result;
      }
    }

    return await parser.parse(output);
  }

  /**
   * 등록된 파서 목록
   */
  getRegisteredParsers(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * 파서 제거
   */
  removeParser(name: string): boolean {
    return this.parsers.delete(name);
  }

  /**
   * 모든 파서 제거
   */
  clearParsers(): void {
    this.parsers.clear();
    this.defaultParser = undefined;
  }
}

/**
 * 전역 OutputParser 매니저 인스턴스
 */
export const globalOutputParserManager = new OutputParserManager();