import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { 
  AuthApi, 
  ChatApi,
  Configuration 
} from '../api';

// 에러 타입 정의
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

// 실패한 요청 큐 아이템
interface FailedRequestQueueItem {
  resolve: (value?: any) => void;
  reject: (error?: any) => void;
}

// API 에러를 AppError로 변환
export function convertApiError(error: AxiosError): AppError {
  const timestamp = new Date().toISOString();
  
  if (error.response) {
    // 서버 응답이 있는 경우
    const status = error.response.status;
    const data = error.response.data as any;
    
    return {
      code: `HTTP_${status}`,
      message: data?.message || data?.error || `HTTP ${status} 오류가 발생했습니다.`,
      details: data,
      timestamp
    };
  } else if (error.request) {
    // 요청은 보냈지만 응답이 없는 경우
    return {
      code: 'NETWORK_ERROR',
      message: '네트워크 연결을 확인해주세요.',
      details: error.message,
      timestamp
    };
  } else {
    // 요청 설정 중 오류가 발생한 경우
    return {
      code: 'REQUEST_ERROR',
      message: error.message || '요청 처리 중 오류가 발생했습니다.',
      details: error,
      timestamp
    };
  }
}

// 안전한 API 호출 래퍼
export async function safeApiCall<T>(
  apiCall: () => Promise<T>
): Promise<[T | null, AppError | null]> {
  try {
    const result = await apiCall();
    return [result, null];
  } catch (error) {
    const appError = convertApiError(error as AxiosError);
    return [null, appError];
  }
}

// 토큰 상태 확인 함수
export async function checkTokenStatus(): Promise<boolean> {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    
    // JWT 토큰 만료 확인 (간단한 체크)
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Date.now() / 1000;
    
    return payload.exp > now;
  } catch (error) {
    console.warn('토큰 상태 확인 실패:', error);
    return false;
  }
}

/**
 * React Migration API 서비스 클래스
 * 토큰 기반 인증을 사용하는 API와의 통신을 담당
 */
class ReactMigrationApiService {
  private static instance: ReactMigrationApiService;
  private axiosInstance: AxiosInstance;
  private _isAuthenticated: boolean = false;
  private isTokenRefreshing = false;
  private failedQueue: FailedRequestQueueItem[] = [];
  private authRedirectCallback: (() => void) | null = null;

  // OpenAPI 생성 클라이언트들
  public readonly authApi: AuthApi;
  public readonly chatApi: ChatApi;

  private constructor() {
    // 환경별 기본 URL 설정
    const baseURL = import.meta.env.DEV 
      ? import.meta.env.VITE_API_BASE_URL || "http://localhost:8080"
      : import.meta.env.VITE_API_BASE_URL || "";

    // Axios 인스턴스 생성
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // OpenAPI 클라이언트 설정
    const config = new Configuration({
      basePath: baseURL,
    });

    // API 클라이언트들 초기화
    this.authApi = new AuthApi(config, undefined, this.axiosInstance);
    this.chatApi = new ChatApi(config, undefined, this.axiosInstance);

    this.setupInterceptors();
    this.initializeAuth();
  }

  public static getInstance(): ReactMigrationApiService {
    if (!ReactMigrationApiService.instance) {
      ReactMigrationApiService.instance = new ReactMigrationApiService();
    }
    return ReactMigrationApiService.instance;
  }

  private setupInterceptors() {
    // 요청 인터셉터
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // 인증 토큰 추가
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        const isApiRequest = config.url?.includes('/api/');
        if (isApiRequest && import.meta.env.DEV) {
          console.log(`[API 요청] ${config.method?.toUpperCase()} ${config.url}`);
        }
        
        return config;
      },
      (error) => {
        console.error('[API 요청 오류]', error);
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.axiosInstance.interceptors.response.use(
      (response) => {
        const isApiRequest = response.config.url?.includes('/api/');
        if (isApiRequest && import.meta.env.DEV) {
          console.log(`[API 응답] ${response.status} ${response.config.url}`);
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          if (this.isTokenRefreshing) {
            // 이미 토큰 갱신 중이면 큐에 추가
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then(() => {
              return this.axiosInstance(originalRequest);
            }).catch((err) => {
              return Promise.reject(err);
            });
          }

          this.isTokenRefreshing = true;

          try {
            // 토큰 갱신 시도
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
              const response = await this.authApi.refreshToken();
              const newToken = response.data.data.access_token;
              
              localStorage.setItem('access_token', newToken);
              if (response.data.data.refresh_token) {
                localStorage.setItem('refresh_token', response.data.data.refresh_token);
              }
              
              // 실패한 요청들 재시도
              this.processQueue(null);
              return this.axiosInstance(originalRequest);
            } else {
              // 리프레시 토큰이 없으면 로그인 페이지로 리다이렉트
              this.processQueue(convertApiError(error));
              this.handleAuthRedirect();
              return Promise.reject(convertApiError(error));
            }
          } catch (refreshError) {
            this.processQueue(convertApiError(error));
            this.handleAuthRedirect();
            return Promise.reject(convertApiError(error));
          } finally {
            this.isTokenRefreshing = false;
          }
        }

        return Promise.reject(convertApiError(error));
      }
    );
  }

  private processQueue(error: AppError | null) {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    
    this.failedQueue = [];
  }

  private handleAuthRedirect() {
    this._isAuthenticated = false;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    
    if (this.authRedirectCallback) {
      this.authRedirectCallback();
    } else {
      // 기본 로그인 페이지로 리다이렉트
      window.location.href = '/auth';
    }
  }

  private async initializeAuth() {
    const isTokenValid = await checkTokenStatus();
    this._isAuthenticated = isTokenValid;
    
    if (import.meta.env.DEV) {
      console.log(`[인증 상태] ${isTokenValid ? '유효' : '무효'}`);
    }
  }

  private async checkAndUpdateAuthStatus(): Promise<boolean> {
    try {
      const isValid = await checkTokenStatus();
      this._isAuthenticated = isValid;
      
      if (import.meta.env.DEV) {
        console.log(`[토큰 상태] ${isValid ? '유효' : '무효'}`);
      }
      
      return isValid;
    } catch (error) {
      console.warn('[토큰 확인 실패]', error);
      this._isAuthenticated = false;
      return false;
    }
  }

  // Public API
  public get isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  public async checkAuth(): Promise<boolean> {
    return this.checkAndUpdateAuthStatus();
  }

  public async onLoginSuccess(token: string, refreshToken?: string): Promise<void> {
    localStorage.setItem('access_token', token);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    this._isAuthenticated = true;
    console.log('[인증] 로그인 성공 - 토큰 저장됨');
  }

  public onLogout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this._isAuthenticated = false;
    console.log('[인증] 로그아웃 - 토큰 삭제됨');
  }

  public registerAuthRedirectCallback(callback: (() => void) | null): void {
    this.authRedirectCallback = callback;
  }

  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// 싱글톤 인스턴스 export
export function getReactMigrationApiService(): ReactMigrationApiService {
  return ReactMigrationApiService.getInstance();
}

// 기본 export
export default ReactMigrationApiService;