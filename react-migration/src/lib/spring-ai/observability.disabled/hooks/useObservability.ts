/**
 * useObservability Hook
 * 
 * Observability 시스템의 모든 기능을 통합 관리하는 React Hook입니다.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  ObservabilityConfig,
  ObservabilityState,
  SystemMetrics,
  APIMetrics,
  LogEntry,
  LogSearchOptions,
  LogStatistics,
  PerformanceData,
  MetricAggregation,
} from '../types';
import { MetricsCollector } from '../MetricsCollector';
import { LogAggregator } from '../LogAggregator';
import { InterceptorManager } from '../interceptors';
import { DEFAULT_OBSERVABILITY_CONFIG } from '../constants';

/**
 * Observability Hook 옵션
 */
export interface UseObservabilityOptions {
  config?: Partial<ObservabilityConfig>;
  autoStart?: boolean;
  persistLogs?: boolean;
  interceptFetch?: boolean;
  interceptAxios?: boolean;
  axiosInstance?: any;
}

/**
 * Observability Hook 반환값
 */
export interface UseObservabilityReturn {
  // 상태
  state: ObservabilityState;
  isRunning: boolean;
  
  // 설정
  config: ObservabilityConfig;
  updateConfig: (updates: Partial<ObservabilityConfig>) => void;
  
  // 제어
  start: () => void;
  stop: () => void;
  restart: () => void;
  clear: () => void;
  
  // 메트릭
  getSystemMetrics: () => SystemMetrics | null;
  getAPIMetrics: (filter?: any) => APIMetrics[];
  getAggregations: (interval?: MetricAggregation['period']['interval']) => MetricAggregation[];
  getPerformanceData: () => PerformanceData[];
  
  // 로그
  searchLogs: (options?: LogSearchOptions) => { logs: LogEntry[]; total: number; hasMore: boolean };
  addLog: (level: any, logger: string, message: string, context?: Record<string, any>) => void;
  clearLogs: () => void;
  getLogStatistics: () => LogStatistics;
  getLoggers: () => string[];
  getTags: () => string[];
  
  // 수동 메트릭 추가
  addAPIMetric: (metric: APIMetrics) => void;
  addPerformanceMetric: (metric: PerformanceData) => void;
  
  // 이벤트 핸들러
  onMetricsUpdate?: (callback: (data: any) => void) => () => void;
  onLogAdded?: (callback: (log: LogEntry) => void) => () => void;
  onError?: (callback: (error: Error) => void) => () => void;
}

/**
 * useObservability Hook
 */
export function useObservability(options: UseObservabilityOptions = {}): UseObservabilityReturn {
  const {
    config: initialConfig = {},
    autoStart = true,
    persistLogs = true,
    interceptFetch = true,
    interceptAxios = false,
    axiosInstance,
  } = options;

  // 설정 상태
  const [config, setConfig] = useState<ObservabilityConfig>(() => ({
    ...DEFAULT_OBSERVABILITY_CONFIG,
    ...initialConfig,
  }));

  // 실행 상태
  const [isRunning, setIsRunning] = useState(false);
  
  // Observability 상태
  const [state, setState] = useState<ObservabilityState>({
    config,
    systemMetrics: null,
    apiMetrics: [],
    logs: [],
    activeTraces: [],
    alertRules: [],
    activeAlerts: [],
    aggregations: new Map(),
    status: 'paused',
  });

  // 서비스 인스턴스 refs
  const metricsCollectorRef = useRef<MetricsCollector | null>(null);
  const logAggregatorRef = useRef<LogAggregator | null>(null);
  const interceptorManagerRef = useRef<InterceptorManager | null>(null);
  const isMountedRef = useRef(true);

  // 메트릭 히스토리
  const [systemMetricsHistory, setSystemMetricsHistory] = useState<SystemMetrics[]>([]);
  const [performanceDataHistory, setPerformanceDataHistory] = useState<PerformanceData[]>([]);

  // 상태 업데이트 헬퍼
  const updateState = useCallback((updates: Partial<ObservabilityState>) => {
    if (isMountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  // 메트릭 컬렉터 초기화
  const initializeMetricsCollector = useCallback(() => {
    if (metricsCollectorRef.current) {
      metricsCollectorRef.current.destroy();
    }

    metricsCollectorRef.current = new MetricsCollector({
      config,
      onMetricsUpdate: (type, data) => {
        // 성능 데이터 히스토리 업데이트
        if (data.type && data.name && typeof data.value === 'number') {
          setPerformanceDataHistory(prev => {
            const newData = [...prev, data];
            return newData.slice(-1000); // 최대 1000개 유지
          });
        }
      },
      onError: (error) => {
        updateState({ error, status: 'error' });
      },
    });

    // 이벤트 리스너 등록
    metricsCollectorRef.current.on('system-metrics-updated', ({ metrics }) => {
      updateState({ systemMetrics: metrics });
      setSystemMetricsHistory(prev => {
        const newHistory = [...prev, metrics];
        return newHistory.slice(-100); // 최대 100개 유지
      });
    });

    metricsCollectorRef.current.on('api-metrics-updated', ({ metrics }) => {
      updateState(prev => ({
        apiMetrics: [...prev.apiMetrics, metrics].slice(-1000), // 최대 1000개 유지
      }));
    });

    return metricsCollectorRef.current;
  }, [config, updateState]);

  // 로그 집계기 초기화
  const initializeLogAggregator = useCallback(() => {
    if (logAggregatorRef.current) {
      logAggregatorRef.current.destroy();
    }

    logAggregatorRef.current = new LogAggregator({
      config,
      persistToStorage: persistLogs,
      onLogAdded: (log) => {
        updateState(prev => ({
          logs: [...prev.logs, log].slice(-5000), // 최대 5000개 유지
        }));
      },
      onError: (error) => {
        updateState({ error, status: 'error' });
      },
    });

    return logAggregatorRef.current;
  }, [config, persistLogs, updateState]);

  // 인터셉터 매니저 초기화
  const initializeInterceptorManager = useCallback(() => {
    if (!metricsCollectorRef.current) return null;

    if (interceptorManagerRef.current) {
      interceptorManagerRef.current.uninstallAll(axiosInstance);
    }

    interceptorManagerRef.current = new InterceptorManager(metricsCollectorRef.current);

    // Fetch 인터셉터 설치
    if (interceptFetch) {
      interceptorManagerRef.current.installFetchInterceptor({
        excludePatterns: [
          /\/api\/observability/, // 자체 API 제외
          /\.js$/, /\.css$/, /\.png$/, /\.jpg$/, /\.gif$/, // 정적 리소스 제외
        ],
      });
    }

    // Axios 인터셉터 설치
    if (interceptAxios && axiosInstance) {
      interceptorManagerRef.current.installAxiosInterceptor(axiosInstance, {
        excludePatterns: [
          /\/api\/observability/,
        ],
      });
    }

    return interceptorManagerRef.current;
  }, [interceptFetch, interceptAxios, axiosInstance]);

  // 시작
  const start = useCallback(() => {
    if (isRunning) return;

    try {
      updateState({ status: 'active', error: undefined });

      // 서비스 초기화
      const metricsCollector = initializeMetricsCollector();
      const logAggregator = initializeLogAggregator();
      const interceptorManager = initializeInterceptorManager();

      // 메트릭 수집 시작
      if (metricsCollector && config.metricsEnabled) {
        metricsCollector.start();
      }

      setIsRunning(true);
    } catch (error) {
      updateState({ error: error as Error, status: 'error' });
    }
  }, [isRunning, config, initializeMetricsCollector, initializeLogAggregator, initializeInterceptorManager, updateState]);

  // 중지
  const stop = useCallback(() => {
    if (!isRunning) return;

    try {
      updateState({ status: 'paused' });

      // 메트릭 수집 중지
      if (metricsCollectorRef.current) {
        metricsCollectorRef.current.stop();
      }

      // 인터셉터 제거
      if (interceptorManagerRef.current) {
        interceptorManagerRef.current.uninstallAll(axiosInstance);
      }

      setIsRunning(false);
    } catch (error) {
      updateState({ error: error as Error, status: 'error' });
    }
  }, [isRunning, axiosInstance, updateState]);

  // 재시작
  const restart = useCallback(() => {
    stop();
    setTimeout(start, 100);
  }, [stop, start]);

  // 모든 데이터 지우기
  const clear = useCallback(() => {
    if (metricsCollectorRef.current) {
      metricsCollectorRef.current.clear();
    }
    if (logAggregatorRef.current) {
      logAggregatorRef.current.clear();
    }
    
    setSystemMetricsHistory([]);
    setPerformanceDataHistory([]);
    
    updateState({
      systemMetrics: null,
      apiMetrics: [],
      logs: [],
      activeTraces: [],
      activeAlerts: [],
      aggregations: new Map(),
    });
  }, [updateState]);

  // 설정 업데이트
  const updateConfig = useCallback((updates: Partial<ObservabilityConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    updateState({ config: newConfig });

    // 실행 중이면 재시작
    if (isRunning) {
      restart();
    }
  }, [config, isRunning, restart, updateState]);

  // 메트릭 관련 메서드들
  const getSystemMetrics = useCallback(() => {
    return metricsCollectorRef.current?.getSystemMetrics() || null;
  }, []);

  const getAPIMetrics = useCallback((filter?: any) => {
    return metricsCollectorRef.current?.getAPIMetrics(filter) || [];
  }, []);

  const getAggregations = useCallback((interval?: MetricAggregation['period']['interval']) => {
    return metricsCollectorRef.current?.getAggregations(interval) || [];
  }, []);

  const getPerformanceData = useCallback(() => {
    return performanceDataHistory;
  }, [performanceDataHistory]);

  const addAPIMetric = useCallback((metric: APIMetrics) => {
    metricsCollectorRef.current?.addAPIMetric(metric);
  }, []);

  const addPerformanceMetric = useCallback((metric: PerformanceData) => {
    setPerformanceDataHistory(prev => {
      const newData = [...prev, metric];
      return newData.slice(-1000);
    });
  }, []);

  // 로그 관련 메서드들
  const searchLogs = useCallback((options?: LogSearchOptions) => {
    return logAggregatorRef.current?.searchLogs(options) || { logs: [], total: 0, hasMore: false };
  }, []);

  const addLog = useCallback((level: any, logger: string, message: string, context?: Record<string, any>) => {
    logAggregatorRef.current?.addLog(level, logger, message, context);
  }, []);

  const clearLogs = useCallback(() => {
    logAggregatorRef.current?.clear();
  }, []);

  const getLogStatistics = useCallback(() => {
    return logAggregatorRef.current?.getStatistics() || {
      total: 0,
      byLevel: {} as any,
      byLogger: {},
      errorCount: 0,
      warningCount: 0,
      recentErrors: [],
    };
  }, []);

  const getLoggers = useCallback(() => {
    return logAggregatorRef.current?.getLoggers() || [];
  }, []);

  const getTags = useCallback(() => {
    return logAggregatorRef.current?.getTags() || [];
  }, []);

  // 이벤트 핸들러들
  const onMetricsUpdate = useCallback((callback: (data: any) => void) => {
    if (!metricsCollectorRef.current) return () => {};
    
    metricsCollectorRef.current.on('metrics-updated', callback);
    return () => {
      metricsCollectorRef.current?.off('metrics-updated', callback);
    };
  }, []);

  const onLogAdded = useCallback((callback: (log: LogEntry) => void) => {
    if (!logAggregatorRef.current) return () => {};
    
    logAggregatorRef.current.on('log-added', ({ log }) => callback(log));
    return () => {
      logAggregatorRef.current?.off('log-added', ({ log }) => callback(log));
    };
  }, []);

  const onError = useCallback((callback: (error: Error) => void) => {
    const unsubscribers: (() => void)[] = [];

    if (metricsCollectorRef.current) {
      metricsCollectorRef.current.on('error', ({ error }) => callback(error));
      unsubscribers.push(() => {
        metricsCollectorRef.current?.off('error', ({ error }) => callback(error));
      });
    }

    if (logAggregatorRef.current) {
      logAggregatorRef.current.on('error', ({ error }) => callback(error));
      unsubscribers.push(() => {
        logAggregatorRef.current?.off('error', ({ error }) => callback(error));
      });
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  // 컴포넌트 마운트 시 자동 시작
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      isMountedRef.current = false;
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (metricsCollectorRef.current) {
        metricsCollectorRef.current.destroy();
      }
      if (logAggregatorRef.current) {
        logAggregatorRef.current.destroy();
      }
      if (interceptorManagerRef.current) {
        interceptorManagerRef.current.uninstallAll(axiosInstance);
      }
    };
  }, [axiosInstance]);

  // 메모이즈된 반환값
  return useMemo(() => ({
    state,
    isRunning,
    config,
    updateConfig,
    start,
    stop,
    restart,
    clear,
    getSystemMetrics,
    getAPIMetrics,
    getAggregations,
    getPerformanceData,
    searchLogs,
    addLog,
    clearLogs,
    getLogStatistics,
    getLoggers,
    getTags,
    addAPIMetric,
    addPerformanceMetric,
    onMetricsUpdate,
    onLogAdded,
    onError,
  }), [
    state,
    isRunning,
    config,
    updateConfig,
    start,
    stop,
    restart,
    clear,
    getSystemMetrics,
    getAPIMetrics,
    getAggregations,
    getPerformanceData,
    searchLogs,
    addLog,
    clearLogs,
    getLogStatistics,
    getLoggers,
    getTags,
    addAPIMetric,
    addPerformanceMetric,
    onMetricsUpdate,
    onLogAdded,
    onError,
  ]);
}