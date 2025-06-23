/**
 * 토큰 관리를 중앙화하는 클래스
 * microblog-lms와 호환되는 토큰 관리 시스템
 */

// microblog-lms와 동일한 토큰 키 사용
export const TOKEN_KEY = 'pearai_token';
export const USER_KEY = 'pearai_user';
export const REFRESH_TOKEN_KEY = 'pearai_refresh_token';

export class TokenManager {
  private static instance: TokenManager;
  private currentToken: string | null = null;
  private listeners: Array<(token: string | null) => void> = [];

  private constructor() {
    // 초기화 시 localStorage에서 토큰 로드
    this.currentToken = localStorage.getItem(TOKEN_KEY);
  }

  static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * 토큰 설정 (동기적으로 처리)
   */
  setToken(token: string | null): void {
    console.log('[TokenManager] Setting token:', token ? '<token exists>' : 'null');
    
    const previousToken = this.currentToken;
    this.currentToken = token;

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }

    // 토큰이 변경된 경우에만 리스너에게 알림
    if (previousToken !== token) {
      this.notifyListeners(token);
    }
  }

  /**
   * 현재 토큰 반환
   */
  getToken(): string | null {
    return this.currentToken;
  }

  /**
   * 토큰 존재 여부 확인
   */
  hasToken(): boolean {
    return !!this.currentToken;
  }

  /**
   * 토큰 변경 리스너 등록
   */
  addTokenChangeListener(listener: (token: string | null) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 토큰 변경 리스너 제거
   */
  removeTokenChangeListener(listener: (token: string | null) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  /**
   * 모든 리스너에게 토큰 변경 알림
   */
  private notifyListeners(token: string | null): void {
    this.listeners.forEach(listener => {
      try {
        listener(token);
      } catch (error) {
        console.error('[TokenManager] Error in token change listener:', error);
      }
    });
  }

  /**
   * 토큰 클리어
   */
  clearToken(): void {
    this.setToken(null);
  }

  /**
   * 사용자 정보 설정
   */
  setUser(user: any): void {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }

  /**
   * 사용자 정보 가져오기
   */
  getUser(): any | null {
    try {
      const userData = localStorage.getItem(USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('[TokenManager] Error parsing user data:', error);
      return null;
    }
  }

  /**
   * 모든 인증 데이터 클리어
   */
  clearAll(): void {
    this.clearToken();
    this.setUser(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

// 싱글톤 인스턴스 export
export const tokenManager = TokenManager.getInstance();