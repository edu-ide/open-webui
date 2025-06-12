import { BaseAdvisor } from './base';
import type { ChatRequest } from '../types';

/**
 * 프롬프트 강화 옵션
 */
export interface PromptEnhancerAdvisorOptions {
  /** 자동 컨텍스트 추가 */
  enableAutoContext?: boolean;
  /** 명확성 향상 */
  enableClarityEnhancement?: boolean;
  /** 예제 자동 추가 */
  enableExampleInjection?: boolean;
  /** 구조화된 출력 유도 */
  enableStructuredOutput?: boolean;
  /** 언어 감지 및 조정 */
  enableLanguageDetection?: boolean;
  /** 전문성 수준 조정 */
  enableExpertiseAdjustment?: boolean;
  /** 창의성 수준 조정 */
  enableCreativityAdjustment?: boolean;
  /** 커스텀 프롬프트 템플릿 */
  customTemplates?: Record<string, string>;
  /** 도메인별 강화 규칙 */
  domainRules?: Record<string, PromptRule[]>;
}

/**
 * 프롬프트 규칙
 */
export interface PromptRule {
  name: string;
  condition: (content: string) => boolean;
  enhancement: (content: string) => string;
  priority: number;
}

/**
 * 강화 결과
 */
export interface EnhancementResult {
  originalContent: string;
  enhancedContent: string;
  appliedRules: string[];
  confidence: number;
}

/**
 * 프롬프트 강화 Advisor
 * 사용자의 프롬프트를 더 효과적으로 만들어 AI의 응답 품질을 향상시킵니다.
 */
export class PromptEnhancerAdvisor extends BaseAdvisor {
  private options: Required<PromptEnhancerAdvisorOptions>;
  private builtInRules: PromptRule[] = [];
  private enhancementHistory: Map<string, EnhancementResult[]> = new Map();

  constructor(options: PromptEnhancerAdvisorOptions = {}) {
    super(
      'PromptEnhancerAdvisor',
      '프롬프트 품질 향상 및 최적화',
      30 // 낮은 우선순위 (다른 advisor 후에 실행)
    );

    this.options = {
      enableAutoContext: options.enableAutoContext ?? true,
      enableClarityEnhancement: options.enableClarityEnhancement ?? true,
      enableExampleInjection: options.enableExampleInjection ?? false,
      enableStructuredOutput: options.enableStructuredOutput ?? false,
      enableLanguageDetection: options.enableLanguageDetection ?? true,
      enableExpertiseAdjustment: options.enableExpertiseAdjustment ?? false,
      enableCreativityAdjustment: options.enableCreativityAdjustment ?? false,
      customTemplates: options.customTemplates ?? {},
      domainRules: options.domainRules ?? {}
    };

    this.initializeBuiltInRules();
  }

  /**
   * 내장 규칙 초기화
   */
  private initializeBuiltInRules(): void {
    this.builtInRules = [
      // 질문 명확화 규칙
      {
        name: 'clarify_vague_questions',
        condition: (content) => this.isVagueQuestion(content),
        enhancement: (content) => this.clarifyQuestion(content),
        priority: 10
      },
      
      // 컨텍스트 추가 규칙
      {
        name: 'add_context',
        condition: (content) => this.needsContext(content),
        enhancement: (content) => this.addContext(content),
        priority: 20
      },
      
      // 코딩 관련 강화
      {
        name: 'enhance_coding_request',
        condition: (content) => this.isCodingRequest(content),
        enhancement: (content) => this.enhanceCodingRequest(content),
        priority: 15
      },
      
      // 설명 요청 강화
      {
        name: 'enhance_explanation_request',
        condition: (content) => this.isExplanationRequest(content),
        enhancement: (content) => this.enhanceExplanationRequest(content),
        priority: 25
      },
      
      // 번역 요청 강화
      {
        name: 'enhance_translation_request',
        condition: (content) => this.isTranslationRequest(content),
        enhancement: (content) => this.enhanceTranslationRequest(content),
        priority: 15
      },
      
      // 창작 요청 강화
      {
        name: 'enhance_creative_request',
        condition: (content) => this.isCreativeRequest(content),
        enhancement: (content) => this.enhanceCreativeRequest(content),
        priority: 20
      }
    ];
  }

  /**
   * 요청 전처리 - 프롬프트 강화
   */
  async adviseRequest(request: ChatRequest): Promise<ChatRequest> {
    if (!this.enabled) return request;

    const enhancedMessages = [];

    for (const message of request.messages) {
      if (message.role === 'user') {
        const enhancementResult = this.enhancePrompt(message.content);
        
        // 강화 기록 저장
        const sessionId = this.getSessionId(request);
        if (!this.enhancementHistory.has(sessionId)) {
          this.enhancementHistory.set(sessionId, []);
        }
        this.enhancementHistory.get(sessionId)!.push(enhancementResult);

        enhancedMessages.push({
          ...message,
          content: enhancementResult.enhancedContent
        });
      } else {
        enhancedMessages.push(message);
      }
    }

    return {
      ...request,
      messages: enhancedMessages
    };
  }

  /**
   * 프롬프트 강화 메인 로직
   */
  private enhancePrompt(content: string): EnhancementResult {
    let enhancedContent = content;
    const appliedRules: string[] = [];
    let confidence = 1.0;

    // 언어 감지 (향후 다국어 지원시 활용)
    // const language = this.detectLanguage(content);

    // 모든 규칙 수집 및 정렬
    const allRules = [...this.builtInRules];
    
    // 도메인별 규칙 추가
    Object.values(this.options.domainRules).forEach(rules => {
      allRules.push(...rules);
    });

    // 우선순위순으로 정렬
    allRules.sort((a, b) => a.priority - b.priority);

    // 규칙 적용
    for (const rule of allRules) {
      if (rule.condition(enhancedContent)) {
        try {
          const previousContent = enhancedContent;
          enhancedContent = rule.enhancement(enhancedContent);
          
          if (enhancedContent !== previousContent) {
            appliedRules.push(rule.name);
          }
        } catch (error) {
          console.warn(`Enhancement rule ${rule.name} failed:`, error);
          confidence *= 0.9; // 신뢰도 감소
        }
      }
    }

    // 구조화된 출력 요청 추가
    if (this.options.enableStructuredOutput && this.shouldAddStructuredOutput(content)) {
      enhancedContent = this.addStructuredOutputRequest(enhancedContent);
      appliedRules.push('structured_output');
    }

    return {
      originalContent: content,
      enhancedContent,
      appliedRules,
      confidence
    };
  }

  /**
   * 모호한 질문 감지
   */
  private isVagueQuestion(content: string): boolean {
    const vaguePatterns = [
      /^(뭐|what|how)\s*[?？]?$/i,
      /^(어떻게|how do i)\s*[?？]?$/i,
      /^(설명|explain)\s*[?？]?$/i,
      /^(도움|help)\s*[?？]?$/i
    ];
    
    return vaguePatterns.some(pattern => pattern.test(content.trim()));
  }

  /**
   * 질문 명확화
   */
  private clarifyQuestion(content: string): string {
    const clarifications = {
      'ko': '구체적으로 어떤 부분에 대해 알고 싶으신가요? 더 자세한 정보를 제공해주시면 정확한 답변을 드릴 수 있습니다.',
      'en': 'Could you please be more specific about what you would like to know? More details would help me provide a more accurate answer.'
    };
    
    const language = this.detectLanguage(content);
    const clarification = clarifications[language as keyof typeof clarifications] || clarifications.en;
    
    return `${content}\n\n[참고: ${clarification}]`;
  }

  /**
   * 컨텍스트 필요성 감지
   */
  private needsContext(content: string): boolean {
    const contextNeededPatterns = [
      /\b(이것|그것|저것|this|that)\b/i,
      /\b(위에서|앞에서|above|earlier)\b/i,
      /\b(해결|fix|solve)\b/i
    ];
    
    return contextNeededPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 컨텍스트 추가
   */
  private addContext(content: string): string {
    const contextPrompt = this.detectLanguage(content) === 'ko' 
      ? '\n\n맥락: 이전 대화의 내용을 참고하여 답변해주세요.'
      : '\n\nContext: Please refer to the previous conversation when answering.';
    
    return content + contextPrompt;
  }

  /**
   * 코딩 요청 감지
   */
  private isCodingRequest(content: string): boolean {
    const codingKeywords = [
      'code', 'coding', 'programming', 'function', 'class', 'method',
      '코드', '프로그래밍', '함수', '클래스', '메서드',
      'javascript', 'python', 'typescript', 'react', 'vue', 'angular'
    ];
    
    return codingKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 코딩 요청 강화
   */
  private enhanceCodingRequest(content: string): string {
    const language = this.detectLanguage(content);
    const enhancement = language === 'ko' 
      ? '\n\n요구사항: 코드와 함께 주석과 설명을 포함해주세요. 가능하다면 예제도 제공해주세요.'
      : '\n\nRequirements: Please include comments and explanations with the code. Examples would be helpful if possible.';
    
    return content + enhancement;
  }

  /**
   * 설명 요청 감지
   */
  private isExplanationRequest(content: string): boolean {
    const explanationKeywords = [
      'explain', 'what is', 'how does', 'why',
      '설명', '뭔가요', '어떻게', '왜', '무엇인가'
    ];
    
    return explanationKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 설명 요청 강화
   */
  private enhanceExplanationRequest(content: string): string {
    const language = this.detectLanguage(content);
    const enhancement = language === 'ko'
      ? '\n\n요청사항: 초보자도 이해할 수 있도록 단계별로 자세히 설명해주세요.'
      : '\n\nRequest: Please explain step by step in detail so that beginners can understand.';
    
    return content + enhancement;
  }

  /**
   * 번역 요청 감지
   */
  private isTranslationRequest(content: string): boolean {
    const translationKeywords = [
      'translate', 'translation', '번역', '영어로', '한국어로',
      'into english', 'into korean', 'to english', 'to korean'
    ];
    
    return translationKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 번역 요청 강화
   */
  private enhanceTranslationRequest(content: string): string {
    const language = this.detectLanguage(content);
    const enhancement = language === 'ko'
      ? '\n\n번역 조건: 자연스럽고 정확한 번역을 제공해주세요. 필요시 여러 번역 옵션을 제시해주세요.'
      : '\n\nTranslation requirements: Please provide natural and accurate translation. Offer multiple translation options if necessary.';
    
    return content + enhancement;
  }

  /**
   * 창작 요청 감지
   */
  private isCreativeRequest(content: string): boolean {
    const creativeKeywords = [
      'write', 'create', 'generate', 'story', 'poem', 'song',
      '써줘', '만들어줘', '작성', '생성', '이야기', '시', '노래'
    ];
    
    return creativeKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 창작 요청 강화
   */
  private enhanceCreativeRequest(content: string): string {
    const language = this.detectLanguage(content);
    const enhancement = language === 'ko'
      ? '\n\n창작 가이드: 창의적이고 독창적인 내용을 만들어주세요. 스타일이나 톤에 대한 선호가 있다면 반영해주세요.'
      : '\n\nCreative guidelines: Please create original and creative content. Reflect any style or tone preferences if mentioned.';
    
    return content + enhancement;
  }

  /**
   * 구조화된 출력 필요성 판단
   */
  private shouldAddStructuredOutput(content: string): boolean {
    const structuredKeywords = [
      'list', 'steps', 'procedure', 'summary', 'comparison',
      '목록', '단계', '절차', '요약', '비교', '정리'
    ];
    
    return structuredKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * 구조화된 출력 요청 추가
   */
  private addStructuredOutputRequest(content: string): string {
    const language = this.detectLanguage(content);
    const structuredRequest = language === 'ko'
      ? '\n\n출력 형식: 가능하다면 명확한 구조(제목, 목록, 단계 등)로 정리하여 답변해주세요.'
      : '\n\nOutput format: Please organize your response with clear structure (headings, lists, steps, etc.) if possible.';
    
    return content + structuredRequest;
  }

  /**
   * 언어 감지
   */
  private detectLanguage(content: string): string {
    const koreanPattern = /[\u3131-\u3163\uac00-\ud7a3]/;
    const englishPattern = /[a-zA-Z]/;
    
    const hasKorean = koreanPattern.test(content);
    const hasEnglish = englishPattern.test(content);
    
    if (hasKorean && !hasEnglish) return 'ko';
    if (hasEnglish && !hasKorean) return 'en';
    return hasKorean ? 'ko' : 'en'; // 혼재시 한국어 우선
  }

  /**
   * 세션 ID 생성
   */
  private getSessionId(_request: ChatRequest): string {
    // 실제로는 더 정교한 세션 식별 로직 필요
    return 'session-' + Date.now().toString();
  }

  /**
   * 강화 기록 조회
   */
  public getEnhancementHistory(sessionId?: string): EnhancementResult[] {
    if (sessionId) {
      return this.enhancementHistory.get(sessionId) || [];
    }
    
    // 모든 세션의 기록 반환
    const allHistory: EnhancementResult[] = [];
    this.enhancementHistory.forEach(history => {
      allHistory.push(...history);
    });
    return allHistory;
  }

  /**
   * 커스텀 규칙 추가
   */
  public addCustomRule(rule: PromptRule): void {
    this.builtInRules.push(rule);
    this.builtInRules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 커스텀 템플릿 추가
   */
  public addCustomTemplate(name: string, template: string): void {
    this.options.customTemplates[name] = template;
  }

  /**
   * 강화 통계 조회
   */
  public getEnhancementStats(): {
    totalEnhancements: number;
    averageRulesApplied: number;
    averageConfidence: number;
    mostUsedRules: Array<{ rule: string; count: number }>;
  } {
    const allHistory = this.getEnhancementHistory();
    const totalEnhancements = allHistory.length;
    
    if (totalEnhancements === 0) {
      return {
        totalEnhancements: 0,
        averageRulesApplied: 0,
        averageConfidence: 0,
        mostUsedRules: []
      };
    }

    const totalRules = allHistory.reduce((sum, result) => sum + result.appliedRules.length, 0);
    const totalConfidence = allHistory.reduce((sum, result) => sum + result.confidence, 0);
    
    // 규칙 사용 빈도 계산
    const ruleUsage = new Map<string, number>();
    allHistory.forEach(result => {
      result.appliedRules.forEach(rule => {
        ruleUsage.set(rule, (ruleUsage.get(rule) || 0) + 1);
      });
    });

    const mostUsedRules = Array.from(ruleUsage.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalEnhancements,
      averageRulesApplied: totalRules / totalEnhancements,
      averageConfidence: totalConfidence / totalEnhancements,
      mostUsedRules
    };
  }

  /**
   * 설정 업데이트
   */
  public updateOptions(newOptions: Partial<PromptEnhancerAdvisorOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * 기록 초기화
   */
  public clearHistory(): void {
    this.enhancementHistory.clear();
  }
}

export default PromptEnhancerAdvisor;