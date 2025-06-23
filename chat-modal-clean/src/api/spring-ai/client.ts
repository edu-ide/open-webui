import { WEBUI_BASE_URL } from '../../services/constants';

/**
 * Spring AI API 기본 설정
 */
export const SPRING_AI_BASE_URL = `${WEBUI_BASE_URL}/api/spring-ai`;

/**
 * API 요청 옵션
 */
interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * API 에러 클래스
 */
export class SpringAIError extends Error {
  public statusCode: number;
  public response: any;
  
  constructor(statusCode: number, response: any, message?: string) {
    super(message || `Spring AI API Error: ${statusCode}`);
    this.name = 'SpringAIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * 기본 API 클라이언트
 */
export class SpringAIApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private defaultTimeout: number;

  constructor(baseUrl = SPRING_AI_BASE_URL) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    this.defaultTimeout = 30000; // 30초
  }

  /**
   * 인증 토큰 설정
   */
  setAuthToken(token: string) {
    if (token) {
      this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders['Authorization'];
    }
  }

  /**
   * 기본 HTTP 요청 메서드
   */
  async request<T = any>(
    endpoint: string, 
    options: ApiRequestOptions = {}
  ): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retries = 3,
      retryDelay = 1000
    } = options;

    const url = `${this.baseUrl}${endpoint}`;
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorBody;
          try {
            errorBody = await response.json();
          } catch {
            errorBody = await response.text();
          }
          throw new SpringAIError(response.status, errorBody);
        }

        // 응답 Content-Type 확인
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return await response.json();
        } else {
          return await response.text() as any;
        }

      } catch (error) {
        lastError = error as Error;
        
        // 재시도하지 않을 에러들
        if (error instanceof SpringAIError && error.statusCode < 500) {
          throw error;
        }
        
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('Request timeout');
        }

        // 마지막 시도가 아니면 재시도
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastError!;
  }

  /**
   * GET 요청
   */
  async get<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST 요청
   */
  async post<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * PUT 요청
   */
  async put<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * DELETE 요청
   */
  async delete<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * 스트리밍 요청 (Server-Sent Events)
   */
  async *stream<T = any>(
    endpoint: string, 
    body?: any, 
    options: Omit<ApiRequestOptions, 'method'> = {}
  ): AsyncIterableIterator<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const { headers = {}, timeout = 60000 } = options;

    const requestHeaders = {
      ...this.defaultHeaders,
      ...headers,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text();
        }
        throw new SpringAIError(response.status, errorBody);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data.trim() === '[DONE]') {
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              yield parsed as T;
            } catch (error) {
              console.warn('Failed to parse SSE data:', data, error);
            }
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 기본 API 클라이언트 인스턴스
 */
export const springAIClient = new SpringAIApiClient();

/**
 * 토큰이 변경될 때 자동으로 API 클라이언트 업데이트
 */
if (typeof window !== 'undefined') {
  // 로컬 스토리지에서 토큰 읽기
  const token = localStorage.getItem('token');
  if (token) {
    springAIClient.setAuthToken(token);
  }

  // 토큰 변경 감지 (storage 이벤트)
  window.addEventListener('storage', (event) => {
    if (event.key === 'token') {
      if (event.newValue) {
        springAIClient.setAuthToken(event.newValue);
      } else {
        springAIClient.setAuthToken('');
      }
    }
  });
}

export default springAIClient;