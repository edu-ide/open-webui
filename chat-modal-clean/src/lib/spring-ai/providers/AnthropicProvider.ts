import { BaseModelProvider } from './ModelProvider';
import type { 
  ChatRequest, 
  ChatResponse, 
  ChatStreamChunk,
  ModelInfo
} from '../types';

/**
 * Anthropic 모델 정보
 */
const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    description: '가장 강력한 Claude 3 모델로, 복잡한 작업과 창의적 작업에 최적화',
    contextLength: 200000,
    maxOutputTokens: 4096,
    inputPricing: 0.015,
    outputPricing: 0.075,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'vision', supported: true },
      { type: 'code', supported: true },
      { type: 'json_mode', supported: false }
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 }
    }
  },
  {
    id: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    description: '균형 잡힌 성능과 속도를 제공하는 Claude 3 모델',
    contextLength: 200000,
    maxOutputTokens: 4096,
    inputPricing: 0.003,
    outputPricing: 0.015,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'vision', supported: true },
      { type: 'code', supported: true },
      { type: 'json_mode', supported: false }
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 }
    }
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    description: '빠르고 효율적인 Claude 3 모델로, 간단한 작업에 최적화',
    contextLength: 200000,
    maxOutputTokens: 4096,
    inputPricing: 0.00025,
    outputPricing: 0.00125,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: false },
      { type: 'vision', supported: true },
      { type: 'code', supported: true },
      { type: 'json_mode', supported: false }
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1024 },
      topP: { min: 0, max: 1, default: 1 }
    }
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: '최신 Claude 3.5 모델로, 향상된 추론과 코딩 능력',
    contextLength: 200000,
    maxOutputTokens: 8192,
    inputPricing: 0.003,
    outputPricing: 0.015,
    capabilities: [
      { type: 'chat', supported: true },
      { type: 'function_calling', supported: true },
      { type: 'vision', supported: true },
      { type: 'code', supported: true },
      { type: 'json_mode', supported: false }
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 8192, default: 1024 },
      topP: { min: 0, max: 1, default: 1 }
    }
  }
];

/**
 * Anthropic Claude ModelProvider 구현
 */
export class AnthropicProvider extends BaseModelProvider {
  constructor() {
    super(
      'anthropic',
      'Anthropic',
      'Anthropic의 Claude 모델들을 제공하는 프로바이더',
      ANTHROPIC_MODELS,
      'claude-3-sonnet-20240229',
      'https://www.anthropic.com/favicon.ico',
      'https://www.anthropic.com'
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.validateApiKey(this.config.apiKey)) {
        return false;
      }

      // 간단한 연결 테스트 - Anthropic에는 별도의 models 엔드포인트가 없으므로 작은 요청으로 테스트
      const testResponse = await this.makeRequest('/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });

      return testResponse.ok || testResponse.status === 400; // 400도 API가 작동한다는 의미
    } catch {
      return false;
    }
  }

  async validateConfiguration(): Promise<boolean> {
    if (!this.validateApiKey(this.config.apiKey)) {
      throw new Error('Anthropic API 키가 필요합니다.');
    }

    if (this.config.baseUrl && !this.validateUrl(this.config.baseUrl)) {
      throw new Error('유효하지 않은 Base URL입니다.');
    }

    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        throw new Error('Anthropic API에 연결할 수 없습니다. API 키를 확인해주세요.');
      }
      return true;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    if (!this.validateApiKey(this.config.apiKey)) {
      throw new Error('Anthropic API 키가 설정되지 않았습니다.');
    }

    try {
      const anthropicRequest = this.transformRequest(request);
      const response = await this.makeRequest('/messages', {
        method: 'POST',
        body: JSON.stringify(anthropicRequest)
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
        this.updateUsage(data.usage.input_tokens, data.usage.output_tokens, cost);
      }

      return chatResponse;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async *stream(request: ChatRequest): AsyncIterableIterator<ChatStreamChunk> {
    if (!this.validateApiKey(this.config.apiKey)) {
      throw new Error('Anthropic API 키가 설정되지 않았습니다.');
    }

    try {
      const anthropicRequest = { ...this.transformRequest(request), stream: true };
      const response = await this.makeRequest('/messages', {
        method: 'POST',
        body: JSON.stringify(anthropicRequest)
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
   * ChatRequest를 Anthropic API 형식으로 변환
   */
  private transformRequest(request: ChatRequest): any {
    // Anthropic은 시스템 메시지를 별도로 처리
    const messages = request.messages.filter(msg => msg.role !== 'system');
    const systemMessage = request.messages.find(msg => msg.role === 'system');

    const anthropicRequest: any = {
      model: request.options.model || this.defaultModel,
      max_tokens: request.options.maxTokens || 1024,
      messages: messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      temperature: request.options.temperature,
      top_p: request.options.topP,
      stop_sequences: request.options.stop
    };

    // 시스템 메시지 추가
    if (systemMessage) {
      anthropicRequest.system = systemMessage.content;
    }

    return anthropicRequest;
  }

  /**
   * Anthropic 응답을 ChatResponse로 변환
   */
  private transformResponse(data: any): ChatResponse {
    const content = data.content && data.content.length > 0 
      ? data.content[0].text 
      : '';

    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: content
        },
        finishReason: this.mapStopReason(data.stop_reason)
      }],
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    };
  }

  /**
   * Anthropic 스트림 청크를 ChatStreamChunk로 변환
   */
  private transformStreamChunk(data: any): ChatStreamChunk | null {
    if (data.type === 'content_block_delta' && data.delta?.text) {
      return {
        id: data.message?.id || 'stream',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: data.message?.model || this.defaultModel,
        choices: [{
          index: 0,
          delta: {
            content: data.delta.text
          },
          finishReason: undefined
        }]
      };
    } else if (data.type === 'message_stop') {
      return {
        id: data.message?.id || 'stream',
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: data.message?.model || this.defaultModel,
        choices: [{
          index: 0,
          delta: {},
          finishReason: this.mapStopReason(data.message?.stop_reason)
        }]
      };
    }

    return null;
  }

  /**
   * Anthropic stop_reason을 OpenAI 형식으로 매핑
   */
  private mapStopReason(stopReason?: string): string {
    switch (stopReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  /**
   * HTTP 요청 처리
   */
  private async makeRequest(endpoint: string, options: RequestInit): Promise<Response> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.config.customHeaders
    };

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      },
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    });
  }

  /**
   * Anthropic 특화 에러 처리
   */
  protected handleApiError(error: any): Error {
    // Anthropic 특화 에러 메시지
    if (error.type) {
      switch (error.type) {
        case 'authentication_error':
          return new Error('Anthropic: API 키가 유효하지 않습니다.');
        case 'permission_error':
          return new Error('Anthropic: API 권한이 없습니다.');
        case 'not_found_error':
          return new Error('Anthropic: 요청한 리소스를 찾을 수 없습니다.');
        case 'rate_limit_error':
          return new Error('Anthropic: 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
        case 'api_error':
          return new Error(`Anthropic: API 오류 - ${error.message}`);
        case 'overloaded_error':
          return new Error('Anthropic: 서버가 과부하 상태입니다. 잠시 후 다시 시도해주세요.');
      }
    }

    return super.handleApiError(error);
  }
}

export default AnthropicProvider;