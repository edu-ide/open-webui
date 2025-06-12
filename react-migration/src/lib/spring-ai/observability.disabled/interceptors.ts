/**
 * API 성능 추적 인터셉터
 * 
 * fetch API와 axios 요청을 인터셉트하여 성능 메트릭을 수집합니다.
 */

import type { APIMetrics } from './types';
import { MetricsCollector } from './MetricsCollector';

/**
 * Fetch 인터셉터 옵션
 */
export interface FetchInterceptorOptions {
  metricsCollector: MetricsCollector;
  excludePatterns?: RegExp[];
  includeHeaders?: boolean;
  includeBody?: boolean;
}

/**
 * Axios 인터셉터 옵션
 */
export interface AxiosInterceptorOptions {
  metricsCollector: MetricsCollector;
  excludePatterns?: RegExp[];
}

/**
 * 요청 컨텍스트
 */
interface RequestContext {
  startTime: number;
  method: string;
  url: string;
  headers?: Headers;
  body?: any;
}

/**
 * Fetch API 인터셉터
 */
export class FetchInterceptor {
  private originalFetch: typeof fetch;
  private metricsCollector: MetricsCollector;
  private excludePatterns: RegExp[];
  private includeHeaders: boolean;
  private includeBody: boolean;

  constructor(options: FetchInterceptorOptions) {
    this.originalFetch = window.fetch;
    this.metricsCollector = options.metricsCollector;
    this.excludePatterns = options.excludePatterns || [];
    this.includeHeaders = options.includeHeaders || false;
    this.includeBody = options.includeBody || false;
  }

  /**
   * Fetch 인터셉터 설치
   */
  install(): void {
    const self = this;

    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = typeof input === 'string' 
        ? input 
        : input instanceof URL 
          ? input.toString() 
          : input.url;

      // 제외 패턴 체크
      if (self.shouldExclude(url)) {
        return self.originalFetch.apply(window, [input, init]);
      }

      const method = (init?.method || 'GET').toUpperCase();
      const startTime = Date.now();

      const context: RequestContext = {
        startTime,
        method,
        url,
        headers: init?.headers instanceof Headers ? init.headers : undefined,
        body: self.includeBody ? init?.body : undefined,
      };

      try {
        const response = await self.originalFetch.apply(window, [input, init]);
        const endTime = Date.now();

        // 응답 크기 계산을 위해 복제
        const clonedResponse = response.clone();
        let responseSize = 0;

        try {
          const blob = await clonedResponse.blob();
          responseSize = blob.size;
        } catch {
          // 크기 계산 실패 시 무시
        }

        // API 메트릭 생성
        const metric: APIMetrics = {
          endpoint: new URL(url).pathname,
          method: method as APIMetrics['method'],
          startTime,
          endTime,
          duration: endTime - startTime,
          statusCode: response.status,
          requestSize: self.getRequestSize(context),
          responseSize,
          metadata: self.getMetadata(context, response),
        };

        // 메트릭 수집
        self.metricsCollector.addAPIMetric(metric);

        return response;
      } catch (error) {
        const endTime = Date.now();

        // 에러 메트릭 생성
        const metric: APIMetrics = {
          endpoint: new URL(url).pathname,
          method: method as APIMetrics['method'],
          startTime,
          endTime,
          duration: endTime - startTime,
          statusCode: 0, // 네트워크 에러
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: error instanceof Error ? error.constructor.name : 'Error',
            stack: error instanceof Error ? error.stack : undefined,
          },
          metadata: self.getMetadata(context),
        };

        // 메트릭 수집
        self.metricsCollector.addAPIMetric(metric);

        throw error;
      }
    };
  }

  /**
   * Fetch 인터셉터 제거
   */
  uninstall(): void {
    window.fetch = this.originalFetch;
  }

  /**
   * URL 제외 여부 확인
   */
  private shouldExclude(url: string): boolean {
    return this.excludePatterns.some(pattern => pattern.test(url));
  }

  /**
   * 요청 크기 계산
   */
  private getRequestSize(context: RequestContext): number | undefined {
    if (!context.body) return undefined;

    if (typeof context.body === 'string') {
      return new Blob([context.body]).size;
    }

    if (context.body instanceof Blob) {
      return context.body.size;
    }

    if (context.body instanceof ArrayBuffer) {
      return context.body.byteLength;
    }

    if (context.body instanceof FormData) {
      // FormData 크기는 정확히 계산하기 어려움
      return undefined;
    }

    // 기타 타입은 JSON 변환 시도
    try {
      return new Blob([JSON.stringify(context.body)]).size;
    } catch {
      return undefined;
    }
  }

  /**
   * 메타데이터 생성
   */
  private getMetadata(
    context: RequestContext,
    response?: Response
  ): APIMetrics['metadata'] {
    const metadata: APIMetrics['metadata'] = {};

    // 헤더 정보 포함
    if (this.includeHeaders && context.headers) {
      metadata.requestHeaders = {};
      context.headers.forEach((value, key) => {
        metadata.requestHeaders![key] = value;
      });
    }

    if (this.includeHeaders && response?.headers) {
      metadata.responseHeaders = {};
      response.headers.forEach((value, key) => {
        metadata.responseHeaders![key] = value;
      });
    }

    // 추가 정보
    metadata.url = context.url;
    metadata.timestamp = new Date().toISOString();

    return metadata;
  }
}

/**
 * Axios 인터셉터
 */
export class AxiosInterceptor {
  private metricsCollector: MetricsCollector;
  private excludePatterns: RegExp[];
  private requestInterceptorId?: number;
  private responseInterceptorId?: number;

  constructor(options: AxiosInterceptorOptions) {
    this.metricsCollector = options.metricsCollector;
    this.excludePatterns = options.excludePatterns || [];
  }

  /**
   * Axios 인터셉터 설치
   */
  install(axiosInstance: any): void {
    // 요청 인터셉터
    this.requestInterceptorId = axiosInstance.interceptors.request.use(
      (config: any) => {
        if (!this.shouldExclude(config.url)) {
          config.metadata = { startTime: Date.now() };
        }
        return config;
      },
      (error: any) => {
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.responseInterceptorId = axiosInstance.interceptors.response.use(
      (response: any) => {
        if (response.config.metadata?.startTime) {
          const endTime = Date.now();
          const metric: APIMetrics = {
            endpoint: new URL(response.config.url, window.location.origin).pathname,
            method: response.config.method?.toUpperCase() || 'GET',
            startTime: response.config.metadata.startTime,
            endTime,
            duration: endTime - response.config.metadata.startTime,
            statusCode: response.status,
            requestSize: this.getAxiosRequestSize(response.config),
            responseSize: this.getAxiosResponseSize(response),
            metadata: {
              url: response.config.url,
              timestamp: new Date().toISOString(),
            },
          };

          this.metricsCollector.addAPIMetric(metric);
        }
        return response;
      },
      (error: any) => {
        if (error.config?.metadata?.startTime) {
          const endTime = Date.now();
          const metric: APIMetrics = {
            endpoint: new URL(error.config.url, window.location.origin).pathname,
            method: error.config.method?.toUpperCase() || 'GET',
            startTime: error.config.metadata.startTime,
            endTime,
            duration: endTime - error.config.metadata.startTime,
            statusCode: error.response?.status || 0,
            error: {
              message: error.message,
              type: error.constructor.name,
              stack: error.stack,
            },
            metadata: {
              url: error.config.url,
              timestamp: new Date().toISOString(),
            },
          };

          this.metricsCollector.addAPIMetric(metric);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Axios 인터셉터 제거
   */
  uninstall(axiosInstance: any): void {
    if (this.requestInterceptorId !== undefined) {
      axiosInstance.interceptors.request.eject(this.requestInterceptorId);
    }
    if (this.responseInterceptorId !== undefined) {
      axiosInstance.interceptors.response.eject(this.responseInterceptorId);
    }
  }

  /**
   * URL 제외 여부 확인
   */
  private shouldExclude(url: string): boolean {
    return this.excludePatterns.some(pattern => pattern.test(url));
  }

  /**
   * Axios 요청 크기 계산
   */
  private getAxiosRequestSize(config: any): number | undefined {
    if (!config.data) return undefined;

    if (typeof config.data === 'string') {
      return new Blob([config.data]).size;
    }

    try {
      return new Blob([JSON.stringify(config.data)]).size;
    } catch {
      return undefined;
    }
  }

  /**
   * Axios 응답 크기 계산
   */
  private getAxiosResponseSize(response: any): number | undefined {
    if (!response.data) return undefined;

    if (typeof response.data === 'string') {
      return new Blob([response.data]).size;
    }

    try {
      return new Blob([JSON.stringify(response.data)]).size;
    } catch {
      return undefined;
    }
  }
}

/**
 * 인터셉터 매니저
 */
export class InterceptorManager {
  private fetchInterceptor?: FetchInterceptor;
  private axiosInterceptor?: AxiosInterceptor;

  constructor(private metricsCollector: MetricsCollector) {}

  /**
   * Fetch 인터셉터 설치
   */
  installFetchInterceptor(options?: Partial<FetchInterceptorOptions>): void {
    if (this.fetchInterceptor) {
      this.fetchInterceptor.uninstall();
    }

    this.fetchInterceptor = new FetchInterceptor({
      metricsCollector: this.metricsCollector,
      ...options,
    });

    this.fetchInterceptor.install();
  }

  /**
   * Axios 인터셉터 설치
   */
  installAxiosInterceptor(
    axiosInstance: any,
    options?: Partial<AxiosInterceptorOptions>
  ): void {
    if (this.axiosInterceptor) {
      this.axiosInterceptor.uninstall(axiosInstance);
    }

    this.axiosInterceptor = new AxiosInterceptor({
      metricsCollector: this.metricsCollector,
      ...options,
    });

    this.axiosInterceptor.install(axiosInstance);
  }

  /**
   * 모든 인터셉터 제거
   */
  uninstallAll(axiosInstance?: any): void {
    if (this.fetchInterceptor) {
      this.fetchInterceptor.uninstall();
      this.fetchInterceptor = undefined;
    }

    if (this.axiosInterceptor && axiosInstance) {
      this.axiosInterceptor.uninstall(axiosInstance);
      this.axiosInterceptor = undefined;
    }
  }
}