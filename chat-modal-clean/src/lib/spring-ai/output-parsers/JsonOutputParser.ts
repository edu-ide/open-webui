import { BaseOutputParser } from './BaseOutputParser';
import type { ParseResult, Schema, ParseOptions } from './types';

/**
 * JSON 출력 파서
 */
export class JsonOutputParser<T = any> extends BaseOutputParser<T> {
  constructor(schema?: Schema, options?: ParseOptions) {
    super('json', schema, options);
  }

  async parse(output: string): Promise<ParseResult<T>> {
    return this.parseSync(output);
  }

  parseSync(output: string): ParseResult<T> {
    try {
      // 1. 코드 블록에서 JSON 추출
      const extractedJson = this.extractCodeBlock(output, 'json') || this.extractJson(output);
      
      // 2. JSON 파싱
      let parsedData: any;
      try {
        parsedData = JSON.parse(extractedJson);
      } catch (parseError) {
        // JSON 파싱 실패 시 문자열 정리 후 재시도
        const cleanedJson = this.cleanJsonString(extractedJson);
        parsedData = JSON.parse(cleanedJson);
      }

      // 3. 스키마 검증
      if (this._schema) {
        const validationResult = this.validate(parsedData);
        if (!validationResult.success) {
          return validationResult;
        }
      }

      // 4. 타입 변환 (옵션)
      const transformedData = this.transformData(parsedData);

      return this.createSuccessResult(transformedData, output);

    } catch (error) {
      return this.createParseError(
        `JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'JSON_PARSE_ERROR',
        output
      );
    }
  }

  getInstructions(): string {
    if (!this._schema) {
      return `응답을 JSON 형식으로 제공해주세요. 예시:
\`\`\`json
{
  "key": "value"
}
\`\`\``;
    }

    const schemaExample = this.generateExampleFromSchema(this._schema);
    
    return `응답을 다음 JSON 스키마에 맞춰 제공해주세요:

**스키마:**
${JSON.stringify(this._schema, null, 2)}

**예시 형식:**
\`\`\`json
${JSON.stringify(schemaExample, null, 2)}
\`\`\`

**중요 사항:**
- 반드시 유효한 JSON 형식을 사용하세요
- 모든 필수 필드를 포함하세요
- 데이터 타입을 정확히 맞춰주세요`;
  }

  /**
   * JSON 문자열 정리
   */
  private cleanJsonString(jsonStr: string): string {
    return jsonStr
      .replace(/,\s*}/g, '}')     // 객체 끝의 trailing comma 제거
      .replace(/,\s*]/g, ']')     // 배열 끝의 trailing comma 제거
      .replace(/'/g, '"')         // 단일 따옴표를 이중 따옴표로
      .replace(/(\w+):/g, '"$1":') // 키를 따옴표로 감싸기
      .trim();
  }

  /**
   * 데이터 변환 (키 변환 등)
   */
  private transformData(data: any): T {
    if (!this.options.transformKeys) {
      return data;
    }

    return this.transformKeys(data, this.options.transformKeys) as T;
  }

  /**
   * 키 변환 함수
   */
  private transformKeys(obj: any, transformType: string): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.transformKeys(item, transformType));
    }

    if (obj !== null && typeof obj === 'object') {
      const transformed: any = {};
      
      for (const [key, value] of Object.entries(obj)) {
        const newKey = this.transformKey(key, transformType);
        transformed[newKey] = this.transformKeys(value, transformType);
      }
      
      return transformed;
    }

    return obj;
  }

  /**
   * 개별 키 변환
   */
  private transformKey(key: string, transformType: string): string {
    switch (transformType) {
      case 'camelCase':
        return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      case 'snake_case':
        return key.replace(/([A-Z])/g, '_$1').toLowerCase();
      case 'kebab-case':
        return key.replace(/([A-Z])/g, '-$1').toLowerCase();
      default:
        return key;
    }
  }

  /**
   * 스키마에서 예시 데이터 생성
   */
  private generateExampleFromSchema(schema: Schema): any {
    switch (schema.type) {
      case 'string':
        if (schema.enum) return schema.enum[0];
        return schema.format === 'email' ? 'example@email.com' : 'example';
        
      case 'number':
      case 'integer':
        return 42;
        
      case 'boolean':
        return true;
        
      case 'array':
        if (schema.items) {
          return [this.generateExampleFromSchema(schema.items)];
        }
        return [];
        
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.generateExampleFromSchema(propSchema as Schema);
          }
        }
        return obj;
        
      case 'null':
        return null;
        
      default:
        return null;
    }
  }
}

/**
 * 사전 정의된 JSON 파서들
 */
export class SimpleJsonParser extends JsonOutputParser<any> {
  constructor() {
    super(undefined, { strict: false, allowPartial: true });
  }
}

export class StrictJsonParser<T> extends JsonOutputParser<T> {
  constructor(schema: Schema) {
    super(schema, { strict: true, allowPartial: false });
  }
}