/**
 * Observability 유틸리티 함수
 */

import type { 
  APIMetrics, 
  LogEntry, 
  SystemMetrics, 
  PerformanceData,
  MetricAggregation,
  TraceSpan,
  LogLevel,
  MetricType 
} from './types';
import { LogLevel as LogLevelConst } from './types';
import { 
  STATUS_CODE_RANGES, 
  PERFORMANCE_THRESHOLDS, 
  METRIC_UNITS,
  LOG_LEVEL_COLORS 
} from './constants';

/**
 * 로그 레벨 우선순위
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevelConst.TRACE]: 0,
  [LogLevelConst.DEBUG]: 1,
  [LogLevelConst.INFO]: 2,
  [LogLevelConst.WARN]: 3,
  [LogLevelConst.ERROR]: 4,
  [LogLevelConst.FATAL]: 5,
};

/**
 * 로그 레벨 비교
 */
export function isLogLevelEnabled(
  currentLevel: LogLevel, 
  minLevel: LogLevel
): boolean {
  return LOG_LEVEL_PRIORITY[currentLevel] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * 바이트를 읽기 쉬운 단위로 변환
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 시간을 읽기 쉬운 형식으로 변환
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * 퍼센트 계산
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * HTTP 상태 코드 분류
 */
export function getStatusCodeCategory(statusCode: number) {
  for (const [key, range] of Object.entries(STATUS_CODE_RANGES)) {
    if (statusCode >= range.min && statusCode <= range.max) {
      return { key, ...range };
    }
  }
  return { key: 'UNKNOWN', label: '알 수 없음', color: 'default' };
}

/**
 * API 응답 시간 카테고리
 */
export function getResponseTimeCategory(duration: number) {
  const thresholds = PERFORMANCE_THRESHOLDS.API_RESPONSE_TIME;
  if (duration <= thresholds.FAST) return { label: '빠름', color: 'success' };
  if (duration <= thresholds.NORMAL) return { label: '보통', color: 'primary' };
  if (duration <= thresholds.SLOW) return { label: '느림', color: 'warning' };
  return { label: '매우 느림', color: 'danger' };
}

/**
 * CPU 사용률 카테고리
 */
export function getCPUUsageCategory(usage: number) {
  const thresholds = PERFORMANCE_THRESHOLDS.CPU_USAGE;
  if (usage <= thresholds.LOW) return { label: '낮음', color: 'success' };
  if (usage <= thresholds.NORMAL) return { label: '보통', color: 'primary' };
  if (usage <= thresholds.HIGH) return { label: '높음', color: 'warning' };
  return { label: '위험', color: 'danger' };
}

/**
 * 메모리 사용률 카테고리
 */
export function getMemoryUsageCategory(usage: number) {
  const thresholds = PERFORMANCE_THRESHOLDS.MEMORY_USAGE;
  if (usage <= thresholds.LOW) return { label: '낮음', color: 'success' };
  if (usage <= thresholds.NORMAL) return { label: '보통', color: 'primary' };
  if (usage <= thresholds.HIGH) return { label: '높음', color: 'warning' };
  return { label: '위험', color: 'danger' };
}

/**
 * 타임스탬프를 날짜 문자열로 변환
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 상대적인 시간 표시
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return '방금 전';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}일 전`;
  return formatTimestamp(timestamp);
}

/**
 * 로그 엔트리 생성 헬퍼
 */
export function createLogEntry(
  level: LogLevel,
  logger: string,
  message: string,
  context?: Record<string, any>
): LogEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    level,
    logger,
    message,
    context,
  };
}

/**
 * API 메트릭 생성 헬퍼
 */
export function createAPIMetric(
  endpoint: string,
  method: APIMetrics['method'],
  startTime: number,
  endTime: number,
  statusCode: number,
  metadata?: APIMetrics['metadata']
): APIMetrics {
  return {
    endpoint,
    method,
    startTime,
    endTime,
    duration: endTime - startTime,
    statusCode,
    metadata,
  };
}

/**
 * 메트릭 집계 함수
 */
export function aggregateMetrics(
  metrics: PerformanceData[],
  interval: MetricAggregation['period']['interval']
): MetricAggregation[] {
  const groupedMetrics = new Map<string, PerformanceData[]>();

  // 메트릭을 타입과 이름으로 그룹화
  metrics.forEach(metric => {
    const key = `${metric.type}:${metric.name}`;
    if (!groupedMetrics.has(key)) {
      groupedMetrics.set(key, []);
    }
    groupedMetrics.get(key)!.push(metric);
  });

  const aggregations: MetricAggregation[] = [];

  // 각 그룹에 대해 집계 수행
  groupedMetrics.forEach((groupMetrics, key) => {
    const [type, name] = key.split(':') as [MetricType, string];
    
    if (groupMetrics.length === 0) return;

    // 시간 범위 계산
    const timestamps = groupMetrics.map(m => m.timestamp).sort();
    const start = timestamps[0];
    const end = timestamps[timestamps.length - 1];

    // 데이터 포인트 생성
    const dataPoints = groupMetrics.map(m => ({
      timestamp: m.timestamp,
      value: m.value,
      count: 1,
    }));

    // 통계 계산
    const values = groupMetrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // 표준편차 계산
    const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    aggregations.push({
      type,
      name,
      period: { start, end, interval },
      dataPoints,
      statistics: {
        count: values.length,
        sum,
        avg,
        min,
        max,
        stdDev,
      },
    });
  });

  return aggregations;
}

/**
 * 트레이스 지속 시간 계산
 */
export function calculateTraceDuration(trace: TraceSpan): number {
  if (trace.duration !== undefined) return trace.duration;
  if (trace.endTime) return trace.endTime - trace.startTime;
  return Date.now() - trace.startTime;
}

/**
 * 로그 필터링 함수
 */
export function filterLogs(
  logs: LogEntry[],
  filters: {
    levels?: LogLevel[];
    loggers?: string[];
    search?: string;
    startTime?: number;
    endTime?: number;
    tags?: string[];
  }
): LogEntry[] {
  return logs.filter(log => {
    // 레벨 필터
    if (filters.levels && !filters.levels.includes(log.level)) {
      return false;
    }

    // 로거 필터
    if (filters.loggers && !filters.loggers.includes(log.logger)) {
      return false;
    }

    // 검색어 필터
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesMessage = log.message.toLowerCase().includes(searchLower);
      const matchesLogger = log.logger.toLowerCase().includes(searchLower);
      const matchesContext = log.context && 
        JSON.stringify(log.context).toLowerCase().includes(searchLower);
      
      if (!matchesMessage && !matchesLogger && !matchesContext) {
        return false;
      }
    }

    // 시간 범위 필터
    if (filters.startTime && log.timestamp < filters.startTime) {
      return false;
    }
    if (filters.endTime && log.timestamp > filters.endTime) {
      return false;
    }

    // 태그 필터
    if (filters.tags && filters.tags.length > 0) {
      if (!log.tags || !filters.tags.some(tag => log.tags?.includes(tag))) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 시스템 메트릭 모의 데이터 생성 (개발용)
 */
export function generateMockSystemMetrics(): SystemMetrics {
  return {
    timestamp: Date.now(),
    cpu: {
      usage: Math.random() * 100,
      cores: navigator.hardwareConcurrency || 4,
      loadAverage: [
        Math.random() * 4,
        Math.random() * 4,
        Math.random() * 4,
      ],
    },
    memory: {
      used: Math.random() * 8 * 1024 * 1024 * 1024, // 0-8GB
      total: 16 * 1024 * 1024 * 1024, // 16GB
      percentage: Math.random() * 100,
      heap: {
        used: Math.random() * 512 * 1024 * 1024, // 0-512MB
        total: 1024 * 1024 * 1024, // 1GB
        limit: 2 * 1024 * 1024 * 1024, // 2GB
      },
    },
    network: {
      bytesIn: Math.random() * 1024 * 1024, // 0-1MB
      bytesOut: Math.random() * 1024 * 1024, // 0-1MB
      requestsPerSecond: Math.random() * 100,
      activeConnections: Math.floor(Math.random() * 50),
    },
    threads: {
      active: Math.floor(Math.random() * 20) + 10,
      total: 50,
      blocked: Math.floor(Math.random() * 5),
      waiting: Math.floor(Math.random() * 10),
    },
    gc: {
      count: Math.floor(Math.random() * 100),
      totalTime: Math.random() * 10000,
      lastGcTime: Date.now() - Math.random() * 60000,
    },
  };
}

/**
 * 로그 레벨 색상 가져오기
 */
export function getLogLevelColor(level: LogLevel): string {
  return LOG_LEVEL_COLORS[level] || '#9e9e9e';
}

/**
 * 메트릭 값 포맷팅
 */
export function formatMetricValue(value: number, unit?: string): string {
  if (unit === METRIC_UNITS.PERCENTAGE) {
    return `${value.toFixed(1)}${unit}`;
  }
  if (unit === METRIC_UNITS.BYTES) {
    return formatBytes(value);
  }
  if (unit === METRIC_UNITS.MILLISECONDS) {
    return formatDuration(value);
  }
  if (unit === METRIC_UNITS.REQUESTS_PER_SECOND) {
    return `${value.toFixed(1)} ${unit}`;
  }
  return value.toFixed(2) + (unit ? ` ${unit}` : '');
}