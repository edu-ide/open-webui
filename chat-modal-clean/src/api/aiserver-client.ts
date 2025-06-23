/**
 * AI Server API Client
 * Spring AI 기반의 aiserver와 연동하기 위한 TypeScript 클라이언트
 */

// 기본 설정
const API_BASE_URL = process.env.VITE_AISERVER_URL || 'http://localhost:8080';
const API_VERSION = '/api/v2';

// 공통 타입 정의
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Chat 관련 타입
export interface ChatRequest {
  message: string;
  model?: 'openai' | 'ollama';
}

export interface ChatResponse {
  response: string;
  model: string;
  success: boolean;
}

export interface ChatWithContextRequest extends ChatRequest {
  context: string;
}

export interface ChatWithTemplateRequest {
  template: string;
  variables: Record<string, any>;
  model?: string;
}

// RAG 관련 타입
export interface Document {
  content: string;
  metadata: Record<string, any>;
}

export interface DocumentAddRequest {
  content: string;
  metadata?: Record<string, any>;
}

export interface DocumentBatchRequest {
  documents: Document[];
}

export interface DocumentSearchRequest {
  query: string;
  topK?: number;
}

export interface RagAskRequest {
  question: string;
  topK?: number;
  model?: string;
}

// Function Calling 관련 타입
export interface FunctionChatRequest {
  message: string;
  model?: string;
}

export interface WeatherRequest {
  city: string;
}

export interface TimeRequest {
  timezone?: string;
}

export interface CalculatorRequest {
  expression: string;
}

export interface TodoRequest {
  action: 'add' | 'list' | 'complete' | 'delete';
  task?: string;
  taskId?: number;
}

// Media 관련 타입
export interface ImageGenerateRequest {
  prompt: string;
}

export interface AudioTranscribeRequest {
  audioData: string; // Base64 encoded
}

export interface TextToSpeechRequest {
  text: string;
}

// API 클라이언트 클래스
class AiServerApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl + API_VERSION;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  // 인증 토큰 설정
  setAuthToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  // 기본 fetch 래퍼
  private async fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // 스트리밍 응답 처리
  private async *fetchStream(
    endpoint: string,
    options: RequestInit = {}
  ): AsyncGenerator<string, void, unknown> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        yield chunk;
      }
    } catch (error) {
      console.error('Streaming API request failed:', error);
      throw error;
    }
  }

  // === Chat API ===
  
  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.fetchApi<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async *streamChat(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    yield* this.fetchStream('/chat/stream', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async chatWithContext(request: ChatWithContextRequest): Promise<ChatResponse> {
    return this.fetchApi<ChatResponse>('/chat/with-context', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async chatWithTemplate(request: ChatWithTemplateRequest): Promise<ChatResponse> {
    return this.fetchApi<ChatResponse>('/chat/template', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async chatWithFunction(request: FunctionChatRequest): Promise<ChatResponse> {
    return this.fetchApi<ChatResponse>('/chat/function', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // === RAG API ===

  async addDocument(request: DocumentAddRequest): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/rag/documents', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async addDocuments(request: DocumentBatchRequest): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/rag/documents/batch', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async searchDocuments(request: DocumentSearchRequest): Promise<ApiResponse<Document[]>> {
    return this.fetchApi<ApiResponse<Document[]>>('/rag/search', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async askWithRag(request: RagAskRequest): Promise<ApiResponse<string>> {
    return this.fetchApi<ApiResponse<string>>('/rag/ask', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async summarizeDocuments(query: string, model?: string): Promise<ApiResponse<string>> {
    return this.fetchApi<ApiResponse<string>>('/rag/summarize', {
      method: 'POST',
      body: JSON.stringify({ query, model }),
    });
  }

  async getRagStatus(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/rag/status');
  }

  async clearDocuments(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/rag/documents', {
      method: 'DELETE',
    });
  }

  // === Function Calling API ===

  async functionChat(request: FunctionChatRequest): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getWeather(request: WeatherRequest): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/weather', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getTime(request: TimeRequest = {}): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/time', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async calculate(request: CalculatorRequest): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/calculate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async manageTodo(request: TodoRequest): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/todo', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getAvailableFunctions(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/list');
  }

  async getFunctionExamples(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/functions/examples');
  }

  // === Media API ===

  async generateImage(request: ImageGenerateRequest): Promise<ApiResponse<string>> {
    return this.fetchApi<ApiResponse<string>>('/image/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async transcribeAudio(request: AudioTranscribeRequest): Promise<ApiResponse<string>> {
    return this.fetchApi<ApiResponse<string>>('/audio/transcribe', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async textToSpeech(request: TextToSpeechRequest): Promise<ApiResponse<string>> {
    return this.fetchApi<ApiResponse<string>>('/audio/text-to-speech', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // === System API ===

  async getAvailableModels(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/models');
  }

  async healthCheck(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/health');
  }

  async getApiDocumentation(): Promise<ApiResponse> {
    return this.fetchApi<ApiResponse>('/');
  }
}

// 싱글톤 인스턴스 생성
export const aiServerApi = new AiServerApiClient();

// 기본 내보내기
export default aiServerApi;

// 유틸리티 함수들
export const AiServerUtils = {
  // 스트리밍 응답을 문자열로 수집
  async collectStreamToString(stream: AsyncGenerator<string, void, unknown>): Promise<string> {
    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }
    return result;
  },

  // 스트리밍 응답을 콜백으로 처리
  async processStream(
    stream: AsyncGenerator<string, void, unknown>,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      for await (const chunk of stream) {
        onChunk(chunk);
      }
      onComplete?.();
    } catch (error) {
      onError?.(error as Error);
    }
  },

  // 에러 응답 체크
  isErrorResponse(response: any): response is { success: false; error: string } {
    return response && response.success === false && typeof response.error === 'string';
  },

  // 성공 응답 체크
  isSuccessResponse<T>(response: any): response is { success: true; data: T } {
    return response && response.success === true;
  },
};