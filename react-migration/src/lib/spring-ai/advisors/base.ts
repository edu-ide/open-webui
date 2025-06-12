import type { ChatRequest, ChatResponse } from '../types';

/**
 * Spring AI Advisor 인터페이스
 * 채팅 요청과 응답을 가로채고 수정할 수 있는 기본 인터페이스
 */
export interface Advisor {
  /** Advisor 이름 (식별용) */
  name: string;
  
  /** Advisor 설명 */
  description?: string;
  
  /** Advisor 활성화 여부 */
  enabled: boolean;
  
  /** 우선순위 (낮을수록 먼저 실행) */
  priority: number;
  
  /**
   * 요청 전처리
   * @param request 채팅 요청
   * @returns 수정된 채팅 요청
   */
  adviseRequest?(request: ChatRequest): Promise<ChatRequest> | ChatRequest;
  
  /**
   * 응답 후처리
   * @param response 채팅 응답
   * @param originalRequest 원본 요청
   * @returns 수정된 채팅 응답
   */
  adviseResponse?(response: ChatResponse, originalRequest: ChatRequest): Promise<ChatResponse> | ChatResponse;
  
  /**
   * Advisor 초기화
   */
  initialize?(): Promise<void> | void;
  
  /**
   * Advisor 정리
   */
  cleanup?(): Promise<void> | void;
}

/**
 * 기본 Advisor 추상 클래스
 */
export abstract class BaseAdvisor implements Advisor {
  public enabled: boolean = true;
  public priority: number = 100;
  public name: string;
  public description?: string;
  
  constructor(name: string, description?: string, priority?: number) {
    this.name = name;
    this.description = description;
    if (priority !== undefined) {
      this.priority = priority;
    }
  }
  
  /**
   * Advisor 활성화/비활성화
   */
  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    return this;
  }
  
  /**
   * 우선순위 설정
   */
  setPriority(priority: number): this {
    this.priority = priority;
    return this;
  }
  
  /**
   * 기본 요청 처리 (하위 클래스에서 오버라이드)
   */
  adviseRequest(request: ChatRequest): Promise<ChatRequest> | ChatRequest {
    return request;
  }
  
  /**
   * 기본 응답 처리 (하위 클래스에서 오버라이드)
   */
  adviseResponse(response: ChatResponse, _originalRequest: ChatRequest): Promise<ChatResponse> | ChatResponse {
    return response;
  }
  
  /**
   * 기본 초기화
   */
  async initialize(): Promise<void> {
    // 기본 구현은 빈 메서드
  }
  
  /**
   * 기본 정리
   */
  async cleanup(): Promise<void> {
    // 기본 구현은 빈 메서드
  }
}

/**
 * Advisor 체인 관리 클래스
 */
export class AdvisorChain {
  private advisors: Advisor[] = [];
  private initialized: boolean = false;
  
  /**
   * Advisor 추가
   */
  add(advisor: Advisor): this {
    this.advisors.push(advisor);
    this.advisors.sort((a, b) => a.priority - b.priority);
    return this;
  }
  
  /**
   * 여러 Advisor 추가
   */
  addAll(...advisors: Advisor[]): this {
    advisors.forEach(advisor => this.add(advisor));
    return this;
  }
  
  /**
   * Advisor 제거
   */
  remove(advisorName: string): this {
    this.advisors = this.advisors.filter(advisor => advisor.name !== advisorName);
    return this;
  }
  
  /**
   * 모든 Advisor 제거
   */
  clear(): this {
    this.advisors = [];
    return this;
  }
  
  /**
   * 활성화된 Advisor 목록 반환
   */
  getActiveAdvisors(): Advisor[] {
    return this.advisors.filter(advisor => advisor.enabled);
  }
  
  /**
   * 체인 초기화
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    for (const advisor of this.advisors) {
      if (advisor.initialize) {
        await advisor.initialize();
      }
    }
    
    this.initialized = true;
  }
  
  /**
   * 체인 정리
   */
  async cleanup(): Promise<void> {
    for (const advisor of this.advisors) {
      if (advisor.cleanup) {
        await advisor.cleanup();
      }
    }
    
    this.initialized = false;
  }
  
  /**
   * 요청에 대한 Advisor 체인 실행
   */
  async executeRequestAdvisors(request: ChatRequest): Promise<ChatRequest> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    let processedRequest = request;
    const activeAdvisors = this.getActiveAdvisors();
    
    for (const advisor of activeAdvisors) {
      if (advisor.adviseRequest) {
        try {
          const result = advisor.adviseRequest(processedRequest);
          processedRequest = result instanceof Promise ? await result : result;
        } catch (error) {
          console.error(`Advisor ${advisor.name} request processing failed:`, error);
          // 에러가 발생해도 체인 진행을 멈추지 않음
        }
      }
    }
    
    return processedRequest;
  }
  
  /**
   * 응답에 대한 Advisor 체인 실행
   */
  async executeResponseAdvisors(response: ChatResponse, originalRequest: ChatRequest): Promise<ChatResponse> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    let processedResponse = response;
    const activeAdvisors = this.getActiveAdvisors();
    
    // 응답 처리는 역순으로 실행 (LIFO)
    for (let i = activeAdvisors.length - 1; i >= 0; i--) {
      const advisor = activeAdvisors[i];
      if (advisor.adviseResponse) {
        try {
          const result = advisor.adviseResponse(processedResponse, originalRequest);
          processedResponse = result instanceof Promise ? await result : result;
        } catch (error) {
          console.error(`Advisor ${advisor.name} response processing failed:`, error);
          // 에러가 발생해도 체인 진행을 멈추지 않음
        }
      }
    }
    
    return processedResponse;
  }
  
  /**
   * 체인 상태 정보
   */
  getChainInfo(): {
    total: number;
    active: number;
    advisors: Array<{
      name: string;
      description?: string;
      enabled: boolean;
      priority: number;
    }>;
  } {
    return {
      total: this.advisors.length,
      active: this.getActiveAdvisors().length,
      advisors: this.advisors.map(advisor => ({
        name: advisor.name,
        description: advisor.description,
        enabled: advisor.enabled,
        priority: advisor.priority
      }))
    };
  }
}

/**
 * 전역 기본 Advisor 체인
 */
export const defaultAdvisorChain = new AdvisorChain();

/**
 * Advisor 유틸리티 함수들
 */
export const AdvisorUtils = {
  /**
   * 메시지 내용 안전성 검사
   */
  isSafeContent(content: string): boolean {
    const unsafePatterns = [
      /password|secret|token|key/i,
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // 신용카드 번호 패턴
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN 패턴
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi // 스크립트 태그
    ];
    
    return !unsafePatterns.some(pattern => pattern.test(content));
  },
  
  /**
   * 메시지 길이 제한 확인
   */
  isWithinLimits(content: string, maxLength: number = 4000): boolean {
    return content.length <= maxLength;
  },
  
  /**
   * 민감한 정보 마스킹
   */
  maskSensitiveInfo(content: string): string {
    return content
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '**** **** **** ****')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****')
      .replace(/password\s*[:=]\s*\S+/gi, 'password: ****');
  },
  
  /**
   * 토큰 수 추정
   */
  estimateTokens(content: string): number {
    // 대략적인 토큰 수 계산 (영어 기준 1토큰 ≈ 4글자)
    return Math.ceil(content.length / 4);
  }
};

export default BaseAdvisor;