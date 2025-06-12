/**
 * Spring AI Observability System Types
 * 
 * 시스템 메트릭, API 성능, 로그 수집을 위한 타입 정의
 */

/**
 * 메트릭 타입
 */
export const MetricType = {
  SYSTEM: 'system',
  API: 'api',
  MODEL: 'model',
  VECTOR_STORE: 'vector_store',
  MEMORY: 'memory',
  CUSTOM: 'custom',
} as const;

export type MetricType = typeof MetricType[keyof typeof MetricType];

/**
 * 로그 레벨
 */
export const LogLevel = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

/**
 * 시스템 메트릭 인터페이스
 */
export interface SystemMetrics {
  /** 타임스탬프 */
  timestamp: number;
  
  /** CPU 사용률 (0-100) */
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  
  /** 메모리 사용 정보 */
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap?: {
      used: number;
      total: number;
      limit: number;
    };
  };
  
  /** 네트워크 I/O */
  network: {
    bytesIn: number;
    bytesOut: number;
    requestsPerSecond: number;
    activeConnections: number;
  };
  
  /** 스레드 정보 */
  threads?: {
    active: number;
    total: number;
    blocked: number;
    waiting: number;
  };
  
  /** 가비지 컬렉션 정보 */
  gc?: {
    count: number;
    totalTime: number;
    lastGcTime: number;
  };
}

/**
 * API 메트릭 인터페이스
 */
export interface APIMetrics {
  /** API 엔드포인트 */
  endpoint: string;
  
  /** HTTP 메서드 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  
  /** 요청 시작 시간 */
  startTime: number;
  
  /** 요청 종료 시간 */
  endTime: number;
  
  /** 응답 시간 (ms) */
  duration: number;
  
  /** HTTP 상태 코드 */
  statusCode: number;
  
  /** 요청 크기 (bytes) */
  requestSize?: number;
  
  /** 응답 크기 (bytes) */
  responseSize?: number;
  
  /** 에러 정보 */
  error?: {
    message: string;
    type: string;
    stack?: string;
  };
  
  /** 추가 메타데이터 */
  metadata?: {
    userId?: string;
    sessionId?: string;
    traceId?: string;
    spanId?: string;
    [key: string]: any;
  };
}

/**
 * 로그 엔트리 인터페이스
 */
export interface LogEntry {
  /** 로그 ID */
  id: string;
  
  /** 타임스탬프 */
  timestamp: number;
  
  /** 로그 레벨 */
  level: LogLevel;
  
  /** 로거 이름 */
  logger: string;
  
  /** 로그 메시지 */
  message: string;
  
  /** 추가 컨텍스트 데이터 */
  context?: Record<string, any>;
  
  /** 에러 정보 */
  error?: {
    message: string;
    type: string;
    stack?: string;
  };
  
  /** 소스 정보 */
  source?: {
    file?: string;
    line?: number;
    function?: string;
  };
  
  /** 태그 */
  tags?: string[];
  
  /** 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 성능 데이터 인터페이스
 */
export interface PerformanceData {
  /** 메트릭 타입 */
  type: MetricType;
  
  /** 타임스탬프 */
  timestamp: number;
  
  /** 메트릭 이름 */
  name: string;
  
  /** 메트릭 값 */
  value: number;
  
  /** 단위 */
  unit?: string;
  
  /** 태그 */
  tags?: Record<string, string>;
  
  /** 통계 정보 */
  stats?: {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

/**
 * 트레이스 스팬 인터페이스
 */
export interface TraceSpan {
  /** 스팬 ID */
  spanId: string;
  
  /** 트레이스 ID */
  traceId: string;
  
  /** 부모 스팬 ID */
  parentSpanId?: string;
  
  /** 작업 이름 */
  operationName: string;
  
  /** 시작 시간 */
  startTime: number;
  
  /** 종료 시간 */
  endTime?: number;
  
  /** 지속 시간 (ms) */
  duration?: number;
  
  /** 스팬 상태 */
  status: 'running' | 'completed' | 'error' | 'cancelled';
  
  /** 태그 */
  tags: Record<string, any>;
  
  /** 로그 */
  logs: Array<{
    timestamp: number;
    fields: Record<string, any>;
  }>;
  
  /** 에러 정보 */
  error?: {
    message: string;
    type: string;
    stack?: string;
  };
}

/**
 * 알림 규칙 인터페이스
 */
export interface AlertRule {
  /** 규칙 ID */
  id: string;
  
  /** 규칙 이름 */
  name: string;
  
  /** 규칙 설명 */
  description?: string;
  
  /** 활성화 여부 */
  enabled: boolean;
  
  /** 메트릭 타입 */
  metricType: MetricType;
  
  /** 메트릭 이름 */
  metricName: string;
  
  /** 조건 */
  condition: {
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration?: number; // 조건이 유지되어야 하는 시간 (초)
  };
  
  /** 알림 채널 */
  channels: AlertChannel[];
  
  /** 생성 시간 */
  createdAt: number;
  
  /** 마지막 수정 시간 */
  updatedAt: number;
  
  /** 마지막 발생 시간 */
  lastTriggeredAt?: number;
}

/**
 * 알림 채널 타입
 */
export const AlertChannelType = {
  EMAIL: 'email',
  WEBHOOK: 'webhook',
  SLACK: 'slack',
  SMS: 'sms',
  CONSOLE: 'console',
} as const;

export type AlertChannelType = typeof AlertChannelType[keyof typeof AlertChannelType];

/**
 * 알림 채널 인터페이스
 */
export interface AlertChannel {
  /** 채널 타입 */
  type: AlertChannelType;
  
  /** 채널 설정 */
  config: Record<string, any>;
  
  /** 활성화 여부 */
  enabled: boolean;
}

/**
 * 알림 이벤트 인터페이스
 */
export interface AlertEvent {
  /** 이벤트 ID */
  id: string;
  
  /** 규칙 ID */
  ruleId: string;
  
  /** 규칙 이름 */
  ruleName: string;
  
  /** 발생 시간 */
  triggeredAt: number;
  
  /** 알림 레벨 */
  level: 'info' | 'warning' | 'error' | 'critical';
  
  /** 알림 메시지 */
  message: string;
  
  /** 현재 값 */
  currentValue: number;
  
  /** 임계값 */
  threshold: number;
  
  /** 추가 컨텍스트 */
  context?: Record<string, any>;
  
  /** 해결 시간 */
  resolvedAt?: number;
  
  /** 상태 */
  status: 'active' | 'resolved' | 'acknowledged';
}

/**
 * 메트릭 집계 인터페이스
 */
export interface MetricAggregation {
  /** 메트릭 타입 */
  type: MetricType;
  
  /** 메트릭 이름 */
  name: string;
  
  /** 집계 기간 */
  period: {
    start: number;
    end: number;
    interval: '1m' | '5m' | '15m' | '1h' | '1d';
  };
  
  /** 데이터 포인트 */
  dataPoints: Array<{
    timestamp: number;
    value: number;
    count?: number;
  }>;
  
  /** 통계 정보 */
  statistics: {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    stdDev?: number;
  };
}

/**
 * Observability 설정 인터페이스
 */
export interface ObservabilityConfig {
  /** 메트릭 수집 활성화 */
  metricsEnabled: boolean;
  
  /** 메트릭 수집 간격 (ms) */
  metricsInterval: number;
  
  /** 로그 수집 활성화 */
  loggingEnabled: boolean;
  
  /** 최소 로그 레벨 */
  minLogLevel: LogLevel;
  
  /** 트레이싱 활성화 */
  tracingEnabled: boolean;
  
  /** 샘플링 비율 (0-1) */
  samplingRate: number;
  
  /** 데이터 보관 기간 (일) */
  retentionDays: number;
  
  /** 알림 활성화 */
  alertingEnabled: boolean;
  
  /** Export 설정 */
  exporters?: {
    prometheus?: {
      enabled: boolean;
      endpoint: string;
    };
    jaeger?: {
      enabled: boolean;
      endpoint: string;
    };
    elasticsearch?: {
      enabled: boolean;
      endpoint: string;
      index: string;
    };
  };
}

/**
 * Observability 상태 인터페이스
 */
export interface ObservabilityState {
  /** 현재 설정 */
  config: ObservabilityConfig;
  
  /** 시스템 메트릭 */
  systemMetrics: SystemMetrics | null;
  
  /** API 메트릭 히스토리 */
  apiMetrics: APIMetrics[];
  
  /** 로그 엔트리 */
  logs: LogEntry[];
  
  /** 활성 트레이스 */
  activeTraces: TraceSpan[];
  
  /** 알림 규칙 */
  alertRules: AlertRule[];
  
  /** 활성 알림 */
  activeAlerts: AlertEvent[];
  
  /** 메트릭 집계 데이터 */
  aggregations: Map<string, MetricAggregation>;
  
  /** 상태 */
  status: 'active' | 'paused' | 'error';
  
  /** 에러 정보 */
  error?: Error;
}