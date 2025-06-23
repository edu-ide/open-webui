/**
 * 내장 도구들 
 * Spring AI Tool/Function Calling 시스템의 기본 도구들
 */

// 도구 클래스들
export { CalculatorTool } from './CalculatorTool';
export { WeatherTool } from './WeatherTool';
export { SearchTool } from './SearchTool';
export { UrlTool } from './UrlTool';
export { TimeTool } from './TimeTool';

// 도구 인스턴스 팩토리
import { CalculatorTool } from './CalculatorTool';
import { WeatherTool } from './WeatherTool';
import { SearchTool } from './SearchTool';
import { UrlTool } from './UrlTool';
import { TimeTool } from './TimeTool';
import type { FunctionTool } from '../types';

/**
 * 기본 도구들을 생성하는 팩토리 클래스
 */
export class BuiltinToolsFactory {
  /**
   * 모든 기본 도구 인스턴스 생성
   */
  static createAllTools(config?: {
    weatherApiKey?: string;
    enableDangerousTools?: boolean;
  }): FunctionTool[] {
    const tools: FunctionTool[] = [
      new CalculatorTool(),
      new WeatherTool(config?.weatherApiKey),
      new SearchTool(),
      new UrlTool(),
      new TimeTool()
    ];

    return tools;
  }

  /**
   * 카테고리별 도구 생성
   */
  static createByCategory(category: string, config?: any): FunctionTool[] {
    switch (category) {
      case 'math':
        return [new CalculatorTool()];
      
      case 'api':
        return [new WeatherTool(config?.weatherApiKey)];
      
      case 'search':
        return [new SearchTool()];
      
      case 'utility':
        return [new UrlTool()];
      
      case 'time':
        return [new TimeTool()];
      
      default:
        return [];
    }
  }

  /**
   * 특정 도구 생성
   */
  static createTool(name: string, config?: any): FunctionTool | null {
    switch (name) {
      case 'calculator':
        return new CalculatorTool();
      
      case 'weather':
        return new WeatherTool(config?.weatherApiKey);
      
      case 'web_search':
        return new SearchTool();
      
      case 'url_utils':
        return new UrlTool();
      
      case 'time_utils':
        return new TimeTool();
      
      default:
        return null;
    }
  }

  /**
   * 안전한 도구들만 생성 (프로덕션 환경용)
   */
  static createSafeTools(config?: {
    weatherApiKey?: string;
  }): FunctionTool[] {
    return [
      new CalculatorTool(),
      new WeatherTool(config?.weatherApiKey),
      new UrlTool(),
      new TimeTool()
      // SearchTool은 외부 API 호출로 인해 제외 가능
    ];
  }
}

/**
 * 도구 메타데이터
 */
export const BUILTIN_TOOLS_METADATA = {
  calculator: {
    name: 'calculator',
    displayName: '계산기',
    description: '기본적인 수학 계산을 수행합니다',
    category: 'math',
    safe: true,
    requiresAuth: false,
    requiresApi: false
  },
  weather: {
    name: 'weather',
    displayName: '날씨',
    description: '현재 날씨 정보를 조회합니다',
    category: 'api',
    safe: true,
    requiresAuth: false,
    requiresApi: true,
    apiProvider: 'OpenWeatherMap'
  },
  web_search: {
    name: 'web_search',
    displayName: '웹 검색',
    description: '웹에서 정보를 검색합니다',
    category: 'search',
    safe: true,
    requiresAuth: false,
    requiresApi: true,
    apiProvider: 'DuckDuckGo'
  },
  url_utils: {
    name: 'url_utils',
    displayName: 'URL 도구',
    description: 'URL 관련 유틸리티 기능을 제공합니다',
    category: 'utility',
    safe: true,
    requiresAuth: false,
    requiresApi: false
  },
  time_utils: {
    name: 'time_utils',
    displayName: '시간 도구',
    description: '시간 관련 유틸리티 기능을 제공합니다',
    category: 'time',
    safe: true,
    requiresAuth: false,
    requiresApi: false
  }
} as const;

/**
 * 도구 카테고리 정의
 */
export const TOOL_CATEGORIES = {
  math: '수학',
  api: 'API',
  search: '검색',
  utility: '유틸리티',
  time: '시간',
  web: '웹',
  data: '데이터',
  file: '파일',
  conversion: '변환',
  custom: '사용자 정의'
} as const;

/**
 * 편의 함수들
 */
export const createCalculator = () => new CalculatorTool();
export const createWeather = (apiKey?: string) => new WeatherTool(apiKey);
export const createSearch = () => new SearchTool();
export const createUrlUtils = () => new UrlTool();
export const createTimeUtils = () => new TimeTool();