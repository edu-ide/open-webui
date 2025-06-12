import { BaseOutputParser } from './BaseOutputParser';
import type { ParseResult, Schema, ParseOptions } from './types';

/**
 * XML 출력 파서
 */
export class XmlOutputParser<T = any> extends BaseOutputParser<T> {
  constructor(schema?: Schema, options?: ParseOptions) {
    super('xml', schema, options);
  }

  async parse(output: string): Promise<ParseResult<T>> {
    return this.parseSync(output);
  }

  parseSync(output: string): ParseResult<T> {
    try {
      // 1. 코드 블록에서 XML 추출
      const extractedXml = this.extractCodeBlock(output, 'xml') || this.extractXml(output);
      
      // 2. XML 파싱
      const parsedData = this.parseXmlToObject(extractedXml);

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
        `XML parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'XML_PARSE_ERROR',
        output
      );
    }
  }

  getInstructions(): string {
    return `응답을 XML 형식으로 제공해주세요. 예시:
\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<root>
  <item>
    <name>value</name>
    <type>example</type>
  </item>
</root>
\`\`\`

**중요 사항:**
- 유효한 XML 형식을 사용하세요
- 태그를 올바르게 닫아주세요
- 특수 문자는 이스케이프 처리하세요`;
  }

  /**
   * XML 텍스트 추출
   */
  private extractXml(output: string): string {
    // XML 선언이나 루트 태그를 찾는 정규식
    const xmlPattern = /(<\?xml.*?\?>)?[\s\S]*?<[^>]+>[\s\S]*<\/[^>]+>/;
    const match = output.match(xmlPattern);
    
    if (match) {
      return match[0];
    }

    return output;
  }

  /**
   * 간단한 XML 파서 (DOMParser 사용)
   */
  private parseXmlToObject(xmlString: string): any {
    // 브라우저 환경에서 DOMParser 사용
    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, 'text/xml');
      
      // 파싱 오류 체크
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        throw new Error(`XML parsing error: ${parseError.textContent}`);
      }
      
      return this.xmlNodeToObject(doc.documentElement);
    }
    
    // Node.js 환경이나 DOMParser가 없는 경우 간단한 파싱
    return this.simpleXmlParse(xmlString);
  }

  /**
   * XML Node를 객체로 변환
   */
  private xmlNodeToObject(node: Element): any {
    const result: any = {};

    // 속성 처리
    if (node.attributes.length > 0) {
      result['@attributes'] = {};
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        result['@attributes'][attr.name] = attr.value;
      }
    }

    // 자식 노드 처리
    const children = Array.from(node.children);
    
    if (children.length === 0) {
      // 텍스트 노드인 경우
      const textContent = node.textContent?.trim();
      if (textContent) {
        return this.parseValue(textContent);
      }
      return null;
    }

    // 자식 노드들을 그룹화
    const childGroups: { [key: string]: Element[] } = {};
    children.forEach(child => {
      if (!childGroups[child.tagName]) {
        childGroups[child.tagName] = [];
      }
      childGroups[child.tagName].push(child);
    });

    // 각 그룹 처리
    for (const [tagName, childNodes] of Object.entries(childGroups)) {
      if (childNodes.length === 1) {
        result[tagName] = this.xmlNodeToObject(childNodes[0]);
      } else {
        result[tagName] = childNodes.map(child => this.xmlNodeToObject(child));
      }
    }

    return result;
  }

  /**
   * 간단한 XML 파싱 (폴백)
   */
  private simpleXmlParse(xmlString: string): any {
    // 매우 간단한 XML 파싱 - 실제 환경에서는 더 정교한 파서 필요
    const result: any = {};
    
    // 태그 매칭 정규식
    const tagPattern = /<(\w+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
    let match;
    
    while ((match = tagPattern.exec(xmlString)) !== null) {
      const [, tagName, content] = match;
      result[tagName] = this.parseValue(content.trim());
    }
    
    return result;
  }

  /**
   * 값 타입 파싱
   */
  private parseValue(value: string): any {
    // 숫자인지 확인
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // 불린값인지 확인
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // null인지 확인
    if (value.toLowerCase() === 'null') return null;
    
    return value;
  }
}