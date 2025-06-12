import type { DocumentChunk, ChunkingStrategy, ChunkingService as IChunkingService } from '../types';

/**
 * 문서 청킹 서비스
 * 다양한 전략으로 문서를 청크로 분할
 */
export class ChunkingService implements IChunkingService {
  
  async chunk(content: string, strategy: ChunkingStrategy): Promise<DocumentChunk[]> {
    try {
      switch (strategy.type) {
        case 'token':
          return this.chunkByToken(content, strategy);
        case 'sentence':
          return this.chunkBySentence(content, strategy);
        case 'paragraph':
          return this.chunkByParagraph(content, strategy);
        case 'semantic':
          return this.chunkBySemantic(content, strategy);
        case 'sliding_window':
          return this.chunkBySlidingWindow(content, strategy);
        default:
          throw new Error(`지원되지 않는 청킹 전략: ${strategy.type}`);
      }
    } catch (error) {
      throw new Error(`청킹 처리 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  }

  /**
   * 토큰 기반 청킹
   */
  private chunkByToken(content: string, strategy: ChunkingStrategy): DocumentChunk[] {
    const tokens = this.tokenize(content);
    const chunks: DocumentChunk[] = [];
    
    let currentChunk: string[] = [];
    let startIndex = 0;
    
    for (let i = 0; i < tokens.length; i++) {
      currentChunk.push(tokens[i]);
      
      // 청크 크기 확인
      if (currentChunk.length >= strategy.maxChunkSize) {
        const chunkContent = currentChunk.join(' ');
        chunks.push(this.createChunk(chunkContent, chunks.length, startIndex, this.getCharacterIndex(content, tokens, i)));
        
        // 오버랩 처리
        if (strategy.overlapSize && strategy.overlapSize > 0) {
          const overlapStart = Math.max(0, currentChunk.length - strategy.overlapSize);
          currentChunk = currentChunk.slice(overlapStart);
          startIndex = this.getCharacterIndex(content, tokens, i - strategy.overlapSize + 1);
        } else {
          currentChunk = [];
          startIndex = this.getCharacterIndex(content, tokens, i + 1);
        }
      }
    }
    
    // 마지막 청크 처리
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join(' ');
      chunks.push(this.createChunk(chunkContent, chunks.length, startIndex, content.length));
    }
    
    return chunks;
  }

  /**
   * 문장 기반 청킹
   */
  private chunkBySentence(content: string, strategy: ChunkingStrategy): DocumentChunk[] {
    const separators = strategy.separators || ['.', '!', '?'];
    const sentences = this.splitBySeparators(content, separators);
    const chunks: DocumentChunk[] = [];
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    let startIndex = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      
      if (currentLength + sentence.length > strategy.maxChunkSize && currentChunk.length > 0) {
        // 현재 청크 완성
        const chunkContent = currentChunk.join(' ');
        chunks.push(this.createChunk(chunkContent, chunks.length, startIndex, startIndex + chunkContent.length));
        
        // 오버랩 처리
        if (strategy.overlapSize && strategy.overlapSize > 0) {
          const overlapChunks = this.getOverlapSentences(currentChunk, strategy.overlapSize);
          currentChunk = overlapChunks;
          currentLength = overlapChunks.join(' ').length;
          startIndex = this.findSentenceStartIndex(content, overlapChunks[0]);
        } else {
          currentChunk = [];
          currentLength = 0;
          startIndex = this.findSentenceStartIndex(content, sentence);
        }
      }
      
      currentChunk.push(sentence);
      currentLength += sentence.length + 1; // +1 for space
    }
    
    // 마지막 청크 처리
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join(' ');
      chunks.push(this.createChunk(chunkContent, chunks.length, startIndex, content.length));
    }
    
    return chunks;
  }

  /**
   * 단락 기반 청킹
   */
  private chunkByParagraph(content: string, strategy: ChunkingStrategy): DocumentChunk[] {
    const separators = strategy.separators || ['\n\n', '\r\n\r\n'];
    const paragraphs = this.splitBySeparators(content, separators);
    const chunks: DocumentChunk[] = [];
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    let startIndex = 0;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      if (currentLength + paragraph.length > strategy.maxChunkSize && currentChunk.length > 0) {
        // 현재 청크 완성
        const chunkContent = currentChunk.join('\n\n');
        chunks.push(this.createChunk(chunkContent, chunks.length, startIndex, startIndex + chunkContent.length));
        
        // 새 청크 시작
        currentChunk = [paragraph];
        currentLength = paragraph.length;
        startIndex = content.indexOf(paragraph, startIndex);
      } else {
        currentChunk.push(paragraph);
        currentLength += paragraph.length + 2; // +2 for \n\n
      }
    }
    
    // 마지막 청크 처리
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n\n');
      chunks.push(this.createChunk(chunkContent, chunks.length, startIndex, content.length));
    }
    
    return chunks;
  }

  /**
   * 의미론적 청킹 (간단한 구현)
   */
  private chunkBySemantic(content: string, strategy: ChunkingStrategy): DocumentChunk[] {
    // 의미론적 청킹은 복잡한 NLP 모델이 필요하므로 여기서는 문장 기반으로 대체
    return this.chunkBySentence(content, {
      ...strategy,
      type: 'sentence',
      separators: ['.', '!', '?', ';']
    });
  }

  /**
   * 슬라이딩 윈도우 청킹
   */
  private chunkBySlidingWindow(content: string, strategy: ChunkingStrategy): DocumentChunk[] {
    const tokens = this.tokenize(content);
    const chunks: DocumentChunk[] = [];
    const stepSize = strategy.maxChunkSize - (strategy.overlapSize || 0);
    
    for (let i = 0; i < tokens.length; i += stepSize) {
      const endIndex = Math.min(i + strategy.maxChunkSize, tokens.length);
      const chunkTokens = tokens.slice(i, endIndex);
      const chunkContent = chunkTokens.join(' ');
      
      const startCharIndex = this.getCharacterIndex(content, tokens, i);
      const endCharIndex = this.getCharacterIndex(content, tokens, endIndex - 1);
      
      chunks.push(this.createChunk(chunkContent, chunks.length, startCharIndex, endCharIndex));
      
      if (endIndex >= tokens.length) break;
    }
    
    return chunks;
  }

  /**
   * 텍스트 토큰화 (간단한 공백 기반)
   */
  private tokenize(text: string): string[] {
    return text.trim().split(/\s+/).filter(token => token.length > 0);
  }

  /**
   * 구분자로 텍스트 분할
   */
  private splitBySeparators(text: string, separators: string[]): string[] {
    let result = [text];
    
    for (const separator of separators) {
      const newResult: string[] = [];
      for (const segment of result) {
        newResult.push(...segment.split(separator));
      }
      result = newResult;
    }
    
    return result.filter(segment => segment.trim().length > 0);
  }

  /**
   * 문서 청크 생성
   */
  private createChunk(content: string, index: number, startIndex: number, endIndex: number): DocumentChunk {
    return {
      id: `chunk_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: content.trim(),
      metadata: {
        chunkIndex: index,
        startIndex,
        endIndex,
        length: content.length,
        wordCount: this.tokenize(content).length,
        createdAt: new Date()
      },
      startIndex,
      endIndex,
      parentDocumentId: '' // 나중에 설정됨
    };
  }

  /**
   * 토큰 인덱스에서 문자 인덱스 계산
   */
  private getCharacterIndex(content: string, tokens: string[], tokenIndex: number): number {
    if (tokenIndex <= 0) return 0;
    if (tokenIndex >= tokens.length) return content.length;
    
    const partialTokens = tokens.slice(0, tokenIndex);
    const partialContent = partialTokens.join(' ');
    return content.indexOf(partialContent);
  }

  /**
   * 오버랩할 문장들 선택
   */
  private getOverlapSentences(sentences: string[], overlapSize: number): string[] {
    if (overlapSize >= sentences.length) return [...sentences];
    return sentences.slice(-overlapSize);
  }

  /**
   * 문장의 시작 인덱스 찾기
   */
  private findSentenceStartIndex(content: string, sentence: string): number {
    return content.indexOf(sentence.trim());
  }
}