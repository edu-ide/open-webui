/**
 * MetricsCollector - 시스템 및 API 메트릭 수집 서비스
 * 
 * Performance API를 사용하여 브라우저 성능 메트릭을 수집하고
 * 주기적으로 시스템 메트릭을 업데이트합니다.
 */

import type {
  SystemMetrics,
  APIMetrics,
  PerformanceData,
  MetricAggregation,
  ObservabilityConfig,
  MetricType,
} from './types';
import { MetricType as MetricTypeConst } from './types';
import { 
  STORAGE_LIMITS, 
  METRIC_UNITS 
} from './constants';
import { 
  aggregateMetrics,
  generateMockSystemMetrics 
} from './utils';

/**
 * 메트릭 수집기 이벤트
 */
interface MetricsCollectorEvents {
  'metrics-updated': { type: MetricType; data: any };
  'system-metrics-updated': { metrics: SystemMetrics };
  'api-metrics-updated': { metrics: APIMetrics };
  'aggregation-updated': { aggregations: MetricAggregation[] };
  'error': { error: Error };
}

/**
 * 메트릭 수집기 옵션
 */
export interface MetricsCollectorOptions {
  config: ObservabilityConfig;
  onMetricsUpdate?: (type: MetricType, data: any) => void;
  onError?: (error: Error) => void;
}

/**
 * 메트릭 수집기 클래스
 */
export class MetricsCollector {
  private config: ObservabilityConfig;
  private options: MetricsCollectorOptions;
  private intervalId?: NodeJS.Timeout;
  private observers: Map<string, PerformanceObserver> = new Map();
  private metrics: Map<string, PerformanceData[]> = new Map();
  private apiMetrics: APIMetrics[] = [];
  private systemMetrics: SystemMetrics | null = null;
  private listeners: Map<keyof MetricsCollectorEvents, Set<Function>> = new Map();
  private isRunning = false;

  constructor(options: MetricsCollectorOptions) {
    this.options = options;
    this.config = options.config;
    this.setupPerformanceObservers();
  }

  /**
   * 이벤트 리스너 등록
   */
  on<K extends keyof MetricsCollectorEvents>(
    event: K,
    listener: (data: MetricsCollectorEvents[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 이벤트 리스너 제거
   */
  off<K extends keyof MetricsCollectorEvents>(
    event: K,
    listener: (data: MetricsCollectorEvents[K]) => void
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * 이벤트 발생
   */
  private emit<K extends keyof MetricsCollectorEvents>(
    event: K,
    data: MetricsCollectorEvents[K]
  ): void {
    this.listeners.get(event)?.forEach(listener => listener(data));
  }

  /**
   * Performance Observer 설정
   */
  private setupPerformanceObservers(): void {
    if (!this.config.metricsEnabled || typeof window === 'undefined') return;

    try {
      // Navigation Timing Observer
      if ('PerformanceObserver' in window) {
        const navigationObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.handleNavigationEntry(entry as PerformanceNavigationTiming);
          }
        });
        navigationObserver.observe({ entryTypes: ['navigation'] });
        this.observers.set('navigation', navigationObserver);

        // Resource Timing Observer
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.handleResourceEntry(entry as PerformanceResourceTiming);
          }
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.set('resource', resourceObserver);

        // Paint Timing Observer
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.handlePaintEntry(entry);
          }
        });
        paintObserver.observe({ entryTypes: ['paint'] });
        this.observers.set('paint', paintObserver);

        // Layout Shift Observer
        if ('LayoutShift' in window) {
          const layoutShiftObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              this.handleLayoutShiftEntry(entry as any);
            }
          });
          layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
          this.observers.set('layout-shift', layoutShiftObserver);
        }

        // Largest Contentful Paint Observer
        if ('LargestContentfulPaint' in window) {
          const lcpObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              this.handleLCPEntry(entry as any);
            }
          });
          lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
          this.observers.set('largest-contentful-paint', lcpObserver);
        }
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Navigation 엔트리 처리
   */
  private handleNavigationEntry(entry: PerformanceNavigationTiming): void {
    const metrics: PerformanceData[] = [
      {
        type: MetricTypeConst.SYSTEM,
        timestamp: Date.now(),
        name: 'page_load_time',
        value: entry.loadEventEnd - entry.fetchStart,
        unit: METRIC_UNITS.MILLISECONDS,
      },
      {
        type: MetricTypeConst.SYSTEM,
        timestamp: Date.now(),
        name: 'dom_content_loaded',
        value: entry.domContentLoadedEventEnd - entry.fetchStart,
        unit: METRIC_UNITS.MILLISECONDS,
      },
      {
        type: MetricTypeConst.SYSTEM,
        timestamp: Date.now(),
        name: 'first_byte_time',
        value: entry.responseStart - entry.fetchStart,
        unit: METRIC_UNITS.MILLISECONDS,
      },
    ];

    metrics.forEach(metric => this.addMetric(metric));
  }

  /**
   * Resource 엔트리 처리
   */
  private handleResourceEntry(entry: PerformanceResourceTiming): void {
    // API 호출인 경우
    if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
      const url = new URL(entry.name);
      const apiMetric: APIMetrics = {
        endpoint: url.pathname,
        method: 'GET', // Performance API에서는 메서드를 알 수 없음
        startTime: entry.startTime,
        endTime: entry.responseEnd,
        duration: entry.duration,
        statusCode: 200, // Performance API에서는 상태 코드를 알 수 없음
        requestSize: entry.transferSize,
        responseSize: entry.encodedBodySize,
      };

      this.addAPIMetric(apiMetric);
    }

    // 리소스 로딩 메트릭
    const metric: PerformanceData = {
      type: MetricTypeConst.SYSTEM,
      timestamp: Date.now(),
      name: `resource_${entry.initiatorType}`,
      value: entry.duration,
      unit: METRIC_UNITS.MILLISECONDS,
      tags: {
        resource: entry.name,
        type: entry.initiatorType,
      },
    };

    this.addMetric(metric);
  }

  /**
   * Paint 엔트리 처리
   */
  private handlePaintEntry(entry: PerformanceEntry): void {
    const metric: PerformanceData = {
      type: MetricTypeConst.SYSTEM,
      timestamp: Date.now(),
      name: entry.name.replace('-', '_'),
      value: entry.startTime,
      unit: METRIC_UNITS.MILLISECONDS,
    };

    this.addMetric(metric);
  }

  /**
   * Layout Shift 엔트리 처리
   */
  private handleLayoutShiftEntry(entry: any): void {
    const metric: PerformanceData = {
      type: MetricTypeConst.SYSTEM,
      timestamp: Date.now(),
      name: 'cumulative_layout_shift',
      value: entry.value,
      unit: METRIC_UNITS.COUNT,
    };

    this.addMetric(metric);
  }

  /**
   * Largest Contentful Paint 엔트리 처리
   */
  private handleLCPEntry(entry: any): void {
    const metric: PerformanceData = {
      type: MetricTypeConst.SYSTEM,
      timestamp: Date.now(),
      name: 'largest_contentful_paint',
      value: entry.startTime,
      unit: METRIC_UNITS.MILLISECONDS,
    };

    this.addMetric(metric);
  }

  /**
   * 메트릭 추가
   */
  private addMetric(metric: PerformanceData): void {
    const key = `${metric.type}:${metric.name}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metrics = this.metrics.get(key)!;
    metrics.push(metric);

    // 저장 제한 적용
    if (metrics.length > STORAGE_LIMITS.MAX_API_METRICS) {
      metrics.shift();
    }

    this.emit('metrics-updated', { type: metric.type, data: metric });
    
    if (this.options.onMetricsUpdate) {
      this.options.onMetricsUpdate(metric.type, metric);
    }
  }

  /**
   * API 메트릭 추가
   */
  addAPIMetric(metric: APIMetrics): void {
    this.apiMetrics.push(metric);

    // 저장 제한 적용
    if (this.apiMetrics.length > STORAGE_LIMITS.MAX_API_METRICS) {
      this.apiMetrics.shift();
    }

    this.emit('api-metrics-updated', { metrics: metric });

    // 성능 데이터로 변환
    const perfData: PerformanceData = {
      type: MetricTypeConst.API,
      timestamp: metric.startTime,
      name: `api_${metric.method}_${metric.endpoint}`,
      value: metric.duration,
      unit: METRIC_UNITS.MILLISECONDS,
      tags: {
        endpoint: metric.endpoint,
        method: metric.method,
        statusCode: metric.statusCode.toString(),
      },
    };

    this.addMetric(perfData);
  }

  /**
   * 시스템 메트릭 수집 시작
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.collectSystemMetrics();

    // 주기적으로 시스템 메트릭 수집
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsInterval);
  }

  /**
   * 시스템 메트릭 수집 중지
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    // Performance Observer 정리
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }

  /**
   * 시스템 메트릭 수집
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // 실제 환경에서는 백엔드 API를 호출하여 시스템 메트릭을 가져옴
      // 개발 환경에서는 모의 데이터 사용
      this.systemMetrics = generateMockSystemMetrics();

      // 시스템 메트릭을 성능 데이터로 변환
      const perfMetrics: PerformanceData[] = [
        {
          type: MetricTypeConst.SYSTEM,
          timestamp: this.systemMetrics.timestamp,
          name: 'cpu_usage',
          value: this.systemMetrics.cpu.usage,
          unit: METRIC_UNITS.PERCENTAGE,
        },
        {
          type: MetricTypeConst.SYSTEM,
          timestamp: this.systemMetrics.timestamp,
          name: 'memory_usage',
          value: this.systemMetrics.memory.percentage,
          unit: METRIC_UNITS.PERCENTAGE,
        },
        {
          type: MetricTypeConst.SYSTEM,
          timestamp: this.systemMetrics.timestamp,
          name: 'network_requests_per_second',
          value: this.systemMetrics.network.requestsPerSecond,
          unit: METRIC_UNITS.REQUESTS_PER_SECOND,
        },
      ];

      perfMetrics.forEach(metric => this.addMetric(metric));

      this.emit('system-metrics-updated', { metrics: this.systemMetrics });
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * 메트릭 집계
   */
  getAggregations(
    interval: MetricAggregation['period']['interval'] = '5m'
  ): MetricAggregation[] {
    const allMetrics: PerformanceData[] = [];
    
    this.metrics.forEach(metricList => {
      allMetrics.push(...metricList);
    });

    const aggregations = aggregateMetrics(allMetrics, interval);
    this.emit('aggregation-updated', { aggregations });
    
    return aggregations;
  }

  /**
   * 현재 시스템 메트릭 가져오기
   */
  getSystemMetrics(): SystemMetrics | null {
    return this.systemMetrics;
  }

  /**
   * API 메트릭 가져오기
   */
  getAPIMetrics(filter?: {
    endpoint?: string;
    method?: string;
    startTime?: number;
    endTime?: number;
  }): APIMetrics[] {
    if (!filter) return this.apiMetrics;

    return this.apiMetrics.filter(metric => {
      if (filter.endpoint && !metric.endpoint.includes(filter.endpoint)) {
        return false;
      }
      if (filter.method && metric.method !== filter.method) {
        return false;
      }
      if (filter.startTime && metric.startTime < filter.startTime) {
        return false;
      }
      if (filter.endTime && metric.endTime > filter.endTime) {
        return false;
      }
      return true;
    });
  }

  /**
   * 특정 메트릭 데이터 가져오기
   */
  getMetrics(type: MetricType, name: string): PerformanceData[] {
    const key = `${type}:${name}`;
    return this.metrics.get(key) || [];
  }

  /**
   * 모든 메트릭 초기화
   */
  clear(): void {
    this.metrics.clear();
    this.apiMetrics = [];
    this.systemMetrics = null;
  }

  /**
   * 에러 처리
   */
  private handleError(error: Error): void {
    console.error('MetricsCollector error:', error);
    this.emit('error', { error });
    
    if (this.options.onError) {
      this.options.onError(error);
    }
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    this.stop();
    this.clear();
    this.listeners.clear();
  }
}