import { BaseAdvisor } from './base';
import type { ChatRequest, ChatResponse, ChatMessage } from '../types';

/**
 * 대화 메모리 관리 옵션
 */
export interface MemoryAdvisorOptions {
  /** 유지할 최대 메시지 수 */
  maxMessages?: number;
  /** 유지할 최대 토큰 수 */
  maxTokens?: number;
  /** 시스템 메시지 항상 유지 여부 */
  preserveSystemMessage?: boolean;
  /** 중요한 메시지 유지 여부 */
  preserveImportantMessages?: boolean;
  /** 메모리 압축 활성화 여부 */
  enableCompression?: boolean;
  /** 로컬 스토리지 저장 여부 */
  persistToStorage?: boolean;
  /** 스토리지 키 */
  storageKey?: string;
}

/**
 * 대화 세션 인터페이스
 */
export interface ConversationSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastUpdatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * 메모리 Advisor
 * 대화 기록을 관리하고 컨텍스트 윈도우를 유지합니다.
 */
export class MemoryAdvisor extends BaseAdvisor {
  private sessions: Map<string, ConversationSession> = new Map();
  private currentSessionId: string | null = null;
  private options: Required<MemoryAdvisorOptions>;

  constructor(options: MemoryAdvisorOptions = {}) {
    super(
      'MemoryAdvisor',
      '대화 기록 관리 및 컨텍스트 유지',
      10 // 높은 우선순위
    );

    this.options = {
      maxMessages: options.maxMessages ?? 20,
      maxTokens: options.maxTokens ?? 3000,
      preserveSystemMessage: options.preserveSystemMessage ?? true,
      preserveImportantMessages: options.preserveImportantMessages ?? true,
      enableCompression: options.enableCompression ?? false,
      persistToStorage: options.persistToStorage ?? true,
      storageKey: options.storageKey ?? 'spring-ai-memory'
    };
  }

  /**
   * 초기화 - 저장된 세션 로드
   */
  async initialize(): Promise<void> {
    if (this.options.persistToStorage && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.options.storageKey);
        if (stored) {
          const data = JSON.parse(stored);
          this.sessions = new Map(
            Object.entries(data.sessions).map(([id, session]: [string, any]) => [
              id,
              {
                ...session,
                createdAt: new Date(session.createdAt),
                lastUpdatedAt: new Date(session.lastUpdatedAt)
              }
            ])
          );
          this.currentSessionId = data.currentSessionId;
        }
      } catch (error) {
        console.warn('Failed to load memory from storage:', error);
      }
    }
  }

  /**
   * 정리 - 세션 저장
   */
  async cleanup(): Promise<void> {
    await this.saveToStorage();
  }

  /**
   * 요청 전처리 - 대화 기록 추가
   */
  async adviseRequest(request: ChatRequest): Promise<ChatRequest> {
    if (!this.enabled) return request;

    // 현재 세션 가져오기 또는 생성
    const session = this.getCurrentSession();
    
    // 새 메시지들을 세션에 추가
    const newMessages = request.messages.filter(msg => 
      !session.messages.some(existing => 
        existing.content === msg.content && 
        existing.role === msg.role
      )
    );

    if (newMessages.length > 0) {
      session.messages.push(...newMessages);
      session.lastUpdatedAt = new Date();
    }

    // 컨텍스트 윈도우 관리
    const managedMessages = this.manageContextWindow(session.messages);

    // 수정된 요청 반환
    const processedRequest: ChatRequest = {
      ...request,
      messages: managedMessages
    };

    // 저장
    await this.saveToStorage();

    return processedRequest;
  }

  /**
   * 응답 후처리 - 응답을 세션에 저장
   */
  async adviseResponse(response: ChatResponse, _originalRequest: ChatRequest): Promise<ChatResponse> {
    if (!this.enabled) return response;

    const session = this.getCurrentSession();
    
    // AI 응답을 세션에 추가
    if (response.choices.length > 0) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.choices[0].message.content
      };

      // 중복 체크
      const isDuplicate = session.messages.some(msg => 
        msg.role === 'assistant' && 
        msg.content === assistantMessage.content
      );

      if (!isDuplicate) {
        session.messages.push(assistantMessage);
        session.lastUpdatedAt = new Date();
        await this.saveToStorage();
      }
    }

    return response;
  }

  /**
   * 현재 세션 가져오기 또는 생성
   */
  private getCurrentSession(): ConversationSession {
    if (!this.currentSessionId || !this.sessions.has(this.currentSessionId)) {
      this.createNewSession();
    }
    
    return this.sessions.get(this.currentSessionId!)!;
  }

  /**
   * 새 세션 생성
   */
  public createNewSession(sessionId?: string): string {
    const id = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session: ConversationSession = {
      id,
      messages: [],
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
      metadata: {}
    };

    this.sessions.set(id, session);
    this.currentSessionId = id;
    
    return id;
  }

  /**
   * 세션 전환
   */
  public switchToSession(sessionId: string): boolean {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      return true;
    }
    return false;
  }

  /**
   * 컨텍스트 윈도우 관리
   */
  private manageContextWindow(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) return messages;

    let managedMessages = [...messages];

    // 1. 토큰 수 기반 제한
    if (this.options.maxTokens > 0) {
      managedMessages = this.limitByTokens(managedMessages);
    }

    // 2. 메시지 수 기반 제한
    if (this.options.maxMessages > 0) {
      managedMessages = this.limitByMessageCount(managedMessages);
    }

    // 3. 중요한 메시지 보존
    if (this.options.preserveImportantMessages) {
      managedMessages = this.preserveImportantMessages(managedMessages, messages);
    }

    // 4. 시스템 메시지 보존
    if (this.options.preserveSystemMessage) {
      managedMessages = this.preserveSystemMessage(managedMessages, messages);
    }

    return managedMessages;
  }

  /**
   * 토큰 수 기반 제한
   */
  private limitByTokens(messages: ChatMessage[]): ChatMessage[] {
    let totalTokens = 0;
    const result: ChatMessage[] = [];

    // 최신 메시지부터 역순으로 처리
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageTokens = this.estimateTokens(message.content);
      
      if (totalTokens + messageTokens <= this.options.maxTokens) {
        result.unshift(message);
        totalTokens += messageTokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * 메시지 수 기반 제한
   */
  private limitByMessageCount(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= this.options.maxMessages) {
      return messages;
    }

    return messages.slice(-this.options.maxMessages);
  }

  /**
   * 시스템 메시지 보존
   */
  private preserveSystemMessage(managedMessages: ChatMessage[], originalMessages: ChatMessage[]): ChatMessage[] {
    const systemMessage = originalMessages.find(msg => msg.role === 'system');
    if (systemMessage && !managedMessages.some(msg => msg.role === 'system')) {
      return [systemMessage, ...managedMessages.filter(msg => msg.role !== 'system')];
    }
    return managedMessages;
  }

  /**
   * 중요한 메시지 보존 (예: 사용자가 명시적으로 중요하다고 표시한 메시지)
   */
  private preserveImportantMessages(managedMessages: ChatMessage[], originalMessages: ChatMessage[]): ChatMessage[] {
    // 중요한 메시지 패턴 (예: "중요:", "기억해:", "Remember:" 등으로 시작)
    const importantPatterns = [
      /^(중요|기억|참고|주의)[:：]/,
      /^(important|remember|note|attention)[:：]/i
    ];

    const importantMessages = originalMessages.filter(msg =>
      importantPatterns.some(pattern => pattern.test(msg.content))
    );

    // 중요한 메시지가 관리된 메시지에 없으면 추가
    const result = [...managedMessages];
    importantMessages.forEach(important => {
      if (!result.some(msg => msg.content === important.content)) {
        result.unshift(important);
      }
    });

    return result;
  }

  /**
   * 토큰 수 추정
   */
  private estimateTokens(content: string): number {
    // 간단한 토큰 추정 (실제로는 더 정교한 방법 사용)
    return Math.ceil(content.length / 4);
  }

  /**
   * 로컬 스토리지에 저장
   */
  private async saveToStorage(): Promise<void> {
    if (this.options.persistToStorage && typeof window !== 'undefined') {
      try {
        const data = {
          currentSessionId: this.currentSessionId,
          sessions: Object.fromEntries(this.sessions.entries())
        };
        localStorage.setItem(this.options.storageKey, JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to save memory to storage:', error);
      }
    }
  }

  /**
   * 세션 정보 조회
   */
  public getSessionInfo(sessionId?: string): ConversationSession | null {
    const id = sessionId || this.currentSessionId;
    return id ? this.sessions.get(id) || null : null;
  }

  /**
   * 모든 세션 목록 조회
   */
  public getAllSessions(): ConversationSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 세션 삭제
   */
  public deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
    this.saveToStorage();
    return deleted;
  }

  /**
   * 모든 세션 삭제
   */
  public clearAllSessions(): void {
    this.sessions.clear();
    this.currentSessionId = null;
    this.saveToStorage();
  }

  /**
   * 메모리 통계 조회
   */
  public getMemoryStats(): {
    totalSessions: number;
    currentSessionMessages: number;
    totalMessages: number;
    averageSessionLength: number;
  } {
    const totalSessions = this.sessions.size;
    const currentSession = this.getCurrentSession();
    const currentSessionMessages = currentSession.messages.length;
    const totalMessages = Array.from(this.sessions.values())
      .reduce((sum, session) => sum + session.messages.length, 0);
    const averageSessionLength = totalSessions > 0 ? totalMessages / totalSessions : 0;

    return {
      totalSessions,
      currentSessionMessages,
      totalMessages,
      averageSessionLength: Math.round(averageSessionLength * 100) / 100
    };
  }
}

export default MemoryAdvisor;