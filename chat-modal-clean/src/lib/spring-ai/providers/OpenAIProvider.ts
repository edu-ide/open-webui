import { BaseModelProvider } from './ModelProvider';
import type { 
  ChatRequest, 
  ChatResponse, 
  ChatStreamChunk,
  ModelInfo
} from '../types';

/**
 * OpenAI 모델 정보
 */
const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: '가장 능력이 뛰어난 GPT-4 모델로, 복잡한 작업에 최적화',
    contextLength: 8192,
    maxOutputTokens: 4096,
    inputPricing: 0.03,
    outputPricing: 0.06,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'json_mode', supported: true },
      { type: 'vision', supported: false }
    ],
    parameters: {
      temperature: { min: 0, max: 2, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 },
      frequencyPenalty: { min: -2, max: 2, default: 0 },
      presencePenalty: { min: -2, max: 2, default: 0 }
    }
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: '최신 GPT-4 모델로, 더 긴 컨텍스트와 향상된 성능',
    contextLength: 128000,
    maxOutputTokens: 4096,
    inputPricing: 0.01,
    outputPricing: 0.03,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'json_mode', supported: true },
      { type: 'vision', supported: true, notes: 'gpt-4-turbo-vision 사용' }
    ],
    parameters: {
      temperature: { min: 0, max: 2, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 },
      frequencyPenalty: { min: -2, max: 2, default: 0 },
      presencePenalty: { min: -2, max: 2, default: 0 }
    }
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: '빠르고 효율적인 모델로, 대부분의 작업에 적합',
    contextLength: 16385,
    maxOutputTokens: 4096,
    inputPricing: 0.0015,
    outputPricing: 0.002,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'json_mode', supported: true },
      { type: 'vision', supported: false }
    ],
    parameters: {
      temperature: { min: 0, max: 2, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 },
      frequencyPenalty: { min: -2, max: 2, default: 0 },
      presencePenalty: { min: -2, max: 2, default: 0 }
    }
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: '멀티모달 기능을 갖춘 최신 GPT-4 옵티마이즈드 모델',
    contextLength: 128000,
    maxOutputTokens: 4096,
    inputPricing: 0.005,
    outputPricing: 0.015,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'json_mode', supported: true },
      { type: 'vision', supported: true }
    ],
    parameters: {
      temperature: { min: 0, max: 2, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 },
      frequencyPenalty: { min: -2, max: 2, default: 0 },
      presencePenalty: { min: -2, max: 2, default: 0 }
    }
  }
];

/**
 * OpenAI ModelProvider 구현
 */
export class OpenAIProvider extends BaseModelProvider {
  constructor() {
    super(
      'openai',
      'OpenAI',
      'OpenAI의 GPT 모델들을 제공하는 프로바이더',
      OPENAI_MODELS,
      'gpt-3.5-turbo',
      'https://openai.com/favicon.ico',
      'https://openai.com'
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.validateApiKey(this.config.apiKey)) {
        return false;
      }

      // 간단한 연결 테스트
      const testResponse = await this.makeRequest('/models', {
        method: 'GET'
      });

      return testResponse.ok;
    } catch {
      return false;
    }
  }

  async validateConfiguration(): Promise<boolean> {
    if (!this.validateApiKey(this.config.apiKey)) {
      throw new Error('OpenAI API 키가 필요합니다.');
    }

    if (this.config.baseUrl && !this.validateUrl(this.config.baseUrl)) {
      throw new Error('유효하지 않은 Base URL입니다.');
    }

    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        throw new Error('OpenAI API에 연결할 수 없습니다. API 키를 확인해주세요.');
      }
      return true;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    if (!this.validateApiKey(this.config.apiKey)) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    try {
      const openaiRequest = this.transformRequest(request);
      const response = await this.makeRequest('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(openaiRequest)
      });

      if (!response.ok) {
        const error = await response.json();
        throw this.handleApiError(error.error || error);
      }

      const data = await response.json();
      const chatResponse = this.transformResponse(data);

      // 사용량 추적
      if (data.usage) {
        const cost = this.estimateCost(request, request.options.model || this.defaultModel);
        this.updateUsage(data.usage.prompt_tokens, data.usage.completion_tokens, cost);
      }

      return chatResponse;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async *stream(request: ChatRequest): AsyncIterableIterator<ChatStreamChunk> {
    if (!this.validateApiKey(this.config.apiKey)) {
      throw new Error('OpenAI API 키가 설정되지 않았습니다.');
    }

    try {
      const openaiRequest = { ...this.transformRequest(request), stream: true };
      const response = await this.makeRequest('/chat/completions', {
        method: 'POST',
        body: JSON.stringify(openaiRequest)
      });

      if (!response.ok) {
        const error = await response.json();
        throw this.handleApiError(error.error || error);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('스트림을 읽을 수 없습니다.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine === '' || cleanLine === 'data: [DONE]') continue;

            if (cleanLine.startsWith('data: ')) {
              try {
                const jsonData = JSON.parse(cleanLine.slice(6));
                const chunk = this.transformStreamChunk(jsonData);
                if (chunk) {
                  yield chunk;
                }
              } catch (e) {
                console.warn('스트림 파싱 오류:', e);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * ChatRequest를 OpenAI API 형식으로 변환
   */
  private transformRequest(request: ChatRequest): any {
    return {
      model: request.options.model || this.defaultModel,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: request.options.temperature,
      max_tokens: request.options.maxTokens,
      top_p: request.options.topP,
      frequency_penalty: request.options.frequencyPenalty,
      presence_penalty: request.options.presencePenalty,
      stop: request.options.stop
    };
  }

  /**
   * OpenAI 응답을 ChatResponse로 변환
   */
  private transformResponse(data: any): ChatResponse {
    return {
      id: data.id,
      object: data.object,
      created: data.created,
      model: data.model,
      choices: data.choices.map((choice: any) => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content
        },
        finishReason: choice.finish_reason
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }
    };
  }

  /**
   * OpenAI 스트림 청크를 ChatStreamChunk로 변환
   */
  private transformStreamChunk(data: any): ChatStreamChunk | null {
    if (!data.choices || data.choices.length === 0) {
      return null;
    }

    return {
      id: data.id,
      object: data.object,
      created: data.created,
      model: data.model,
      choices: data.choices.map((choice: any) => ({
        index: choice.index,
        delta: {
          role: choice.delta?.role,
          content: choice.delta?.content
        },
        finishReason: choice.finish_reason
      }))
    };
  }

  /**
   * HTTP 요청 처리
   */
  private async makeRequest(endpoint: string, options: RequestInit): Promise<Response> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...this.config.customHeaders
    };

    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });
  }
}

export default OpenAIProvider;