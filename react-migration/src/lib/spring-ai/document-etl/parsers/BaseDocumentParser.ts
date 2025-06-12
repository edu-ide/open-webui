import type { Document, DocumentParser } from '../types';

/**
 * 기본 문서 파서 추상 클래스
 */
export abstract class BaseDocumentParser implements DocumentParser {
  abstract supportedMimeTypes: string[];

  canParse(mimeType: string): boolean {
    return this.supportedMimeTypes.includes(mimeType);
  }

  abstract parse(file: File): Promise<Document>;

  /**
   * 기본 문서 메타데이터 생성
   */
  protected createBaseDocument(file: File, content: string): Document {
    return {
      id: this.generateDocumentId(file),
      content: content,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        lastModified: new Date(file.lastModified),
        parsedAt: new Date(),
        encoding: 'utf-8'
      },
      source: file.name,
      mimeType: file.type
    };
  }

  /**
   * 문서 ID 생성
   */
  protected generateDocumentId(file: File): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const fileName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
    return `doc_${fileName}_${timestamp}_${random}`;
  }

  /**
   * 파일 읽기 유틸리티
   */
  protected readFileAsText(file: File, encoding: string = 'utf-8'): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('파일을 텍스트로 읽을 수 없습니다'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error(`파일 읽기 실패: ${reader.error?.message}`));
      };
      
      reader.readAsText(file, encoding);
    });
  }

  /**
   * 파일을 ArrayBuffer로 읽기
   */
  protected readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        const result = event.target?.result;
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          reject(new Error('파일을 ArrayBuffer로 읽을 수 없습니다'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error(`파일 읽기 실패: ${reader.error?.message}`));
      };
      
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 기본 텍스트 정리
   */
  protected cleanText(text: string): string {
    return text
      // 과도한 공백 제거
      .replace(/\s+/g, ' ')
      // 연속된 줄바꿈 정리
      .replace(/\n\s*\n/g, '\n\n')
      // 앞뒤 공백 제거
      .trim();
  }

  /**
   * 메타데이터 병합
   */
  protected mergeMetadata(base: Record<string, any>, additional: Record<string, any>): Record<string, any> {
    return { ...base, ...additional };
  }
}