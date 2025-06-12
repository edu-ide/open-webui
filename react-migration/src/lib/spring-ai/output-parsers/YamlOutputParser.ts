import { BaseOutputParser } from './BaseOutputParser';
import type { ParseResult, Schema, ParseOptions } from './types';

/**
 * YAML 출력 파서
 */
export class YamlOutputParser<T = any> extends BaseOutputParser<T> {
  constructor(schema?: Schema, options?: ParseOptions) {
    super('yaml', schema, options);
  }

  async parse(output: string): Promise<ParseResult<T>> {
    return this.parseSync(output);
  }

  parseSync(output: string): ParseResult<T> {
    try {
      // 1. 코드 블록에서 YAML 추출
      const extractedYaml = this.extractCodeBlock(output, 'yaml') || 
                           this.extractCodeBlock(output, 'yml') || 
                           this.extractYaml(output);
      
      // 2. YAML 파싱 (간단한 파서 사용)
      const parsedData = this.parseYamlToObject(extractedYaml);

      // 3. 스키마 검증
      if (this._schema) {
        const validationResult = this.validate(parsedData);
        if (!validationResult.success) {
          return validationResult;
        }
      }

      return this.createSuccessResult(parsedData, output);

    } catch (error) {
      return this.createParseError(
        `YAML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'YAML_PARSE_ERROR',
        output
      );
    }
  }

  getInstructions(): string {
    return `응답을 YAML 형식으로 제공해주세요. 예시:
\`\`\`yaml
name: example
items:
  - id: 1
    value: "first item"
  - id: 2
    value: "second item"
settings:
  enabled: true
  count: 42
\`\`\`

**중요 사항:**
- 들여쓰기를 정확히 맞춰주세요 (스페이스 2개 권장)
- 키: 값 형식을 사용하세요
- 리스트는 - 기호를 사용하세요`;
  }

  /**
   * YAML 텍스트 추출
   */
  private extractYaml(output: string): string {
    // YAML 형태의 패턴을 찾는 정규식
    const yamlPattern = /^[\w\s]*:\s*[\s\S]*$/m;
    const match = output.match(yamlPattern);
    
    if (match) {
      return match[0];
    }

    return output;
  }

  /**
   * 간단한 YAML 파서
   */
  private parseYamlToObject(yamlString: string): any {
    const lines = yamlString.split('\n').map(line => line.replace(/\t/g, '  ')); // 탭을 스페이스로 변환
    const result: any = {};
    const stack: Array<{ obj: any; indent: number }> = [{ obj: result, indent: -1 }];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 빈 줄이나 주석 건너뛰기
      if (!line.trim() || line.trim().startsWith('#')) {
        continue;
      }

      const indent = this.getIndentation(line);
      const trimmedLine = line.trim();

      // 스택에서 현재 들여쓰기 레벨에 맞는 객체 찾기
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const currentObj = stack[stack.length - 1].obj;

      if (trimmedLine.startsWith('- ')) {
        // 배열 아이템
        this.handleArrayItem(currentObj, trimmedLine, indent, stack);
      } else if (trimmedLine.includes(':')) {
        // 키-값 쌍
        this.handleKeyValue(currentObj, trimmedLine, indent, stack);
      }
    }

    return result;
  }

  /**
   * 들여쓰기 레벨 계산
   */
  private getIndentation(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * 배열 아이템 처리
   */
  private handleArrayItem(
    currentObj: any, 
    line: string, 
    indent: number, 
    stack: Array<{ obj: any; indent: number }>
  ): void {
    const content = line.substring(2).trim(); // '- ' 제거
    
    // 현재 객체가 배열이 아니면 배열로 만들기
    if (!Array.isArray(currentObj)) {
      // 마지막 키를 찾아서 배열로 설정
      const keys = Object.keys(currentObj);
      const lastKey = keys[keys.length - 1];
      if (lastKey && !Array.isArray(currentObj[lastKey])) {
        currentObj[lastKey] = [];
      }
    }

    if (content.includes(':')) {
      // 객체 아이템
      const newObj: any = {};
      const arr = this.getOrCreateArray(currentObj);
      arr.push(newObj);
      
      this.handleKeyValue(newObj, content, indent, stack);
      stack.push({ obj: newObj, indent });
    } else {
      // 단순 값 아이템
      const arr = this.getOrCreateArray(currentObj);
      arr.push(this.parseValue(content));
    }
  }

  /**
   * 키-값 쌍 처리
   */
  private handleKeyValue(
    currentObj: any, 
    line: string, 
    indent: number, 
    stack: Array<{ obj: any; indent: number }>
  ): void {
    const colonIndex = line.indexOf(':');
    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    if (!value) {
      // 값이 없는 경우 (다음 줄에 중첩된 내용이 있을 것)
      currentObj[key] = {};
      stack.push({ obj: currentObj[key], indent });
    } else if (value.startsWith('[') && value.endsWith(']')) {
      // 인라인 배열
      currentObj[key] = this.parseInlineArray(value);
    } else if (value.startsWith('{') && value.endsWith('}')) {
      // 인라인 객체
      currentObj[key] = this.parseInlineObject(value);
    } else {
      // 단순 값
      currentObj[key] = this.parseValue(value);
    }
  }

  /**
   * 배열 가져오기 또는 생성
   */
  private getOrCreateArray(obj: any): any[] {
    const keys = Object.keys(obj);
    const lastKey = keys[keys.length - 1];
    
    if (lastKey && !Array.isArray(obj[lastKey])) {
      obj[lastKey] = [];
    }
    
    return obj[lastKey] || [];
  }

  /**
   * 인라인 배열 파싱
   */
  private parseInlineArray(value: string): any[] {
    const content = value.slice(1, -1).trim(); // [ ] 제거
    if (!content) return [];
    
    return content.split(',').map(item => this.parseValue(item.trim()));
  }

  /**
   * 인라인 객체 파싱
   */
  private parseInlineObject(value: string): any {
    const content = value.slice(1, -1).trim(); // { } 제거
    if (!content) return {};
    
    const result: any = {};
    const pairs = content.split(',');
    
    for (const pair of pairs) {
      const [key, val] = pair.split(':').map(s => s.trim());
      if (key && val !== undefined) {
        result[key.replace(/['"]/g, '')] = this.parseValue(val);
      }
    }
    
    return result;
  }

  /**
   * 값 타입 파싱
   */
  private parseValue(value: string): any {
    // 따옴표 제거
    const cleanValue = value.replace(/^["']|["']$/g, '');
    
    // 숫자인지 확인
    if (/^\d+$/.test(cleanValue)) {
      return parseInt(cleanValue, 10);
    }
    
    if (/^\d*\.\d+$/.test(cleanValue)) {
      return parseFloat(cleanValue);
    }
    
    // 불린값인지 확인
    if (cleanValue.toLowerCase() === 'true') return true;
    if (cleanValue.toLowerCase() === 'false') return false;
    
    // null인지 확인
    if (cleanValue.toLowerCase() === 'null' || cleanValue === '~') return null;
    
    return cleanValue;
  }
}