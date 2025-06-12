/**
 * Spring AI Tools/Function Calling 시스템
 * 
 * 종합적인 Function Calling 시스템으로 다양한 도구들을 관리하고 실행합니다.
 */

// 핵심 타입들
export type {
  FunctionParameter,
  FunctionDefinition,
  FunctionExample,
  FunctionCallRequest,
  FunctionCallResult,
  FunctionError,
  FunctionTool,
  ToolExecutionContext,
  ToolExecutionHistory,
  ValidationResult,
  ValidationError,
  ToolRegistry as IToolRegistry,
  SecurityPolicy,
  RateLimit,
  ToolCategory
} from './types';

// 기본 클래스들
export { BaseFunctionTool } from './BaseFunctionTool';
export { ToolRegistry, globalToolRegistry } from './ToolRegistry';

// 내장 도구들
export {
  CalculatorTool,
  WeatherTool,
  SearchTool,
  UrlTool,
  TimeTool,
  BuiltinToolsFactory,
  BUILTIN_TOOLS_METADATA,
  TOOL_CATEGORIES,
  createCalculator,
  createWeather,
  createSearch,
  createUrlUtils,
  createTimeUtils
} from './builtin-tools';

// 전역 도구 관리자
import { globalToolRegistry } from './ToolRegistry';
import { BuiltinToolsFactory } from './builtin-tools';

/**
 * 도구 시스템 초기화
 */
export class ToolSystem {
  private static initialized = false;

  /**
   * 기본 도구들을 전역 레지스트리에 등록
   */
  static initialize(config?: {
    weatherApiKey?: string;
    enableDangerousTools?: boolean;
    customTools?: any[];
  }) {
    if (this.initialized) {
      console.warn('Tool system is already initialized');
      return;
    }

    // 기본 도구들 등록
    const builtinTools = BuiltinToolsFactory.createAllTools({
      weatherApiKey: config?.weatherApiKey,
      enableDangerousTools: config?.enableDangerousTools
    });

    builtinTools.forEach(tool => {
      globalToolRegistry.register(tool);
    });

    // 사용자 정의 도구들 등록
    if (config?.customTools) {
      config.customTools.forEach(tool => {
        globalToolRegistry.register(tool);
      });
    }

    // 기본 보안 정책 설정
    globalToolRegistry.setSecurityPolicy({
      requireAuth: false,
      maxExecutionTime: 30000, // 30초
      rateLimits: {
        'calculator': { maxCalls: 100, windowMs: 60000 },
        'weather': { maxCalls: 10, windowMs: 60000 },
        'web_search': { maxCalls: 5, windowMs: 60000 },
        'url_utils': { maxCalls: 50, windowMs: 60000 },
        'time_utils': { maxCalls: 100, windowMs: 60000 }
      }
    });

    this.initialized = true;
    console.log(`Tool system initialized with ${builtinTools.length} builtin tools`);
  }

  /**
   * 도구 실행 (편의 함수)
   */
  static async executeTool(
    functionName: string,
    parameters: Record<string, any>,
    context?: any
  ) {
    if (!this.initialized) {
      this.initialize();
    }

    return await globalToolRegistry.execute({
      functionName,
      parameters,
      callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      context
    }, context);
  }

  /**
   * 사용 가능한 도구 목록 조회
   */
  static getAvailableTools() {
    if (!this.initialized) {
      this.initialize();
    }

    return globalToolRegistry.list().map(tool => ({
      name: tool.definition.name,
      description: tool.definition.description,
      category: tool.definition.category,
      parameters: tool.definition.parameters,
      examples: tool.definition.examples
    }));
  }

  /**
   * 도구 검색
   */
  static searchTools(query: string) {
    if (!this.initialized) {
      this.initialize();
    }

    return globalToolRegistry.search(query);
  }

  /**
   * 실행 통계 조회
   */
  static getExecutionStats() {
    if (!this.initialized) {
      this.initialize();
    }

    return globalToolRegistry.getExecutionStats();
  }

  /**
   * 실행 이력 조회
   */
  static getExecutionHistory(limit?: number) {
    if (!this.initialized) {
      this.initialize();
    }

    return globalToolRegistry.getExecutionHistory(limit);
  }

  /**
   * 시스템 재설정
   */
  static reset() {
    globalToolRegistry.clear();
    this.initialized = false;
  }
}

/**
 * 편의 함수들
 */

// 즉시 사용 가능한 함수들
export const calculate = async (expression: string) => {
  return await ToolSystem.executeTool('calculator', { expression });
};

export const getWeather = async (location: string, units = 'metric') => {
  return await ToolSystem.executeTool('weather', { location, units });
};

export const searchWeb = async (query: string, numResults = 5) => {
  return await ToolSystem.executeTool('web_search', { query, num_results: numResults });
};

export const parseUrl = async (url: string) => {
  return await ToolSystem.executeTool('url_utils', { action: 'parse', url });
};

export const getCurrentTime = async (timezone = 'Asia/Seoul') => {
  return await ToolSystem.executeTool('time_utils', { action: 'current', timezone });
};

/**
 * React Hook용 인터페이스
 */
export interface UseToolsReturn {
  tools: any[];
  executeTool: typeof ToolSystem.executeTool;
  searchTools: typeof ToolSystem.searchTools;
  stats: any;
  history: any[];
  isLoading: boolean;
  error: string | null;
}

// React에서 사용할 수 있는 도구 시스템 훅 인터페이스
// 실제 구현은 컴포넌트에서 할 예정