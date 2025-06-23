/**
 * Observability 시스템 상수 정의
 */

import type { ObservabilityConfig, LogLevel, MetricType } from './types';
import { LogLevel as LogLevelConst, MetricType as MetricTypeConst } from './types';

/**
 * 기본 Observability 설정
 */
export const DEFAULT_OBSERVABILITY_CONFIG: ObservabilityConfig = {
  metricsEnabled: true,
  metricsInterval: 5000, // 5초
  loggingEnabled: true,
  minLogLevel: LogLevelConst.INFO,
  tracingEnabled: true,
  samplingRate: 0.1, // 10% 샘플링
  retentionDays: 7,
  alertingEnabled: true,
};

/**
 * 메트릭 수집 간격 프리셋
 */
export const METRIC_INTERVALS = {
  REALTIME: 1000,    // 1초
  FAST: 5000,        // 5초
  NORMAL: 15000,     // 15초
  SLOW: 60000,       // 1분
  VERY_SLOW: 300000, // 5분
} as const;

/**
 * 메트릭 보관 기간 프리셋
 */
export const RETENTION_PRESETS = {
  SHORT: 1,     // 1일
  MEDIUM: 7,    // 1주일
  LONG: 30,     // 1개월
  VERY_LONG: 90 // 3개월
} as const;

/**
 * 차트 색상 팔레트
 */
export const CHART_COLORS = {
  primary: '#0070f3',
  success: '#00c853',
  warning: '#ff9800',
  danger: '#f44336',
  info: '#2196f3',
  purple: '#9c27b0',
  pink: '#e91e63',
  teal: '#009688',
} as const;

/**
 * 로그 레벨별 색상
 */
export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevelConst.TRACE]: '#9e9e9e',
  [LogLevelConst.DEBUG]: '#757575',
  [LogLevelConst.INFO]: '#2196f3',
  [LogLevelConst.WARN]: '#ff9800',
  [LogLevelConst.ERROR]: '#f44336',
  [LogLevelConst.FATAL]: '#d32f2f',
};

/**
 * 메트릭 타입별 아이콘
 */
export const METRIC_TYPE_ICONS: Record<MetricType, string> = {
  [MetricTypeConst.SYSTEM]: '💻',
  [MetricTypeConst.API]: '🌐',
  [MetricTypeConst.MODEL]: '🤖',
  [MetricTypeConst.VECTOR_STORE]: '📊',
  [MetricTypeConst.MEMORY]: '🧠',
  [MetricTypeConst.CUSTOM]: '⚙️',
};

/**
 * API 응답 상태 코드 분류
 */
export const STATUS_CODE_RANGES = {
  SUCCESS: { min: 200, max: 299, label: '성공', color: 'success' },
  REDIRECT: { min: 300, max: 399, label: '리다이렉트', color: 'info' },
  CLIENT_ERROR: { min: 400, max: 499, label: '클라이언트 오류', color: 'warning' },
  SERVER_ERROR: { min: 500, max: 599, label: '서버 오류', color: 'danger' },
} as const;

/**
 * 성능 임계값
 */
export const PERFORMANCE_THRESHOLDS = {
  API_RESPONSE_TIME: {
    FAST: 100,      // 100ms 이하
    NORMAL: 500,    // 500ms 이하
    SLOW: 1000,     // 1초 이하
    VERY_SLOW: 3000 // 3초 이하
  },
  CPU_USAGE: {
    LOW: 20,        // 20% 이하
    NORMAL: 50,     // 50% 이하
    HIGH: 80,       // 80% 이하
    CRITICAL: 90    // 90% 이상
  },
  MEMORY_USAGE: {
    LOW: 30,        // 30% 이하
    NORMAL: 60,     // 60% 이하
    HIGH: 80,       // 80% 이하
    CRITICAL: 90    // 90% 이상
  },
} as const;

/**
 * 차트 기본 설정
 */
export const CHART_CONFIG = {
  height: 300,
  margin: { top: 5, right: 30, left: 20, bottom: 5 },
  animationDuration: 300,
  strokeWidth: 2,
  dotRadius: 4,
  gridStrokeDasharray: '3 3',
} as const;

/**
 * 로그 검색 필터 프리셋
 */
export const LOG_FILTER_PRESETS = {
  ERRORS_ONLY: {
    levels: [LogLevelConst.ERROR, LogLevelConst.FATAL],
    name: '오류만',
  },
  WARNINGS_AND_ERRORS: {
    levels: [LogLevelConst.WARN, LogLevelConst.ERROR, LogLevelConst.FATAL],
    name: '경고 및 오류',
  },
  INFO_AND_ABOVE: {
    levels: [LogLevelConst.INFO, LogLevelConst.WARN, LogLevelConst.ERROR, LogLevelConst.FATAL],
    name: '정보 이상',
  },
  ALL: {
    levels: Object.values(LogLevelConst) as LogLevel[],
    name: '전체',
  },
} as const;

/**
 * 시간 범위 프리셋
 */
export const TIME_RANGE_PRESETS = {
  LAST_5_MINUTES: { value: 5 * 60 * 1000, label: '최근 5분' },
  LAST_15_MINUTES: { value: 15 * 60 * 1000, label: '최근 15분' },
  LAST_30_MINUTES: { value: 30 * 60 * 1000, label: '최근 30분' },
  LAST_1_HOUR: { value: 60 * 60 * 1000, label: '최근 1시간' },
  LAST_3_HOURS: { value: 3 * 60 * 60 * 1000, label: '최근 3시간' },
  LAST_6_HOURS: { value: 6 * 60 * 60 * 1000, label: '최근 6시간' },
  LAST_12_HOURS: { value: 12 * 60 * 60 * 1000, label: '최근 12시간' },
  LAST_24_HOURS: { value: 24 * 60 * 60 * 1000, label: '최근 24시간' },
  LAST_7_DAYS: { value: 7 * 24 * 60 * 60 * 1000, label: '최근 7일' },
} as const;

/**
 * 메트릭 단위
 */
export const METRIC_UNITS = {
  PERCENTAGE: '%',
  BYTES: 'B',
  KILOBYTES: 'KB',
  MEGABYTES: 'MB',
  GIGABYTES: 'GB',
  MILLISECONDS: 'ms',
  SECONDS: 's',
  REQUESTS: 'req',
  REQUESTS_PER_SECOND: 'req/s',
  COUNT: '',
} as const;

/**
 * 최대 저장 제한
 */
export const STORAGE_LIMITS = {
  MAX_API_METRICS: 1000,
  MAX_LOGS: 5000,
  MAX_TRACES: 100,
  MAX_ALERTS: 50,
  MAX_AGGREGATIONS: 100,
} as const;