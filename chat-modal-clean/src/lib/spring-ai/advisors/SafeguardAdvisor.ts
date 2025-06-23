import { BaseAdvisor, AdvisorUtils } from './base';
import type { ChatRequest, ChatResponse } from '../types';

/**
 * 안전가드 옵션
 */
export interface SafeguardAdvisorOptions {
  /** 민감한 정보 필터링 활성화 */
  enableContentFiltering?: boolean;
  /** 개인정보 마스킹 활성화 */
  enablePrivacyMasking?: boolean;
  /** 메시지 길이 제한 */
  maxMessageLength?: number;
  /** 차단할 키워드 목록 */
  blockedKeywords?: string[];
  /** 허용된 도메인 목록 (URL 필터링용) */
  allowedDomains?: string[];
  /** 스팸 방지 활성화 */
  enableSpamPrevention?: boolean;
  /** 동일 메시지 반복 제한 */
  maxRepeatMessages?: number;
  /** 레이트 리미팅 (분당 최대 요청 수) */
  rateLimit?: number;
  /** 로깅 활성화 */
  enableLogging?: boolean;
}

/**
 * 필터링 결과
 */
export interface FilterResult {
  allowed: boolean;
  reason?: string;
  filteredContent?: string;
  riskLevel: 'low' | 'medium' | 'high';
  flags: string[];
}

/**
 * 안전가드 Advisor
 * 부적절한 콘텐츠 필터링, 개인정보 보호, 스팸 방지 등을 담당합니다.
 */
export class SafeguardAdvisor extends BaseAdvisor {
  private options: Required<SafeguardAdvisorOptions>;
  private recentMessages: Map<string, number> = new Map();
  private requestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  private blockedPatterns: RegExp[] = [];

  constructor(options: SafeguardAdvisorOptions = {}) {
    super(
      'SafeguardAdvisor',
      '콘텐츠 필터링 및 안전가드',
      20 // 중간 우선순위
    );

    this.options = {
      enableContentFiltering: options.enableContentFiltering ?? true,
      enablePrivacyMasking: options.enablePrivacyMasking ?? true,
      maxMessageLength: options.maxMessageLength ?? 4000,
      blockedKeywords: options.blockedKeywords ?? [
        'password', 'secret', 'token', 'api_key',
        'private_key', 'credit_card', '주민번호', '비밀번호'
      ],
      allowedDomains: options.allowedDomains ?? [
        'openai.com', 'anthropic.com', 'google.com',
        'github.com', 'stackoverflow.com', 'wikipedia.org'
      ],
      enableSpamPrevention: options.enableSpamPrevention ?? true,
      maxRepeatMessages: options.maxRepeatMessages ?? 3,
      rateLimit: options.rateLimit ?? 60,
      enableLogging: options.enableLogging ?? true
    };

    this.initializeBlockedPatterns();
  }

  /**
   * 차단 패턴 초기화
   */
  private initializeBlockedPatterns(): void {
    this.blockedPatterns = [
      // 개인정보 패턴
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // 신용카드
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{6}-\d{7}\b/, // 주민번호
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // 이메일 (완전 차단 아닌 마스킹용)
      
      // 보안 정보 패턴
      /api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/i,
      /token\s*[:=]\s*['"]?[a-zA-Z0-9]{20,}['"]?/i,
      /password\s*[:=]\s*['"]?[^\s'"]+['"]?/i,
      
      // 악성 스크립트 패턴
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      
      // 부적절한 링크 패턴
      /https?:\/\/[^\s]+\.(exe|zip|rar|bat|cmd|scr|vbs)/gi
    ];
  }

  /**
   * 요청 전처리 - 콘텐츠 필터링
   */
  async adviseRequest(request: ChatRequest): Promise<ChatRequest> {
    if (!this.enabled) return request;

    const processedMessages = [];
    
    for (const message of request.messages) {
      // 레이트 리미팅 체크
      if (!this.checkRateLimit(message.content)) {
        throw new Error('Rate limit exceeded. Please wait before sending more messages.');
      }

      // 콘텐츠 필터링
      const filterResult = this.filterContent(message.content);
      
      if (!filterResult.allowed) {
        this.log('Blocked message', { reason: filterResult.reason, flags: filterResult.flags });
        throw new Error(`Message blocked: ${filterResult.reason}`);
      }

      // 스팸 방지
      if (this.options.enableSpamPrevention && this.isSpam(message.content)) {
        this.log('Spam detected', { content: message.content.substring(0, 100) });
        throw new Error('Spam detected. Please avoid sending repetitive messages.');
      }

      // 필터링된 콘텐츠로 메시지 업데이트
      processedMessages.push({
        ...message,
        content: filterResult.filteredContent || message.content
      });
    }

    return {
      ...request,
      messages: processedMessages
    };
  }

  /**
   * 응답 후처리 - 응답 콘텐츠 검증
   */
  async adviseResponse(response: ChatResponse, _originalRequest: ChatRequest): Promise<ChatResponse> {
    if (!this.enabled) return response;

    const processedChoices = response.choices.map(choice => {
      if (choice.message?.content) {
        const filterResult = this.filterContent(choice.message.content);
        
        if (!filterResult.allowed) {
          this.log('Blocked response', { reason: filterResult.reason });
          return {
            ...choice,
            message: {
              ...choice.message,
              content: 'I apologize, but I cannot provide that information due to safety guidelines.'
            }
          };
        }

        return {
          ...choice,
          message: {
            ...choice.message,
            content: filterResult.filteredContent || choice.message.content
          }
        };
      }
      return choice;
    });

    return {
      ...response,
      choices: processedChoices
    };
  }

  /**
   * 콘텐츠 필터링
   */
  private filterContent(content: string): FilterResult {
    const flags: string[] = [];
    let filteredContent = content;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    // 길이 체크
    if (!AdvisorUtils.isWithinLimits(content, this.options.maxMessageLength)) {
      return {
        allowed: false,
        reason: `Message too long (max ${this.options.maxMessageLength} characters)`,
        riskLevel: 'medium',
        flags: ['length_exceeded']
      };
    }

    // 차단된 키워드 체크
    const lowerContent = content.toLowerCase();
    for (const keyword of this.options.blockedKeywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        flags.push(`blocked_keyword:${keyword}`);
        riskLevel = 'high';
      }
    }

    // 개인정보 및 보안 정보 패턴 체크
    for (const pattern of this.blockedPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        flags.push(`pattern_match:${pattern.source.substring(0, 20)}...`);
        
        // 마스킹 적용
        if (this.options.enablePrivacyMasking) {
          filteredContent = AdvisorUtils.maskSensitiveInfo(filteredContent);
        } else {
          riskLevel = 'high';
        }
      }
    }

    // 안전성 체크
    if (!AdvisorUtils.isSafeContent(content)) {
      flags.push('unsafe_content');
      riskLevel = 'high';
    }

    // 높은 위험도면 차단
    if (riskLevel === 'high' && flags.length > 0 && !this.options.enablePrivacyMasking) {
      return {
        allowed: false,
        reason: `Content contains prohibited patterns: ${flags.join(', ')}`,
        riskLevel,
        flags
      };
    }

    // URL 검증
    const urls = this.extractUrls(content);
    for (const url of urls) {
      if (!this.isAllowedUrl(url)) {
        flags.push(`blocked_url:${url}`);
        riskLevel = 'medium';
        filteredContent = filteredContent.replace(url, '[BLOCKED_URL]');
      }
    }

    return {
      allowed: true,
      filteredContent: filteredContent !== content ? filteredContent : undefined,
      riskLevel,
      flags
    };
  }

  /**
   * 레이트 리미팅 체크
   */
  private checkRateLimit(content: string): boolean {
    if (!this.options.rateLimit) return true;

    const now = Date.now();
    const userId = this.getUserId(content); // 실제로는 사용자 ID를 다른 방식으로 가져와야 함
    const userLimit = this.requestCounts.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      this.requestCounts.set(userId, {
        count: 1,
        resetTime: now + 60000 // 1분
      });
      return true;
    }

    if (userLimit.count >= this.options.rateLimit) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  /**
   * 스팸 감지
   */
  private isSpam(content: string): boolean {
    if (!this.options.enableSpamPrevention) return false;

    const contentHash = this.hashContent(content);
    const count = this.recentMessages.get(contentHash) || 0;

    if (count >= this.options.maxRepeatMessages) {
      return true;
    }

    this.recentMessages.set(contentHash, count + 1);
    
    // 5분 후 카운트 리셋
    setTimeout(() => {
      this.recentMessages.delete(contentHash);
    }, 5 * 60 * 1000);

    return false;
  }

  /**
   * URL 추출
   */
  private extractUrls(content: string): string[] {
    const urlPattern = /https?:\/\/[^\s]+/gi;
    return content.match(urlPattern) || [];
  }

  /**
   * 허용된 URL인지 확인
   */
  private isAllowedUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      
      return this.options.allowedDomains.some(allowedDomain =>
        domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)
      );
    } catch {
      return false; // 잘못된 URL은 차단
    }
  }

  /**
   * 사용자 ID 생성 (임시 구현)
   */
  private getUserId(_content: string): string {
    // 실제로는 세션이나 인증 정보에서 가져와야 함
    return 'anonymous';
  }

  /**
   * 콘텐츠 해시 생성
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32비트 정수로 변환
    }
    return hash.toString();
  }

  /**
   * 로깅
   */
  private log(event: string, data?: any): void {
    if (this.options.enableLogging) {
      console.log(`[SafeguardAdvisor] ${event}:`, data);
    }
  }

  /**
   * 필터링 통계 조회
   */
  public getFilteringStats(): {
    totalRequests: number;
    blockedRequests: number;
    flaggedContent: number;
    topFlags: Array<{ flag: string; count: number }>;
  } {
    // 실제 구현에서는 통계를 추적해야 함
    return {
      totalRequests: 0,
      blockedRequests: 0,
      flaggedContent: 0,
      topFlags: []
    };
  }

  /**
   * 차단된 키워드 추가
   */
  public addBlockedKeyword(keyword: string): void {
    if (!this.options.blockedKeywords.includes(keyword)) {
      this.options.blockedKeywords.push(keyword);
    }
  }

  /**
   * 차단된 키워드 제거
   */
  public removeBlockedKeyword(keyword: string): void {
    const index = this.options.blockedKeywords.indexOf(keyword);
    if (index > -1) {
      this.options.blockedKeywords.splice(index, 1);
    }
  }

  /**
   * 허용된 도메인 추가
   */
  public addAllowedDomain(domain: string): void {
    if (!this.options.allowedDomains.includes(domain)) {
      this.options.allowedDomains.push(domain);
    }
  }

  /**
   * 허용된 도메인 제거
   */
  public removeAllowedDomain(domain: string): void {
    const index = this.options.allowedDomains.indexOf(domain);
    if (index > -1) {
      this.options.allowedDomains.splice(index, 1);
    }
  }

  /**
   * 설정 업데이트
   */
  public updateOptions(newOptions: Partial<SafeguardAdvisorOptions>): void {
    this.options = { ...this.options, ...newOptions };
    if (newOptions.blockedKeywords) {
      this.initializeBlockedPatterns();
    }
  }

  /**
   * 현재 설정 조회
   */
  public getOptions(): SafeguardAdvisorOptions {
    return { ...this.options };
  }
}

export default SafeguardAdvisor;