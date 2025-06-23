import { useChat } from '../../contexts/ChatContext';
import type { 
  ChatOptions, 
  ChatRequest, 
  ChatResponse, 
  ChatMessage, 
  ChatStreamChunk,
  OutputParser,
  FunctionDefinition
} from './types';
import type { Advisor } from './advisors/base';

/**
 * Spring AI 스타일의 fluent API를 제공하는 ChatClientRequest 클래스
 */
export class ChatClientRequest<T = any> {
  private _messages: ChatMessage[] = [];
  private _options: ChatOptions = {};
  private _advisors: Advisor[] = [];
  private _functions: FunctionDefinition[] = [];
  private _outputParser?: OutputParser<T>;
  private chatContext?: ReturnType<typeof useChat>;

  constructor(initialPrompt?: string, chatContext?: ReturnType<typeof useChat>) {
    if (initialPrompt) {
      this._messages = [{ role: 'user', content: initialPrompt }];
    }
    this.chatContext = chatContext;
  }

  /**
   * 시스템 프롬프트 설정
   */
  system(prompt: string): this {
    // 기존 시스템 메시지 제거 후 새로 추가
    this._messages = this._messages.filter(msg => msg.role !== 'system');
    this._messages.unshift({ role: 'system', content: prompt });
    return this;
  }

  /**
   * 사용자 메시지 추가
   */
  user(content: string): this {
    this._messages.push({ role: 'user', content });
    return this;
  }

  /**
   * 어시스턴트 메시지 추가
   */
  assistant(content: string): this {
    this._messages.push({ role: 'assistant', content });
    return this;
  }

  /**
   * 채팅 옵션 설정
   */
  options(options: ChatOptions): this {
    this._options = { ...this._options, ...options };
    return this;
  }

  /**
   * 모델 설정
   */
  model(model: string): this {
    this._options.model = model;
    return this;
  }

  /**
   * 온도 설정
   */
  temperature(temperature: number): this {
    this._options.temperature = temperature;
    return this;
  }

  /**
   * 최대 토큰 수 설정
   */
  maxTokens(maxTokens: number): this {
    this._options.maxTokens = maxTokens;
    return this;
  }

  /**
   * 스트리밍 모드 설정
   */
  stream(enabled = true): this {
    this._options.stream = enabled;
    return this;
  }

  /**
   * Advisor 추가
   */
  advisors(...advisors: Advisor[]): this {
    this._advisors.push(...advisors);
    return this;
  }

  /**
   * 함수 정의 추가 (Function Calling)
   */
  functions(...functions: FunctionDefinition[]): this {
    this._functions.push(...functions);
    return this;
  }

  /**
   * 출력 파서 설정 (Structured Output)
   */
  outputParser<U>(parser: OutputParser<U>): ChatClientRequest<U> {
    const newRequest = this as any as ChatClientRequest<U>;
    newRequest._outputParser = parser;
    
    // 파서의 포맷 지시사항을 시스템 프롬프트에 추가
    const formatInstructions = parser.getFormatInstructions();
    if (formatInstructions) {
      const existingSystem = this._messages.find(msg => msg.role === 'system');
      if (existingSystem) {
        existingSystem.content += '\n\n' + formatInstructions;
      } else {
        this.system(formatInstructions);
      }
    }
    
    return newRequest;
  }

  /**
   * 요청 빌드
   */
  private buildRequest(): ChatRequest {
    return {
      messages: [...this._messages],
      options: { ...this._options }
    };
  }

  /**
   * Advisor 체인 실행 (AdvisorChain 사용)
   */
  private async executeAdvisors(request: ChatRequest): Promise<ChatRequest> {
    if (this._advisors.length === 0) {
      return request;
    }

    // 기존 advisor 배열을 AdvisorChain으로 래핑
    const { AdvisorChain } = await import('./advisors');
    const chain = new AdvisorChain();
    
    this._advisors.forEach(advisor => {
      chain.add(advisor);
    });

    return await chain.executeRequestAdvisors(request);
  }

  /**
   * 응답에 대한 Advisor 실행 (AdvisorChain 사용)
   */
  private async executeResponseAdvisors(response: ChatResponse, originalRequest: ChatRequest): Promise<ChatResponse> {
    if (this._advisors.length === 0) {
      return response;
    }

    // 기존 advisor 배열을 AdvisorChain으로 래핑
    const { AdvisorChain } = await import('./advisors');
    const chain = new AdvisorChain();
    
    this._advisors.forEach(advisor => {
      chain.add(advisor);
    });

    return await chain.executeResponseAdvisors(response, originalRequest);
  }

  /**
   * 실제 API 호출
   */
  private async callApi(request: ChatRequest): Promise<ChatResponse> {
    const { springAIApi } = await import('../../api/spring-ai');
    return await springAIApi.chat.complete(request);
  }

  /**
   * 채팅 요청 실행
   */
  async call(): Promise<T extends any ? ChatResponse : T> {
    try {
      // 1. 요청 빌드
      let request = this.buildRequest();

      // 2. Advisor 체인 실행
      request = await this.executeAdvisors(request);

      // 3. API 호출
      let response = await this.callApi(request);

      // 4. 응답 Advisor 실행
      response = await this.executeResponseAdvisors(response, request);

      // 5. ChatContext와 통합 (기존 시스템과 호환성 유지)
      if (this.chatContext) {
        // ChatContext의 sendMessage와 유사한 동작
        const assistantContent = response.choices[0]?.message?.content || '';
        
        // 이 부분은 실제로는 ChatContext의 내부 구현과 통합되어야 함
        // 현재는 시뮬레이션
        console.log('ChatContext integration:', {
          model: response.model,
          content: assistantContent,
          usage: response.usage
        });
      }

      // 6. 구조화된 출력 파싱
      if (this._outputParser) {
        const parsedResult = await this._outputParser.parse(
          response.choices[0]?.message?.content || ''
        );
        return parsedResult as any;
      }

      return response as any;

    } catch (error) {
      console.error('ChatClient call failed:', error);
      throw error;
    }
  }

  /**
   * 스트리밍 응답
   */
  async *callStream(): AsyncIterableIterator<ChatStreamChunk> {
    try {
      // 1. 요청 빌드
      let request = this.buildRequest();

      // 2. Advisor 체인 실행
      request = await this.executeAdvisors(request);

      // 3. 스트리밍 API 호출
      const { springAIApi } = await import('../../api/spring-ai');
      const streamGenerator = await springAIApi.chat.stream(request);
      
      for await (const chunk of streamGenerator) {
        yield chunk;
      }

    } catch (error) {
      console.error('ChatClient streaming failed:', error);
      throw error;
    }
  }

  /**
   * 요청 복제
   */
  clone(): ChatClientRequest<T> {
    const cloned = new ChatClientRequest<T>(undefined, this.chatContext);
    cloned._messages = [...this._messages];
    cloned._options = { ...this._options };
    cloned._advisors = [...this._advisors];
    cloned._functions = [...this._functions];
    cloned._outputParser = this._outputParser;
    return cloned;
  }
}

/**
 * Spring AI 스타일의 ChatClient 클래스
 */
export class ChatClient {
  private chatContext?: ReturnType<typeof useChat>;

  constructor(chatContext?: ReturnType<typeof useChat>) {
    this.chatContext = chatContext;
  }

  /**
   * 새로운 대화 시작
   */
  prompt(text: string): ChatClientRequest {
    return new ChatClientRequest(text, this.chatContext);
  }

  /**
   * 빈 요청으로 시작 (시스템 프롬프트부터 설정할 때 유용)
   */
  create(): ChatClientRequest {
    return new ChatClientRequest(undefined, this.chatContext);
  }

  /**
   * ChatContext와 연결된 클라이언트 생성
   */
  static withContext(chatContext: ReturnType<typeof useChat>): ChatClient {
    return new ChatClient(chatContext);
  }
}

/**
 * React Hook으로 ChatClient 사용
 */
export function useChatClient(): ChatClient {
  const chatContext = useChat();
  return new ChatClient(chatContext);
}

// 기본 export
export default ChatClient;