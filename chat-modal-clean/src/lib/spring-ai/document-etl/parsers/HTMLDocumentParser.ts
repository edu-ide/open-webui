import { BaseDocumentParser } from './BaseDocumentParser';
import type { Document as ETLDocument } from '../types';

/**
 * HTML 문서 파서
 */
export class HTMLDocumentParser extends BaseDocumentParser {
  supportedMimeTypes = [
    'text/html',
    'application/xhtml+xml'
  ];

  async parse(file: File): Promise<ETLDocument> {
    try {
      const htmlContent = await this.readFileAsText(file);
      const textContent = this.extractTextFromHTML(htmlContent);
      const cleanedContent = this.cleanText(textContent);
      
      const document = this.createBaseDocument(file, cleanedContent);
      
      // HTML 특화 메타데이터 추가
      const htmlMetadata = this.extractHTMLMetadata(htmlContent);
      document.metadata = this.mergeMetadata(document.metadata, {
        originalHTML: htmlContent.length < 10000 ? htmlContent : '[HTML too large to store]',
        ...htmlMetadata
      });
      
      return document;
      
    } catch (error) {
      throw new Error(`HTML 파일 파싱 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * HTML에서 텍스트 추출
   */
  private extractTextFromHTML(html: string): string {
    // DOMParser를 사용하여 HTML 파싱
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 불필요한 요소들 제거
    const elementsToRemove = ['script', 'style', 'nav', 'header', 'footer', 'aside'];
    elementsToRemove.forEach(tagName => {
      const elements = doc.querySelectorAll(tagName);
      elements.forEach(element => element.remove());
    });
    
    // 텍스트 내용 추출
    const textContent = doc.body?.textContent || doc.textContent || '';
    
    return textContent;
  }

  /**
   * HTML 메타데이터 추출
   */
  private extractHTMLMetadata(html: string): Record<string, any> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html') as any;
    
    const metadata: Record<string, any> = {};
    
    // 기본 정보
    metadata.title = doc.title || '';
    metadata.language = doc.documentElement.lang || '';
    
    // 메타 태그들
    const metaTags = doc.querySelectorAll('meta');
    const metaData: Record<string, string> = {};
    
    metaTags.forEach((meta: any) => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      
      if (name && content) {
        metaData[name] = content;
      }
    });
    
    metadata.metaTags = metaData;
    
    // 구조 분석
    metadata.structure = {
      headings: this.extractHeadings(doc),
      links: this.extractLinks(doc),
      images: this.extractImages(doc),
      paragraphs: doc.querySelectorAll('p').length,
      lists: doc.querySelectorAll('ul, ol').length,
      tables: doc.querySelectorAll('table').length
    };
    
    return metadata;
  }

  /**
   * 제목 구조 추출
   */
  private extractHeadings(doc: any): Array<{level: number, text: string}> {
    const headings: Array<{level: number, text: string}> = [];
    
    for (let i = 1; i <= 6; i++) {
      const elements = doc.querySelectorAll(`h${i}`);
      elements.forEach((element: any) => {
        headings.push({
          level: i,
          text: element.textContent?.trim() || ''
        });
      });
    }
    
    return headings.sort((a, b) => {
      // DOM 순서 유지를 위해 원본 순서대로 정렬 (간단 구현)
      return a.level - b.level;
    });
  }

  /**
   * 링크 정보 추출
   */
  private extractLinks(doc: any): Array<{text: string, href: string, external: boolean}> {
    const links: Array<{text: string, href: string, external: boolean}> = [];
    const linkElements = doc.querySelectorAll('a[href]');
    
    linkElements.forEach((link: any) => {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.trim() || '';
      const external = href.startsWith('http') && !href.includes(window.location.hostname);
      
      if (href && text) {
        links.push({ text, href, external });
      }
    });
    
    return links;
  }

  /**
   * 이미지 정보 추출
   */
  private extractImages(doc: any): Array<{alt: string, src: string, title?: string}> {
    const images: Array<{alt: string, src: string, title?: string}> = [];
    const imgElements = doc.querySelectorAll('img');
    
    imgElements.forEach((img: any) => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      const title = img.getAttribute('title') || undefined;
      
      if (src) {
        images.push({ alt, src, title });
      }
    });
    
    return images;
  }
}