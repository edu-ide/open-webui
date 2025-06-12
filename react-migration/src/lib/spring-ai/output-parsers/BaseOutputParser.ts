import type { 
  OutputParser, 
  ParseResult, 
  ParseError, 
  Schema, 
  ParseOptions,
  OutputFormat
} from './types';

/**
 * 기본 OutputParser 추상 클래스
 */
export abstract class BaseOutputParser<T = any> implements OutputParser<T> {
  protected _schema?: Schema;
  protected options: ParseOptions;
  public readonly formatType: OutputFormat;

  constructor(
    formatType: OutputFormat,
    schema?: Schema,
    options: ParseOptions = {}
  ) {
    this.formatType = formatType;
    this._schema = schema;
    this.options = {
      strict: true,
      allowPartial: false,
      maxRetries: 3,
      ...options
    };
  }

  get schema(): Schema | undefined {
    return this._schema;
  }

  abstract parse(output: string): Promise<ParseResult<T>>;
  abstract parseSync(output: string): ParseResult<T>;
  abstract getInstructions(): string;

  setSchema(schema: Schema): void {
    this._schema = schema;
  }

  getSchema(): Schema | undefined {
    return this._schema;
  }

  /**
   * 스키마 기반 데이터 검증
   */
  validate(data: any): ParseResult<T> {
    if (!this._schema) {
      return {
        success: true,
        data,
        rawOutput: JSON.stringify(data),
        parsedAt: new Date()
      };
    }

    const errors: ParseError[] = [];
    const isValid = this.validateValue(data, this._schema, '', errors);

    return {
      success: isValid && errors.length === 0,
      data: isValid ? data : undefined,
      errors: errors.length > 0 ? errors : undefined,
      rawOutput: JSON.stringify(data),
      parsedAt: new Date()
    };
  }

  /**
   * 재귀적 값 검증
   */
  protected validateValue(
    value: any, 
    schema: Schema, 
    path: string, 
    errors: ParseError[]
  ): boolean {
    // null/undefined 체크
    if (value === null || value === undefined) {
      if (schema.type !== 'null') {
        errors.push({
          path,
          message: `Expected ${schema.type}, got null/undefined`,
          code: 'TYPE_MISMATCH',
          value
        });
        return false;
      }
      return true;
    }

    // 타입 검증
    if (!this.validateType(value, schema.type)) {
      errors.push({
        path,
        message: `Expected ${schema.type}, got ${typeof value}`,
        code: 'TYPE_MISMATCH',
        value
      });
      return false;
    }

    // 타입별 상세 검증
    switch (schema.type) {
      case 'object':
        return this.validateObject(value, schema, path, errors);
      case 'array':
        return this.validateArray(value, schema, path, errors);
      case 'string':
        return this.validateString(value, schema, path, errors);
      case 'number':
        return this.validateNumber(value, schema, path, errors);
      default:
        return true;
    }
  }

  protected validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'null':
        return value === null;
      default:
        return true;
    }
  }

  protected validateObject(
    value: any, 
    schema: Schema, 
    path: string, 
    errors: ParseError[]
  ): boolean {
    let isValid = true;

    // 필수 속성 체크
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in value)) {
          errors.push({
            path: `${path}.${requiredProp}`,
            message: `Missing required property: ${requiredProp}`,
            code: 'MISSING_PROPERTY',
            value: undefined
          });
          isValid = false;
        }
      }
    }

    // 각 속성 검증
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in value) {
          const propPath = path ? `${path}.${propName}` : propName;
          if (!this.validateValue(value[propName], propSchema as Schema, propPath, errors)) {
            isValid = false;
          }
        }
      }
    }

    return isValid;
  }

  protected validateArray(
    value: any[], 
    schema: Schema, 
    path: string, 
    errors: ParseError[]
  ): boolean {
    let isValid = true;

    if (schema.items) {
      value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (!this.validateValue(item, schema.items!, itemPath, errors)) {
          isValid = false;
        }
      });
    }

    return isValid;
  }

  protected validateString(
    value: string, 
    schema: Schema, 
    path: string, 
    errors: ParseError[]
  ): boolean {
    let isValid = true;

    // enum 체크
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        code: 'INVALID_ENUM',
        value
      });
      isValid = false;
    }

    return isValid;
  }

  protected validateNumber(
    _value: number, 
    _schema: Schema, 
    _path: string, 
    _errors: ParseError[]
  ): boolean {
    // 기본적인 숫자 검증만 구현
    return true;
  }

  /**
   * 파싱 오류 처리 헬퍼
   */
  protected createParseError(
    message: string, 
    code: string, 
    rawOutput: string
  ): ParseResult<T> {
    return {
      success: false,
      errors: [{
        path: '',
        message,
        code,
        value: rawOutput
      }],
      rawOutput,
      parsedAt: new Date()
    };
  }

  /**
   * 성공 결과 생성 헬퍼
   */
  protected createSuccessResult(data: T, rawOutput: string): ParseResult<T> {
    return {
      success: true,
      data,
      rawOutput,
      parsedAt: new Date()
    };
  }

  /**
   * 출력에서 코드 블록 추출
   */
  protected extractCodeBlock(output: string, language?: string): string {
    const patterns = [
      // 언어 지정된 코드 블록
      language ? new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\`\`\``, 'i') : null,
      // 일반 코드 블록
      /```\w*\s*([\s\S]*?)```/,
      // 인라인 코드
      /`([^`]+)`/
    ].filter(Boolean) as RegExp[];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return output.trim();
  }

  /**
   * JSON 형태의 텍스트에서 JSON 추출
   */
  protected extractJson(output: string): string {
    // JSON 객체나 배열을 찾는 정규식
    const jsonPattern = /[\{\[][\s\S]*[\}\]]/;
    const match = output.match(jsonPattern);
    
    if (match) {
      return match[0];
    }

    return output;
  }
}