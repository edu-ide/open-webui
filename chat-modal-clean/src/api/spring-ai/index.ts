// Spring AI API 통합 인덱스

export { 
  SpringAIApiClient, 
  SpringAIError, 
  springAIClient, 
  SPRING_AI_BASE_URL 
} from './client';

export { default as chatEndpoints } from './chat';
export { 
  default as embeddingEndpoints,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type EmbeddingModel
} from './embeddings';

/**
 * 통합 Spring AI API 객체
 */
export const springAIApi = {
  chat: {
    async complete(request: import('../../lib/spring-ai/types').ChatRequest) {
      const { default: chatEndpoints } = await import('./chat');
      return chatEndpoints.complete(request);
    },
    
    stream(request: import('../../lib/spring-ai/types').ChatRequest) {
      return import('./chat').then(({ default: chatEndpoints }) => 
        chatEndpoints.stream(request)
      );
    },
    
    async stop(requestId: string) {
      const { default: chatEndpoints } = await import('./chat');
      return chatEndpoints.stop(requestId);
    },
    
    async getModels() {
      const { default: chatEndpoints } = await import('./chat');
      return chatEndpoints.getModels();
    },
    
    async getModelInfo(modelId: string) {
      const { default: chatEndpoints } = await import('./chat');
      return chatEndpoints.getModelInfo(modelId);
    }
  },

  embeddings: {
    async create(request: import('./embeddings').EmbeddingRequest) {
      const { default: embeddingEndpoints } = await import('./embeddings');
      return embeddingEndpoints.create(request);
    },
    
    async createBatch(texts: string[], options = {}) {
      const { default: embeddingEndpoints } = await import('./embeddings');
      return embeddingEndpoints.createBatch(texts, options);
    },
    
    async getModels() {
      const { default: embeddingEndpoints } = await import('./embeddings');
      return embeddingEndpoints.getModels();
    },
    
    async getModelInfo(modelId: string) {
      const { default: embeddingEndpoints } = await import('./embeddings');
      return embeddingEndpoints.getModelInfo(modelId);
    },
    
    calculateSimilarity(embedding1: number[], embedding2: number[]) {
      return import('./embeddings').then(({ default: embeddingEndpoints }) =>
        embeddingEndpoints.calculateSimilarity(embedding1, embedding2)
      );
    },
    
    normalizeEmbedding(embedding: number[]) {
      return import('./embeddings').then(({ default: embeddingEndpoints }) =>
        embeddingEndpoints.normalizeEmbedding(embedding)
      );
    }
  },

  // 향후 추가될 API들
  vectorStore: {
    // Vector Store API (향후 구현)
  },
  
  tools: {
    // Function Calling API (향후 구현)  
  },
  
  observability: {
    // Metrics & Monitoring API (향후 구현)
  }
};

/**
 * API 상태 체크
 */
export const healthCheck = {
  /**
   * Spring AI 백엔드 연결 상태 확인
   */
  async checkConnection(): Promise<boolean> {
    try {
      const { springAIClient } = await import('./client');
      await springAIClient.get('/health');
      return true;
    } catch (error) {
      console.warn('Spring AI backend not available:', error);
      return false;
    }
  },

  /**
   * 사용 가능한 기능 확인
   */
  async getAvailableFeatures(): Promise<string[]> {
    const features = [];
    
    try {
      const { springAIClient } = await import('./client');
      await springAIClient.get('/chat/models');
      features.push('chat');
    } catch {}
    
    try {
      const { springAIClient } = await import('./client');
      await springAIClient.get('/embeddings/models');
      features.push('embeddings');
    } catch {}
    
    return features;
  },

  /**
   * API 버전 정보
   */
  async getVersion(): Promise<{ version: string; build: string }> {
    try {
      const { springAIClient } = await import('./client');
      return await springAIClient.get('/version');
    } catch {
      return { version: 'unknown', build: 'unknown' };
    }
  }
};

export default springAIApi;