import { embeddingEndpoints } from '../../api/spring-ai/embeddings';

/**
 * Vector Store 관련 타입 정의
 */
export interface VectorDocument {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  score?: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SearchFilters {
  categories?: string[];
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  scoreThreshold?: number;
  metadataFilters?: Record<string, any>;
  maxResults?: number;
  includeMetadata?: boolean;
}

export interface SearchResult {
  document: VectorDocument;
  score: number;
  highlights?: string[];
  metadata?: Record<string, any>;
}

export interface VectorSearchQuery {
  query: string;
  embedding?: number[];
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
}

export interface VectorStoreStats {
  totalDocuments: number;
  totalSize: string;
  averageEmbeddingDimension: number;
  lastUpdated: Date;
  indexStatus: 'ready' | 'building' | 'error';
}

/**
 * Vector Store 인터페이스
 */
export interface VectorStore {
  /**
   * 문서 추가
   */
  addDocument(document: Omit<VectorDocument, 'embedding' | 'createdAt'>): Promise<VectorDocument>;
  
  /**
   * 배치 문서 추가
   */
  addDocuments(documents: Omit<VectorDocument, 'embedding' | 'createdAt'>[]): Promise<VectorDocument[]>;
  
  /**
   * 유사도 검색
   */
  similaritySearch(query: VectorSearchQuery): Promise<SearchResult[]>;
  
  /**
   * 텍스트 기반 검색 (자동 임베딩)
   */
  searchByText(query: string, filters?: SearchFilters): Promise<SearchResult[]>;
  
  /**
   * 임베딩 기반 검색
   */
  searchByEmbedding(embedding: number[], filters?: SearchFilters): Promise<SearchResult[]>;
  
  /**
   * 문서 삭제
   */
  deleteDocument(id: string): Promise<boolean>;
  
  /**
   * 문서 업데이트
   */
  updateDocument(id: string, updates: Partial<VectorDocument>): Promise<VectorDocument>;
  
  /**
   * 문서 조회
   */
  getDocument(id: string): Promise<VectorDocument | null>;
  
  /**
   * 통계 조회
   */
  getStats(): Promise<VectorStoreStats>;
}

/**
 * 메모리 기반 Vector Store 구현 (개발/테스트용)
 */
export class InMemoryVectorStore implements VectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  async addDocument(document: Omit<VectorDocument, 'embedding' | 'createdAt'>): Promise<VectorDocument> {
    try {
      // 임베딩 생성
      const embeddingResponse = await embeddingEndpoints.create({
        input: document.content,
        model: 'text-embedding-ada-002'
      });
      
      const embedding = embeddingResponse.data[0]?.embedding;
      if (!embedding) {
        throw new Error('Failed to generate embedding');
      }

      const vectorDoc: VectorDocument = {
        ...document,
        embedding,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.documents.set(document.id, vectorDoc);
      this.embeddings.set(document.id, embedding);

      return vectorDoc;
    } catch (error) {
      console.error('Failed to add document:', error);
      throw error;
    }
  }

  async addDocuments(documents: Omit<VectorDocument, 'embedding' | 'createdAt'>[]): Promise<VectorDocument[]> {
    const results: VectorDocument[] = [];
    
    try {
      // 배치 임베딩 생성
      const texts = documents.map(doc => doc.content);
      const embeddingResponse = await embeddingEndpoints.createBatch(texts);
      
      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        const embedding = embeddingResponse.data[i]?.embedding;
        
        if (embedding) {
          const vectorDoc: VectorDocument = {
            ...document,
            embedding,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          this.documents.set(document.id, vectorDoc);
          this.embeddings.set(document.id, embedding);
          results.push(vectorDoc);
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to add documents:', error);
      throw error;
    }
  }

  async similaritySearch(query: VectorSearchQuery): Promise<SearchResult[]> {
    try {
      let queryEmbedding = query.embedding;
      
      // 쿼리 임베딩이 없으면 생성
      if (!queryEmbedding && query.query) {
        const embeddingResponse = await embeddingEndpoints.create({
          input: query.query
        });
        queryEmbedding = embeddingResponse.data[0]?.embedding;
      }

      if (!queryEmbedding) {
        throw new Error('No query embedding provided or generated');
      }

      const results: SearchResult[] = [];
      const filters = query.filters || {};

      for (const [id, document] of this.documents) {
        // 필터 적용
        if (!this.passesFilters(document, filters)) {
          continue;
        }

        const embedding = this.embeddings.get(id);
        if (!embedding) continue;

        // 유사도 계산
        const score = embeddingEndpoints.calculateSimilarity(queryEmbedding, embedding);
        
        // 점수 임계값 체크
        if (filters.scoreThreshold && score < filters.scoreThreshold) {
          continue;
        }

        results.push({
          document: { ...document, score },
          score,
          highlights: this.generateHighlights(document.content, query.query),
          metadata: filters.includeMetadata ? document.metadata : undefined
        });
      }

      // 점수순 정렬
      results.sort((a, b) => b.score - a.score);

      // 페이지네이션
      const limit = query.limit || filters.maxResults || 10;
      const offset = query.offset || 0;
      
      return results.slice(offset, offset + limit);
    } catch (error) {
      console.error('Similarity search failed:', error);
      throw error;
    }
  }

  async searchByText(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    return this.similaritySearch({
      query,
      filters
    });
  }

  async searchByEmbedding(embedding: number[], filters?: SearchFilters): Promise<SearchResult[]> {
    return this.similaritySearch({
      query: '',
      embedding,
      filters
    });
  }

  async deleteDocument(id: string): Promise<boolean> {
    const exists = this.documents.has(id);
    this.documents.delete(id);
    this.embeddings.delete(id);
    return exists;
  }

  async updateDocument(id: string, updates: Partial<VectorDocument>): Promise<VectorDocument> {
    const existing = this.documents.get(id);
    if (!existing) {
      throw new Error(`Document not found: ${id}`);
    }

    let embedding = existing.embedding;
    
    // 내용이 변경되면 임베딩 재생성
    if (updates.content && updates.content !== existing.content) {
      const embeddingResponse = await embeddingEndpoints.create({
        input: updates.content
      });
      embedding = embeddingResponse.data[0]?.embedding;
    }

    const updated: VectorDocument = {
      ...existing,
      ...updates,
      embedding: embedding || existing.embedding,
      updatedAt: new Date()
    };

    this.documents.set(id, updated);
    if (embedding) {
      this.embeddings.set(id, embedding);
    }

    return updated;
  }

  async getDocument(id: string): Promise<VectorDocument | null> {
    return this.documents.get(id) || null;
  }

  async getStats(): Promise<VectorStoreStats> {
    const docs = Array.from(this.documents.values());
    
    return {
      totalDocuments: docs.length,
      totalSize: this.formatBytes(this.calculateTotalSize()),
      averageEmbeddingDimension: this.calculateAverageEmbeddingDimension(),
      lastUpdated: new Date(),
      indexStatus: 'ready'
    };
  }

  /**
   * 필터 조건 검사
   */
  private passesFilters(document: VectorDocument, filters: SearchFilters): boolean {
    // 카테고리 필터
    if (filters.categories && filters.categories.length > 0) {
      const docCategory = document.metadata.category;
      if (!docCategory || !filters.categories.includes(docCategory)) {
        return false;
      }
    }

    // 날짜 범위 필터
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      if (start && document.createdAt < start) return false;
      if (end && document.createdAt > end) return false;
    }

    // 메타데이터 필터
    if (filters.metadataFilters) {
      for (const [key, value] of Object.entries(filters.metadataFilters)) {
        if (document.metadata[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 하이라이트 생성
   */
  private generateHighlights(content: string, query?: string): string[] {
    if (!query) return [];

    const words = query.toLowerCase().split(/\s+/);
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const hasMatch = words.some(word => lowerSentence.includes(word));
      
      if (hasMatch) {
        highlights.push(sentence.trim());
      }
    }

    return highlights.slice(0, 3); // 최대 3개 하이라이트
  }

  /**
   * 전체 크기 계산
   */
  private calculateTotalSize(): number {
    let totalSize = 0;
    for (const doc of this.documents.values()) {
      totalSize += new Blob([JSON.stringify(doc)]).size;
    }
    return totalSize;
  }

  /**
   * 평균 임베딩 차원 계산
   */
  private calculateAverageEmbeddingDimension(): number {
    const embeddings = Array.from(this.embeddings.values());
    if (embeddings.length === 0) return 0;
    
    const totalDimensions = embeddings.reduce((sum, emb) => sum + emb.length, 0);
    return Math.round(totalDimensions / embeddings.length);
  }

  /**
   * 바이트 크기를 읽기 쉬운 형태로 변환
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Vector Store 팩토리
 */
export class VectorStoreFactory {
  /**
   * 메모리 기반 Vector Store 생성
   */
  static createInMemoryStore(): VectorStore {
    return new InMemoryVectorStore();
  }

  /**
   * 샘플 데이터로 초기화된 Vector Store 생성
   */
  static async createWithSampleData(): Promise<VectorStore> {
    const store = new InMemoryVectorStore();
    
    const sampleDocs = [
      {
        id: 'doc1',
        content: 'Spring AI는 Java 개발자를 위한 AI 애플리케이션 프레임워크입니다.',
        metadata: { category: 'framework', topic: 'spring-ai', language: 'ko' }
      },
      {
        id: 'doc2', 
        content: 'React는 사용자 인터페이스를 구축하기 위한 JavaScript 라이브러리입니다.',
        metadata: { category: 'frontend', topic: 'react', language: 'ko' }
      },
      {
        id: 'doc3',
        content: 'TypeScript는 JavaScript에 정적 타입을 추가한 프로그래밍 언어입니다.',
        metadata: { category: 'language', topic: 'typescript', language: 'ko' }
      },
      {
        id: 'doc4',
        content: 'Vector databases are optimized for storing and querying high-dimensional vectors.',
        metadata: { category: 'database', topic: 'vector-db', language: 'en' }
      },
      {
        id: 'doc5',
        content: 'Machine learning models can be embedded into web applications for real-time inference.',
        metadata: { category: 'ai', topic: 'ml-deployment', language: 'en' }
      }
    ];

    await store.addDocuments(sampleDocs);
    return store;
  }
}

export default InMemoryVectorStore;