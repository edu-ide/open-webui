import { BaseDocumentParser } from './BaseDocumentParser';
import type { Document } from '../types';

/**
 * 텍스트 문서 파서 (TXT, MD 등)
 */
export class TextDocumentParser extends BaseDocumentParser {
  supportedMimeTypes = [
    'text/plain',
    'text/markdown',
    'application/json',
    'text/csv'
  ];

  async parse(file: File): Promise<Document> {
    try {
      const content = await this.readFileAsText(file);
      const cleanedContent = this.cleanText(content);
      
      const document = this.createBaseDocument(file, cleanedContent);
      
      // 파일 타입별 추가 메타데이터
      const additionalMetadata = this.extractAdditionalMetadata(file, content);
      document.metadata = this.mergeMetadata(document.metadata, additionalMetadata);
      
      return document;
      
    } catch (error) {
      throw new Error(`텍스트 파일 파싱 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * 파일 타입별 추가 메타데이터 추출
   */
  private extractAdditionalMetadata(file: File, content: string): Record<string, any> {
    const metadata: Record<string, any> = {
      characterCount: content.length,
      lineCount: content.split('\n').length,
      wordCount: this.countWords(content)
    };

    switch (file.type) {
      case 'text/markdown':
        metadata.markdownMetadata = this.extractMarkdownMetadata(content);
        break;
      case 'application/json':
        metadata.jsonMetadata = this.extractJsonMetadata(content);
        break;
      case 'text/csv':
        metadata.csvMetadata = this.extractCsvMetadata(content);
        break;
    }

    return metadata;
  }

  /**
   * 단어 수 계산
   */
  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Markdown 메타데이터 추출
   */
  private extractMarkdownMetadata(content: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // 제목 수준별 카운트
    const headings = content.match(/^#+\s+(.+)$/gm) || [];
    metadata.headingCount = headings.length;
    
    if (headings.length > 0) {
      metadata.headings = headings.map(heading => {
        const level = heading.match(/^#+/)?.[0].length || 0;
        const text = heading.replace(/^#+\s+/, '');
        return { level, text };
      });
    }

    // 링크 개수
    const links = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    metadata.linkCount = links.length;

    // 이미지 개수
    const images = content.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
    metadata.imageCount = images.length;

    // 코드 블록 개수
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    metadata.codeBlockCount = codeBlocks.length;

    return metadata;
  }

  /**
   * JSON 메타데이터 추출
   */
  private extractJsonMetadata(content: string): Record<string, any> {
    try {
      const jsonData = JSON.parse(content);
      return {
        isValidJson: true,
        jsonKeys: Object.keys(jsonData),
        jsonDepth: this.calculateJsonDepth(jsonData),
        dataType: Array.isArray(jsonData) ? 'array' : typeof jsonData
      };
    } catch (error) {
      return {
        isValidJson: false,
        parseError: error instanceof Error ? error.message : '알 수 없는 오류'
      };
    }
  }

  /**
   * CSV 메타데이터 추출
   */
  private extractCsvMetadata(content: string): Record<string, any> {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
      return { rowCount: 0, columnCount: 0 };
    }

    // 첫 번째 줄을 헤더로 가정
    const headers = lines[0].split(',').map(h => h.trim());
    
    return {
      rowCount: lines.length - 1, // 헤더 제외
      columnCount: headers.length,
      headers: headers,
      hasHeader: true
    };
  }

  /**
   * JSON 깊이 계산
   */
  private calculateJsonDepth(obj: any): number {
    if (typeof obj !== 'object' || obj === null) {
      return 0;
    }

    let maxDepth = 1;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const depth = 1 + this.calculateJsonDepth(obj[key]);
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }
}