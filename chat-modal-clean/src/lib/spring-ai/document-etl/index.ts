/**
 * Spring AI Document ETL Pipeline
 * 
 * 문서 업로드부터 벡터 저장까지의 전체 ETL 과정을 처리하는 시스템
 */

// 핵심 타입들
export type {
  Document,
  DocumentChunk,
  ETLPipelineConfig,
  ETLJob,
  ETLResult,
  ETLProgress,
  ETLEvent,
  ETLEventListener,
  ChunkingStrategy,
  PreprocessingConfig,
  DocumentProcessor as IDocumentProcessor,
  DocumentParser,
  ChunkingService as IChunkingService,
  EmbeddingService,
  VectorStoreService,
  ETLStage
} from './types';

// 상수들
export { 
  SUPPORTED_DOCUMENT_TYPES, 
  DEFAULT_CHUNKING_STRATEGIES 
} from './types';

// 핵심 클래스들
export { DocumentProcessor } from './DocumentProcessor';
export { ChunkingService } from './services/ChunkingService';

// 파서들
export { BaseDocumentParser } from './parsers/BaseDocumentParser';
export { TextDocumentParser } from './parsers/TextDocumentParser';
export { HTMLDocumentParser } from './parsers/HTMLDocumentParser';

// 타입들을 별도로 import
import type {
  ChunkingStrategy as IChunkingStrategy,
  PreprocessingConfig as IPreprocessingConfig,
  ETLPipelineConfig as IETLPipelineConfig,
  ETLStage as IETLStage,
  ETLJob as IETLJob,
  ETLProgress as IETLProgress,
  ETLResult as IETLResult
} from './types';

import { DocumentProcessor as DocumentProcessorClass } from './DocumentProcessor';
import { DEFAULT_CHUNKING_STRATEGIES as DEFAULT_STRATEGIES, SUPPORTED_DOCUMENT_TYPES as SUPPORTED_TYPES } from './types';

/**
 * ETL 파이프라인 팩토리
 */
export class ETLPipelineFactory {
  /**
   * 기본 ETL 파이프라인 생성
   */
  static createDefaultPipeline(): DocumentProcessorClass {
    return new DocumentProcessorClass();
  }

  /**
   * 사용자 정의 ETL 파이프라인 생성
   */
  static createCustomPipeline(config?: {
    customParsers?: any[];
    customChunkingService?: any;
    customEmbeddingService?: any;
    customVectorStore?: any;
  }): DocumentProcessorClass {
    const processor = new DocumentProcessorClass();
    
    // 향후 확장을 위한 구조
    if (config?.customParsers) {
      // 커스텀 파서 등록 로직
    }
    
    return processor;
  }
}

/**
 * 편의 함수들
 */

// 기본 청킹 전략 생성
export const createChunkingStrategy = (
  type: IChunkingStrategy['type'],
  maxChunkSize: number = 1024,
  overlapSize: number = 100
): IChunkingStrategy => ({
  type,
  maxChunkSize,
  overlapSize
});

// 기본 전처리 설정 생성
export const createPreprocessingConfig = (options?: {
  removeHeaders?: boolean;
  removeFooters?: boolean;
  normalizeWhitespace?: boolean;
  removeEmptyLines?: boolean;
  convertToLowercase?: boolean;
  removeSpecialCharacters?: boolean;
}): IPreprocessingConfig => ({
  removeHeaders: true,
  removeFooters: true,
  normalizeWhitespace: true,
  removeEmptyLines: true,
  convertToLowercase: false,
  removeSpecialCharacters: false,
  ...options
});

// 기본 ETL 설정 생성
export const createETLConfig = (options?: {
  chunkingStrategy?: IChunkingStrategy;
  embeddingModel?: string;
  vectorStore?: string;
  preprocessing?: IPreprocessingConfig;
}): IETLPipelineConfig => ({
  chunkingStrategy: options?.chunkingStrategy || DEFAULT_STRATEGIES.medium,
  embeddingModel: options?.embeddingModel || 'text-embedding-ada-002',
  vectorStore: options?.vectorStore || 'local',
  preprocessing: options?.preprocessing || createPreprocessingConfig()
});

/**
 * 파일 형식 체크 유틸리티
 */
export const isSupportedFileType = (mimeType: string): boolean => {
  return Object.keys(SUPPORTED_TYPES).includes(mimeType);
};

/**
 * 파일 크기 포맷 유틸리티
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 처리 시간 포맷 유틸리티
 */
export const formatProcessingTime = (milliseconds: number): string => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}초`;
  } else {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
    return `${minutes}분 ${seconds}초`;
  }
};

/**
 * ETL 진행률 계산 유틸리티
 */
export const calculateETLProgress = (stage: IETLStage, stepIndex: number, totalSteps: number): number => {
  const stageWeights: Record<IETLStage, number> = {
    upload: 0,
    parsing: 20,
    preprocessing: 35,
    chunking: 50,
    embedding: 75,
    storing: 90,
    completed: 100,
    error: 0
  };
  
  const baseProgress = stageWeights[stage];
  const stepProgress = totalSteps > 0 ? (stepIndex / totalSteps) * 15 : 0; // 각 단계 내에서 15% 진행
  
  return Math.min(100, baseProgress + stepProgress);
};

/**
 * React Hook용 인터페이스
 */
export interface UseDocumentETLReturn {
  processor: DocumentProcessorClass;
  processDocument: (file: File, config: IETLPipelineConfig) => Promise<IETLResult>;
  isProcessing: boolean;
  currentJob: IETLJob | null;
  error: string | null;
  progress: IETLProgress | null;
}

// React에서 사용할 수 있는 Document ETL 훅 인터페이스
// 실제 구현은 컴포넌트에서 할 예정