// import { springAIClient } from './client';  // 향후 사용

/**
 * 임베딩 관련 타입
 */
export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
}

export interface EmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingModel {
  id: string;
  name: string;
  dimensions: number;
  max_input: number;
  description?: string;
}

/**
 * Spring AI 임베딩 API 엔드포인트
 */
export const embeddingEndpoints = {
  /**
   * 텍스트 임베딩 생성
   */
  async create(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      // Spring AI 백엔드가 준비되기 전까지 모의 응답
      return await mockEmbeddingCreate(request);
      
      // 실제 구현 (백엔드 준비 시 활성화)
      // return await springAIClient.post<EmbeddingResponse>('/embeddings', {
      //   input: request.input,
      //   model: request.model || 'text-embedding-ada-002',
      //   encoding_format: request.encoding_format || 'float',
      //   dimensions: request.dimensions,
      //   user: request.user
      // });
    } catch (error) {
      console.error('Embedding creation failed:', error);
      throw error;
    }
  },

  /**
   * 배치 임베딩 생성 (대량 텍스트 처리)
   */
  async createBatch(texts: string[], options: Omit<EmbeddingRequest, 'input'> = {}): Promise<EmbeddingResponse> {
    try {
      return await this.create({
        ...options,
        input: texts
      });
    } catch (error) {
      console.error('Batch embedding creation failed:', error);
      throw error;
    }
  },

  /**
   * 사용 가능한 임베딩 모델 목록 조회
   */
  async getModels(): Promise<EmbeddingModel[]> {
    try {
      // 모의 데이터
      return [
        {
          id: 'text-embedding-ada-002',
          name: 'OpenAI Ada v2',
          dimensions: 1536,
          max_input: 8191,
          description: 'OpenAI의 최신 임베딩 모델'
        },
        {
          id: 'text-embedding-3-small',
          name: 'OpenAI Embedding v3 Small',
          dimensions: 1536,
          max_input: 8191,
          description: '효율적인 소형 임베딩 모델'
        },
        {
          id: 'text-embedding-3-large',
          name: 'OpenAI Embedding v3 Large',
          dimensions: 3072,
          max_input: 8191,
          description: '고성능 대형 임베딩 모델'
        },
        {
          id: 'sentence-transformers/all-MiniLM-L6-v2',
          name: 'Sentence Transformers Mini',
          dimensions: 384,
          max_input: 256,
          description: '경량화된 문장 임베딩 모델'
        },
        {
          id: 'sentence-transformers/all-mpnet-base-v2',
          name: 'Sentence Transformers MPNet',
          dimensions: 768,
          max_input: 514,
          description: '고품질 문장 임베딩 모델'
        }
      ];
      
      // 실제 구현
      // const response = await springAIClient.get<{ models: EmbeddingModel[] }>('/embeddings/models');
      // return response.models;
    } catch (error) {
      console.error('Get embedding models failed:', error);
      throw error;
    }
  },

  /**
   * 임베딩 모델 정보 조회
   */
  async getModelInfo(modelId: string): Promise<EmbeddingModel> {
    try {
      const models = await this.getModels();
      const model = models.find(m => m.id === modelId);
      
      if (!model) {
        throw new Error(`Embedding model not found: ${modelId}`);
      }
      
      return model;
    } catch (error) {
      console.error('Get embedding model info failed:', error);
      throw error;
    }
  },

  /**
   * 두 임베딩 간 코사인 유사도 계산
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude1 = Math.sqrt(norm1);
    const magnitude2 = Math.sqrt(norm2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  },

  /**
   * 임베딩 벡터 정규화
   */
  normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return embedding;
    return embedding.map(val => val / magnitude);
  }
};

/**
 * 모의 임베딩 생성 (백엔드 준비 전까지 사용)
 */
async function mockEmbeddingCreate(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  // 지연 시뮬레이션
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 700));

  const inputs = Array.isArray(request.input) ? request.input : [request.input];
  const model = request.model || 'text-embedding-ada-002';
  const dimensions = request.dimensions || 1536;

  const data = inputs.map((text, index) => {
    // 텍스트 기반 의사 임베딩 생성 (실제로는 AI 모델이 처리)
    const hash = simpleHash(text);
    const embedding = generateMockEmbedding(hash, dimensions);
    
    return {
      object: 'embedding' as const,
      index,
      embedding
    };
  });

  return {
    object: 'list',
    data,
    model,
    usage: {
      prompt_tokens: inputs.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0),
      total_tokens: inputs.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0)
    }
  };
}

/**
 * 간단한 해시 함수
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32비트 정수로 변환
  }
  return Math.abs(hash);
}

/**
 * 모의 임베딩 벡터 생성 (텍스트 해시 기반)
 */
function generateMockEmbedding(seed: number, dimensions: number): number[] {
  const embedding: number[] = [];
  
  // 시드 기반 의사 랜덤 생성기
  let rng = seed;
  
  for (let i = 0; i < dimensions; i++) {
    // Linear congruential generator
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const random = (rng / 0x7fffffff - 0.5) * 2; // -1 ~ 1 범위
    embedding.push(random);
  }
  
  // 정규화
  return embeddingEndpoints.normalizeEmbedding(embedding);
}

export default embeddingEndpoints;