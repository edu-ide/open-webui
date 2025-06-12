/**
 * Document ETL 파이프라인 타입 정의
 * Spring AI Document 처리 패턴을 TypeScript로 구현
 */

export interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  source?: string;
  mimeType?: string;
}

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
  startIndex?: number;
  endIndex?: number;
  parentDocumentId: string;
}

export interface ETLPipelineConfig {
  chunkingStrategy: ChunkingStrategy;
  embeddingModel: string;
  vectorStore: string;
  preprocessing: PreprocessingConfig;
}

export interface ChunkingStrategy {
  type: 'token' | 'sentence' | 'paragraph' | 'semantic' | 'sliding_window';
  maxChunkSize: number;
  overlapSize?: number;
  separators?: string[];
  keepSeparator?: boolean;
}

export interface PreprocessingConfig {
  removeHeaders?: boolean;
  removeFooters?: boolean;
  normalizeWhitespace?: boolean;
  removeEmptyLines?: boolean;
  convertToLowercase?: boolean;
  removeSpecialCharacters?: boolean;
}

export interface ETLProgress {
  stage: ETLStage;
  currentStep: string;
  progress: number; // 0-100
  totalSteps: number;
  currentStepIndex: number;
  startTime: Date;
  estimatedTimeRemaining?: number;
  error?: string;
}

export type ETLStage = 
  | 'upload'
  | 'parsing' 
  | 'preprocessing'
  | 'chunking'
  | 'embedding'
  | 'storing'
  | 'completed'
  | 'error';

export interface ETLResult {
  success: boolean;
  documentId: string;
  totalChunks: number;
  processingTime: number;
  error?: string;
  chunks?: DocumentChunk[];
  metadata?: {
    originalSize: number;
    processedSize: number;
    chunkSizes: number[];
    embeddingDimensions?: number;
  };
}

export interface DocumentProcessor {
  processDocument(file: File, config: ETLPipelineConfig): Promise<ETLResult>;
  parseDocument(file: File): Promise<Document>;
  preprocessDocument(document: Document, config: PreprocessingConfig): Promise<Document>;
  chunkDocument(document: Document, strategy: ChunkingStrategy): Promise<DocumentChunk[]>;
  embedChunks(chunks: DocumentChunk[], model: string): Promise<DocumentChunk[]>;
  storeChunks(chunks: DocumentChunk[], vectorStore: string): Promise<void>;
}

export interface DocumentParser {
  supportedMimeTypes: string[];
  canParse(mimeType: string): boolean;
  parse(file: File): Promise<Document>;
}

export interface ChunkingService {
  chunk(content: string, strategy: ChunkingStrategy): Promise<DocumentChunk[]>;
}

export interface EmbeddingService {
  embed(texts: string[]): Promise<number[][]>;
  getDimensions(): number;
  getModelName(): string;
}

export interface VectorStoreService {
  store(chunks: DocumentChunk[]): Promise<void>;
  search(query: string, limit?: number): Promise<DocumentChunk[]>;
  delete(documentId: string): Promise<void>;
  count(): Promise<number>;
}

export interface ETLJob {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  config: ETLPipelineConfig;
  progress: ETLProgress;
  result?: ETLResult;
  createdAt: Date;
  completedAt?: Date;
}

// 지원되는 문서 형식
export const SUPPORTED_DOCUMENT_TYPES = {
  'text/plain': { name: 'Text File', extensions: ['.txt'] },
  'application/pdf': { name: 'PDF Document', extensions: ['.pdf'] },
  'application/msword': { name: 'Word Document', extensions: ['.doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { 
    name: 'Word Document', 
    extensions: ['.docx'] 
  },
  'text/markdown': { name: 'Markdown', extensions: ['.md'] },
  'text/html': { name: 'HTML Document', extensions: ['.html', '.htm'] },
  'application/json': { name: 'JSON File', extensions: ['.json'] },
  'text/csv': { name: 'CSV File', extensions: ['.csv'] }
} as const;

// 기본 청킹 전략들
export const DEFAULT_CHUNKING_STRATEGIES: Record<string, ChunkingStrategy> = {
  small: {
    type: 'token',
    maxChunkSize: 512,
    overlapSize: 50
  },
  medium: {
    type: 'token', 
    maxChunkSize: 1024,
    overlapSize: 100
  },
  large: {
    type: 'token',
    maxChunkSize: 2048,
    overlapSize: 200
  },
  sentence: {
    type: 'sentence',
    maxChunkSize: 1000,
    overlapSize: 50,
    separators: ['.', '!', '?']
  },
  paragraph: {
    type: 'paragraph',
    maxChunkSize: 2000,
    overlapSize: 100,
    separators: ['\n\n', '\r\n\r\n']
  }
};

// ETL 이벤트 타입
export interface ETLEvent {
  type: 'progress' | 'stage_change' | 'error' | 'completed';
  jobId: string;
  data: any;
  timestamp: Date;
}

export type ETLEventListener = (event: ETLEvent) => void;