// Spring AI Advisors 통합 인덱스

export {
  type Advisor,
  BaseAdvisor,
  AdvisorChain,
  defaultAdvisorChain,
  AdvisorUtils
} from './base';

export {
  MemoryAdvisor,
  type MemoryAdvisorOptions,
  type ConversationSession
} from './MemoryAdvisor';

export {
  SafeguardAdvisor,
  type SafeguardAdvisorOptions,
  type FilterResult
} from './SafeguardAdvisor';

export {
  PromptEnhancerAdvisor,
  type PromptEnhancerAdvisorOptions,
  type PromptRule,
  type EnhancementResult
} from './PromptEnhancerAdvisor';

import { AdvisorChain } from './base';
import { MemoryAdvisor } from './MemoryAdvisor';
import { SafeguardAdvisor } from './SafeguardAdvisor';
import { PromptEnhancerAdvisor } from './PromptEnhancerAdvisor';
import type { Advisor } from './base';
import type { MemoryAdvisorOptions } from './MemoryAdvisor';
import type { SafeguardAdvisorOptions } from './SafeguardAdvisor';
import type { PromptEnhancerAdvisorOptions } from './PromptEnhancerAdvisor';

/**
 * 사전 구성된 Advisor 체인들
 */
export const AdvisorPresets = {
  /**
   * 기본 체인 - 메모리 + 안전가드
   */
  basic: () => {
    const chain = new AdvisorChain();
    chain.addAll(
      new MemoryAdvisor(),
      new SafeguardAdvisor()
    );
    return chain;
  },

  /**
   * 강화된 체인 - 메모리 + 안전가드 + 프롬프트 강화
   */
  enhanced: () => {
    const chain = new AdvisorChain();
    chain.addAll(
      new MemoryAdvisor({
        maxMessages: 30,
        maxTokens: 4000,
        preserveImportantMessages: true
      }),
      new SafeguardAdvisor({
        enableContentFiltering: true,
        enablePrivacyMasking: true,
        enableSpamPrevention: true
      }),
      new PromptEnhancerAdvisor({
        enableAutoContext: true,
        enableClarityEnhancement: true,
        enableStructuredOutput: true
      })
    );
    return chain;
  },

  /**
   * 개발자용 체인 - 코딩에 최적화
   */
  developer: () => {
    const chain = new AdvisorChain();
    chain.addAll(
      new MemoryAdvisor({
        maxMessages: 50,
        maxTokens: 6000,
        preserveSystemMessage: true
      }),
      new SafeguardAdvisor({
        enableContentFiltering: false, // 코드에서는 완화
        enablePrivacyMasking: true,
        maxMessageLength: 8000
      }),
      new PromptEnhancerAdvisor({
        enableAutoContext: true,
        enableExampleInjection: true,
        enableStructuredOutput: true,
        domainRules: {
          coding: [
            {
              name: 'add_best_practices',
              condition: (content: string) => /code|programming|function/i.test(content),
              enhancement: (content: string) => content + '\n\n요구사항: 베스트 프랙티스와 에러 처리를 포함해주세요.',
              priority: 5
            }
          ]
        }
      })
    );
    return chain;
  },

  /**
   * 안전 중심 체인 - 보안에 중점
   */
  secure: () => {
    const chain = new AdvisorChain();
    chain.addAll(
      new MemoryAdvisor({
        maxMessages: 15,
        maxTokens: 2000,
        persistToStorage: false // 보안을 위해 저장 안함
      }),
      new SafeguardAdvisor({
        enableContentFiltering: true,
        enablePrivacyMasking: true,
        enableSpamPrevention: true,
        rateLimit: 30, // 더 엄격한 제한
        blockedKeywords: [
          'password', 'secret', 'token', 'api_key', 'private_key',
          'credit_card', 'ssn', '주민번호', '비밀번호', '개인정보'
        ]
      }),
      new PromptEnhancerAdvisor({
        enableAutoContext: false, // 컨텍스트 유출 방지
        enableClarityEnhancement: true
      })
    );
    return chain;
  },

  /**
   * 창작용 체인 - 창의성에 중점
   */
  creative: () => {
    const chain = new AdvisorChain();
    chain.addAll(
      new MemoryAdvisor({
        maxMessages: 40,
        maxTokens: 5000,
        preserveImportantMessages: true
      }),
      new SafeguardAdvisor({
        enableContentFiltering: true,
        enablePrivacyMasking: true,
        maxMessageLength: 6000 // 긴 창작물 허용
      }),
      new PromptEnhancerAdvisor({
        enableAutoContext: true,
        enableCreativityAdjustment: true,
        enableStructuredOutput: false, // 창작에서는 자유로운 형식
        domainRules: {
          creative: [
            {
              name: 'enhance_creativity',
              condition: (content: string) => /write|create|story|poem/i.test(content),
              enhancement: (content: string) => content + '\n\n창작 지침: 독창적이고 감정이 풍부한 내용으로 작성해주세요.',
              priority: 5
            }
          ]
        }
      })
    );
    return chain;
  }
};

/**
 * Advisor 팩토리 함수들
 */
export const AdvisorFactory = {
  /**
   * 메모리 Advisor 생성
   */
  createMemoryAdvisor: (options?: MemoryAdvisorOptions) => new MemoryAdvisor(options),

  /**
   * 안전가드 Advisor 생성
   */
  createSafeguardAdvisor: (options?: SafeguardAdvisorOptions) => new SafeguardAdvisor(options),

  /**
   * 프롬프트 강화 Advisor 생성
   */
  createPromptEnhancerAdvisor: (options?: PromptEnhancerAdvisorOptions) => new PromptEnhancerAdvisor(options),

  /**
   * 커스텀 체인 생성
   */
  createCustomChain: (...advisors: Advisor[]) => {
    const chain = new AdvisorChain();
    chain.addAll(...advisors);
    return chain;
  }
};

/**
 * Advisor 관리 유틸리티
 */
export const AdvisorManager = {
  /**
   * 체인 성능 분석
   */
  analyzeChainPerformance: async (chain: AdvisorChain, testRequests: import('../types').ChatRequest[]) => {
    const results = [];
    
    for (const request of testRequests) {
      const startTime = Date.now();
      
      try {
        await chain.executeRequestAdvisors(request);
        const endTime = Date.now();
        
        results.push({
          success: true,
          duration: endTime - startTime,
          request: request.messages[request.messages.length - 1]?.content.substring(0, 50) + '...'
        });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          request: request.messages[request.messages.length - 1]?.content.substring(0, 50) + '...'
        });
      }
    }
    
    return {
      totalTests: results.length,
      successRate: results.filter(r => r.success).length / results.length,
      averageDuration: results
        .filter(r => r.success && r.duration)
        .reduce((sum, r) => sum + (r.duration || 0), 0) / results.filter(r => r.success).length,
      results
    };
  },

  /**
   * 체인 정보 요약
   */
  summarizeChain: (chain: AdvisorChain) => {
    const info = chain.getChainInfo();
    const advisors = info.advisors.map(advisor => ({
      name: advisor.name,
      enabled: advisor.enabled,
      priority: advisor.priority,
      description: advisor.description
    }));

    return {
      summary: `${info.active}/${info.total} advisors active`,
      advisors,
      executionOrder: advisors
        .filter(a => a.enabled)
        .sort((a, b) => a.priority - b.priority)
        .map(a => a.name)
    };
  },

  /**
   * 체인 복사
   */
  cloneChain: (sourceChain: AdvisorChain) => {
    const newChain = new AdvisorChain();
    const sourceInfo = sourceChain.getChainInfo();
    
    // 기본적인 복사 (실제로는 각 Advisor의 설정도 복사해야 함)
    sourceInfo.advisors.forEach(_advisorInfo => {
      // 여기서는 팩토리 함수를 사용하여 새 인스턴스 생성
      // 실제 구현에서는 각 Advisor의 설정을 정확히 복사해야 함
      console.warn('Chain cloning is not fully implemented');
    });
    
    return newChain;
  }
};

export default {
  AdvisorPresets,
  AdvisorFactory,
  AdvisorManager
};