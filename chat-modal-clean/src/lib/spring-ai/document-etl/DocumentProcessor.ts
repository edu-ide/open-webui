import type { 
  Document, 
  DocumentChunk, 
  DocumentProcessor as IDocumentProcessor,
  ETLPipelineConfig,
  ETLResult,
  PreprocessingConfig,
  ChunkingStrategy,
  ETLProgress,
  ETLEvent,
  ETLEventListener
} from './types';

import { TextDocumentParser } from './parsers/TextDocumentParser';
import { HTMLDocumentParser } from './parsers/HTMLDocumentParser';
import { ChunkingService } from './services/ChunkingService';

/**
 * 문서 ETL 파이프라인 프로세서
 */
export class DocumentProcessor implements IDocumentProcessor {
  private parsers: Map<string, any> = new Map();
  private chunkingService: ChunkingService;
  private eventListeners: ETLEventListener[] = [];

  constructor() {
    this.initializeParsers();
    this.chunkingService = new ChunkingService();
  }

  /**
   * 파서들 초기화
   */
  private initializeParsers() {
    const textParser = new TextDocumentParser();
    const htmlParser = new HTMLDocumentParser();

    // 텍스트 파서 등록
    textParser.supportedMimeTypes.forEach(mimeType => {
      this.parsers.set(mimeType, textParser);
    });

    // HTML 파서 등록
    htmlParser.supportedMimeTypes.forEach(mimeType => {
      this.parsers.set(mimeType, htmlParser);
    });
  }

  /**
   * 이벤트 리스너 등록
   */
  addEventListener(listener: ETLEventListener) {
    this.eventListeners.push(listener);
  }

  /**
   * 이벤트 리스너 제거
   */
  removeEventListener(listener: ETLEventListener) {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * 이벤트 발생
   */
  private emitEvent(event: ETLEvent) {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('ETL 이벤트 리스너 오류:', error);
      }
    });
  }

  /**
   * 진행 상황 업데이트
   */
  private updateProgress(jobId: string, progress: Partial<ETLProgress>) {
    this.emitEvent({
      type: 'progress',
      jobId,
      data: progress,
      timestamp: new Date()
    });
  }

  /**
   * 스테이지 변경
   */
  private changeStage(jobId: string, stage: ETLProgress['stage'], step: string) {
    this.emitEvent({
      type: 'stage_change',
      jobId,
      data: { stage, currentStep: step },
      timestamp: new Date()
    });
  }

  /**
   * 메인 프로세싱 함수
   */
  async processDocument(file: File, config: ETLPipelineConfig): Promise<ETLResult> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    try {
      // 1. 파싱 단계
      this.changeStage(jobId, 'parsing', '문서 파싱 중...');
      this.updateProgress(jobId, { progress: 10, currentStepIndex: 1, totalSteps: 6 });
      
      const document = await this.parseDocument(file);

      // 2. 전처리 단계
      this.changeStage(jobId, 'preprocessing', '문서 전처리 중...');
      this.updateProgress(jobId, { progress: 25, currentStepIndex: 2 });
      
      const preprocessedDocument = await this.preprocessDocument(document, config.preprocessing);

      // 3. 청킹 단계
      this.changeStage(jobId, 'chunking', '문서 청킹 중...');
      this.updateProgress(jobId, { progress: 50, currentStepIndex: 3 });
      
      const chunks = await this.chunkDocument(preprocessedDocument, config.chunkingStrategy);

      // 4. 임베딩 단계
      this.changeStage(jobId, 'embedding', '임베딩 생성 중...');
      this.updateProgress(jobId, { progress: 75, currentStepIndex: 4 });
      
      const embeddedChunks = await this.embedChunks(chunks, config.embeddingModel);

      // 5. 저장 단계
      this.changeStage(jobId, 'storing', '벡터 저장소에 저장 중...');
      this.updateProgress(jobId, { progress: 90, currentStepIndex: 5 });
      
      await this.storeChunks(embeddedChunks, config.vectorStore);

      // 6. 완료
      this.changeStage(jobId, 'completed', '처리 완료');
      this.updateProgress(jobId, { progress: 100, currentStepIndex: 6 });

      const processingTime = Date.now() - startTime.getTime();
      
      const result: ETLResult = {
        success: true,
        documentId: document.id,
        totalChunks: embeddedChunks.length,
        processingTime,
        chunks: embeddedChunks,
        metadata: {
          originalSize: file.size,
          processedSize: preprocessedDocument.content.length,
          chunkSizes: chunks.map(chunk => chunk.content.length),
          embeddingDimensions: embeddedChunks[0]?.embedding?.length
        }
      };

      this.emitEvent({
        type: 'completed',
        jobId,
        data: result,
        timestamp: new Date()
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      
      this.changeStage(jobId, 'error', `오류 발생: ${errorMessage}`);
      
      this.emitEvent({
        type: 'error',
        jobId,
        data: { error: errorMessage },
        timestamp: new Date()
      });

      return {
        success: false,
        documentId: '',
        totalChunks: 0,
        processingTime: Date.now() - startTime.getTime(),
        error: errorMessage
      };
    }
  }

  /**
   * 문서 파싱
   */
  async parseDocument(file: File): Promise<Document> {
    const parser = this.parsers.get(file.type);
    
    if (!parser) {
      throw new Error(`지원되지 않는 파일 형식: ${file.type}`);
    }

    return await parser.parse(file);
  }

  /**
   * 문서 전처리
   */
  async preprocessDocument(document: Document, config: PreprocessingConfig): Promise<Document> {
    let content = document.content;

    // 헤더/푸터 제거 (간단한 휴리스틱)
    if (config.removeHeaders) {
      content = this.removeHeaders(content);
    }

    if (config.removeFooters) {
      content = this.removeFooters(content);
    }

    // 공백 정규화
    if (config.normalizeWhitespace) {
      content = content.replace(/\s+/g, ' ');
    }

    // 빈 줄 제거
    if (config.removeEmptyLines) {
      content = content.replace(/\n\s*\n/g, '\n');
    }

    // 소문자 변환
    if (config.convertToLowercase) {
      content = content.toLowerCase();
    }

    // 특수 문자 제거
    if (config.removeSpecialCharacters) {
      content = content.replace(/[^\w\s\.\,\!\?\;\:\-]/g, '');
    }

    return {
      ...document,
      content: content.trim(),
      metadata: {
        ...document.metadata,
        preprocessed: true,
        preprocessingConfig: config,
        originalLength: document.content.length,
        processedLength: content.length
      }
    };
  }

  /**
   * 문서 청킹
   */
  async chunkDocument(document: Document, strategy: ChunkingStrategy): Promise<DocumentChunk[]> {
    const chunks = await this.chunkingService.chunk(document.content, strategy);
    
    // 부모 문서 ID 설정
    return chunks.map(chunk => ({
      ...chunk,
      parentDocumentId: document.id,
      metadata: {
        ...chunk.metadata,
        parentDocument: {
          id: document.id,
          source: document.source,
          mimeType: document.mimeType
        },
        chunkingStrategy: strategy
      }
    }));
  }

  /**
   * 청크 임베딩 (데모 구현)
   */
  async embedChunks(chunks: DocumentChunk[], model: string): Promise<DocumentChunk[]> {
    // 실제 구현에서는 OpenAI, Cohere 등의 임베딩 API를 사용
    return chunks.map(chunk => ({
      ...chunk,
      embedding: this.generateDemoEmbedding(chunk.content),
      metadata: {
        ...chunk.metadata,
        embeddingModel: model,
        embeddedAt: new Date()
      }
    }));
  }

  /**
   * 청크 저장 (데모 구현)
   */
  async storeChunks(chunks: DocumentChunk[], vectorStore: string): Promise<void> {
    // 실제 구현에서는 Pinecone, Weaviate, ChromaDB 등에 저장
    console.log(`${chunks.length}개 청크를 ${vectorStore}에 저장 중...`);
    
    // 로컬 스토리지에 데모 저장
    const stored = localStorage.getItem('document_chunks') || '[]';
    const existingChunks = JSON.parse(stored);
    
    const newChunks = chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        vectorStore,
        storedAt: new Date()
      }
    }));
    
    localStorage.setItem('document_chunks', JSON.stringify([...existingChunks, ...newChunks]));
  }

  /**
   * 데모 임베딩 생성
   */
  private generateDemoEmbedding(text: string): number[] {
    // 실제로는 AI 모델을 사용하여 임베딩 생성
    // 여기서는 간단한 해시 기반 벡터 생성
    const dimensions = 1536; // OpenAI ada-002 차원수
    const embedding: number[] = [];
    
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed += text.charCodeAt(i);
    }
    
    for (let i = 0; i < dimensions; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      embedding.push((seed / 233280) * 2 - 1); // -1 to 1 범위
    }
    
    // 정규화
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * 헤더 제거 (간단한 휴리스틱)
   */
  private removeHeaders(content: string): string {
    const lines = content.split('\n');
    let startIndex = 0;
    
    // 처음 몇 줄이 짧고 대문자가 많으면 헤더로 간주
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (line.length > 50 || (line.length > 0 && line.toLowerCase() === line)) {
        break;
      }
      startIndex = i + 1;
    }
    
    return lines.slice(startIndex).join('\n');
  }

  /**
   * 푸터 제거 (간단한 휴리스틱)
   */
  private removeFooters(content: string): string {
    const lines = content.split('\n');
    let endIndex = lines.length;
    
    // 마지막 몇 줄이 짧고 특정 패턴이면 푸터로 간주
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();
      if (line.length > 50 || 
          !(/page|copyright|©|all rights|footer/i.test(line))) {
        break;
      }
      endIndex = i;
    }
    
    return lines.slice(0, endIndex).join('\n');
  }
}