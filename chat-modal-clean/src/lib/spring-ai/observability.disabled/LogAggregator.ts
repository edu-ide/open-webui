/**
 * 로그 집계 및 검색 시스템
 * 
 * 로그 수집, 저장, 검색 및 집계 기능을 제공합니다.
 */

import type {
  LogEntry,
  LogLevel,
  ObservabilityConfig,
} from './types';
import { LogLevel as LogLevelConst } from './types';
import { 
  STORAGE_LIMITS,
  LOG_FILTER_PRESETS,
} from './constants';
import { 
  createLogEntry,
  filterLogs,
  isLogLevelEnabled,
} from './utils';

/**
 * 로그 집계기 이벤트
 */
interface LogAggregatorEvents {
  'log-added': { log: LogEntry };
  'logs-cleared': void;
  'logs-filtered': { logs: LogEntry[] };
  'error': { error: Error };
}

/**
 * 로그 집계기 옵션
 */
export interface LogAggregatorOptions {
  config: ObservabilityConfig;
  persistToStorage?: boolean;
  storageKey?: string;
  onLogAdded?: (log: LogEntry) => void;
  onError?: (error: Error) => void;
}

/**
 * 로그 통계
 */
export interface LogStatistics {
  total: number;
  byLevel: Record<LogLevel, number>;
  byLogger: Record<string, number>;
  errorCount: number;
  warningCount: number;
  recentErrors: LogEntry[];
}

/**
 * 로그 검색 옵션
 */
export interface LogSearchOptions {
  query?: string;
  levels?: LogLevel[];
  loggers?: string[];
  tags?: string[];
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

/**
 * 로그 집계기 클래스
 */
export class LogAggregator {
  private config: ObservabilityConfig;
  private options: LogAggregatorOptions;
  private logs: LogEntry[] = [];
  private listeners: Map<keyof LogAggregatorEvents, Set<Function>> = new Map();
  private loggerSet: Set<string> = new Set();
  private tagSet: Set<string> = new Set();
  private persistToStorage: boolean;
  private storageKey: string;
  private consoleInterceptor?: ConsoleInterceptor;

  constructor(options: LogAggregatorOptions) {
    this.options = options;
    this.config = options.config;
    this.persistToStorage = options.persistToStorage || false;
    this.storageKey = options.storageKey || 'observability-logs';

    // 저장소에서 로그 복원
    if (this.persistToStorage) {
      this.restoreFromStorage();
    }

    // 콘솔 인터셉터 설정
    if (this.config.loggingEnabled) {
      this.setupConsoleInterceptor();
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  on<K extends keyof LogAggregatorEvents>(
    event: K,
    listener: (data: LogAggregatorEvents[K]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * 이벤트 리스너 제거
   */
  off<K extends keyof LogAggregatorEvents>(
    event: K,
    listener: (data: LogAggregatorEvents[K]) => void
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  /**
   * 이벤트 발생
   */
  private emit<K extends keyof LogAggregatorEvents>(
    event: K,
    data: LogAggregatorEvents[K]
  ): void {
    this.listeners.get(event)?.forEach(listener => listener(data));
  }

  /**
   * 로그 추가
   */
  addLog(
    level: LogLevel,
    logger: string,
    message: string,
    context?: Record<string, any>
  ): void {
    // 최소 로그 레벨 체크
    if (!isLogLevelEnabled(level, this.config.minLogLevel)) {
      return;
    }

    const log = createLogEntry(level, logger, message, context);
    
    // 로거와 태그 추적
    this.loggerSet.add(logger);
    if (log.tags) {
      log.tags.forEach(tag => this.tagSet.add(tag));
    }

    // 로그 저장
    this.logs.push(log);

    // 저장 제한 적용
    if (this.logs.length > STORAGE_LIMITS.MAX_LOGS) {
      this.logs.shift();
    }

    // 이벤트 발생
    this.emit('log-added', { log });
    
    if (this.options.onLogAdded) {
      this.options.onLogAdded(log);
    }

    // 저장소에 저장
    if (this.persistToStorage) {
      this.saveToStorage();
    }
  }

  /**
   * 로그 검색
   */
  searchLogs(options: LogSearchOptions = {}): {
    logs: LogEntry[];
    total: number;
    hasMore: boolean;
  } {
    // 필터링
    let filteredLogs = filterLogs(this.logs, {
      levels: options.levels,
      loggers: options.loggers,
      search: options.query,
      startTime: options.startTime,
      endTime: options.endTime,
      tags: options.tags,
    });

    // 정렬 (최신순)
    filteredLogs.sort((a, b) => b.timestamp - a.timestamp);

    const total = filteredLogs.length;
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    // 페이지네이션
    const paginatedLogs = filteredLogs.slice(offset, offset + limit);

    this.emit('logs-filtered', { logs: paginatedLogs });

    return {
      logs: paginatedLogs,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * 로그 통계 계산
   */
  getStatistics(): LogStatistics {
    const stats: LogStatistics = {
      total: this.logs.length,
      byLevel: {} as Record<LogLevel, number>,
      byLogger: {},
      errorCount: 0,
      warningCount: 0,
      recentErrors: [],
    };

    // 레벨별 초기화
    Object.values(LogLevelConst).forEach(level => {
      stats.byLevel[level as LogLevel] = 0;
    });

    // 통계 계산
    this.logs.forEach(log => {
      stats.byLevel[log.level]++;
      
      if (!stats.byLogger[log.logger]) {
        stats.byLogger[log.logger] = 0;
      }
      stats.byLogger[log.logger]++;

      if (log.level === LogLevelConst.ERROR || log.level === LogLevelConst.FATAL) {
        stats.errorCount++;
        if (stats.recentErrors.length < 10) {
          stats.recentErrors.push(log);
        }
      }

      if (log.level === LogLevelConst.WARN) {
        stats.warningCount++;
      }
    });

    // 최근 에러 정렬
    stats.recentErrors.sort((a, b) => b.timestamp - a.timestamp);

    return stats;
  }

  /**
   * 로거 목록 가져오기
   */
  getLoggers(): string[] {
    return Array.from(this.loggerSet).sort();
  }

  /**
   * 태그 목록 가져오기
   */
  getTags(): string[] {
    return Array.from(this.tagSet).sort();
  }

  /**
   * 로그 필터 프리셋 가져오기
   */
  getFilterPresets() {
    return LOG_FILTER_PRESETS;
  }

  /**
   * 모든 로그 가져오기
   */
  getAllLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 로그 지우기
   */
  clear(): void {
    this.logs = [];
    this.loggerSet.clear();
    this.tagSet.clear();
    
    this.emit('logs-cleared', undefined);

    if (this.persistToStorage) {
      this.clearStorage();
    }
  }

  /**
   * 콘솔 인터셉터 설정
   */
  private setupConsoleInterceptor(): void {
    this.consoleInterceptor = new ConsoleInterceptor({
      logAggregator: this,
      config: this.config,
    });
    this.consoleInterceptor.install();
  }

  /**
   * 저장소에 저장
   */
  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      
      // 최근 로그만 저장 (성능 최적화)
      const recentLogs = this.logs.slice(-STORAGE_LIMITS.MAX_LOGS);
      const data = {
        logs: recentLogs,
        loggers: Array.from(this.loggerSet),
        tags: Array.from(this.tagSet),
        timestamp: Date.now(),
      };

      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * 저장소에서 복원
   */
  private restoreFromStorage(): void {
    try {
      if (typeof window === 'undefined') return;

      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      
      // 오래된 데이터 확인 (24시간)
      if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
        this.clearStorage();
        return;
      }

      this.logs = data.logs || [];
      this.loggerSet = new Set(data.loggers || []);
      this.tagSet = new Set(data.tags || []);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * 저장소 지우기
   */
  private clearStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * 에러 처리
   */
  private handleError(error: Error): void {
    console.error('LogAggregator error:', error);
    this.emit('error', { error });
    
    if (this.options.onError) {
      this.options.onError(error);
    }
  }

  /**
   * 리소스 정리
   */
  destroy(): void {
    if (this.consoleInterceptor) {
      this.consoleInterceptor.uninstall();
    }
    this.clear();
    this.listeners.clear();
  }
}

/**
 * 콘솔 인터셉터
 */
class ConsoleInterceptor {
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };
  private options: {
    logAggregator: LogAggregator;
    config: ObservabilityConfig;
  };

  constructor(
    options: {
      logAggregator: LogAggregator;
      config: ObservabilityConfig;
    }
  ) {
    this.options = options;
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
  }

  /**
   * 콘솔 인터셉터 설치
   */
  install(): void {
    const self = this;

    // console.log
    console.log = function (...args: any[]) {
      self.originalConsole.log.apply(console, args);
      self.handleLog(LogLevelConst.INFO, 'console', args);
    };

    // console.info
    console.info = function (...args: any[]) {
      self.originalConsole.info.apply(console, args);
      self.handleLog(LogLevelConst.INFO, 'console', args);
    };

    // console.warn
    console.warn = function (...args: any[]) {
      self.originalConsole.warn.apply(console, args);
      self.handleLog(LogLevelConst.WARN, 'console', args);
    };

    // console.error
    console.error = function (...args: any[]) {
      self.originalConsole.error.apply(console, args);
      self.handleLog(LogLevelConst.ERROR, 'console', args);
    };

    // console.debug
    console.debug = function (...args: any[]) {
      self.originalConsole.debug.apply(console, args);
      self.handleLog(LogLevelConst.DEBUG, 'console', args);
    };
  }

  /**
   * 콘솔 인터셉터 제거
   */
  uninstall(): void {
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
  }

  /**
   * 로그 처리
   */
  private handleLog(level: LogLevel, logger: string, args: any[]): void {
    try {
      const message = args
        .map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      // 스택 트레이스 추출 (에러인 경우)
      let error: Error | undefined;
      if (level === LogLevelConst.ERROR) {
        const errorArg = args.find(arg => arg instanceof Error);
        if (errorArg) {
          error = errorArg;
        }
      }

      const context: Record<string, any> = {
        args: args.length > 1 ? args : undefined,
      };

      if (error) {
        context.error = {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name,
        };
      }

      this.options.logAggregator.addLog(level, logger, message, context);
    } catch (error) {
      // 로깅 실패 시 원본 콘솔로 출력
      this.originalConsole.error('ConsoleInterceptor error:', error);
    }
  }
}