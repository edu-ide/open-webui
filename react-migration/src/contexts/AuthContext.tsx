import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useApiService } from '../hooks/useApiService';
import { User as ApiUser, LoginRequest, SignUpRequest } from '../api/common';
import { globalBridge } from '../utils/postMessageBridge';

// User 타입 정의 (API와 호환)
export interface User extends Omit<ApiUser, 'username'> {
  username: string; // 필수 필드로 재정의
  profile_image_url?: string; // 기존 타입과 호환
  profileImage?: string; // microblog-lms 호환
  avatar?: string;
  phone?: string;
  last_active_at?: string;
  settings?: Record<string, any>;
  is_active?: boolean;
  // snake_case to camelCase 매핑
  created_at?: string;
  updated_at?: string;
}

// 인증 상태 타입
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// 인증 컨텍스트 타입
interface AuthContextType extends AuthState {
  // 기본 인증 함수들 (기존 컴포넌트 호환성)
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (userData: { name: string; email: string; password: string; profile_image_url?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
  
  // 새로운 TokenManager 기반 함수들
  setTokenAndUser: (token: string, user: User) => void;
  clearAuth: () => void;
}

// 초기 상태
const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Context 생성
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider 컴포넌트
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(initialState);
  const apiService = useApiService();

  // 토큰과 사용자 정보 설정 (PostMessage에서 사용)
  const setTokenAndUser = useCallback(async (token: string, user: User) => {
    console.log('[AuthProvider] Setting token and user:', { userId: user.id, username: user.username });
    await apiService.onLoginSuccess(token);
    setAuthState(prev => ({
      ...prev,
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    }));
  }, [apiService]);

  // 인증 정보 클리어
  const clearAuth = useCallback(() => {
    console.log('[AuthProvider] Clearing auth');
    apiService.onLogout();
    setAuthState(prev => ({
      ...prev,
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    }));
  }, [apiService]);

  // API 서비스 상태와 동기화
  const syncWithApiService = useCallback(() => {
    setAuthState(prev => ({
      ...prev,
      user: apiService.user,
      token: apiService.isAuthenticated ? 'valid' : null, // 실제 토큰은 내부에서 관리
      isAuthenticated: apiService.isAuthenticated,
      isLoading: apiService.isAuthChecking,
    }));
  }, [apiService]);

  // API 서비스 초기화 및 상태 동기화
  useEffect(() => {
    console.log('[AuthProvider] Initializing with API Service');
    
    // 초기 상태 동기화
    syncWithApiService();

    // 인증 리다이렉트 콜백 설정
    apiService.registerAuthRedirect(() => {
      console.log('[AuthProvider] Auth redirect triggered');
      clearAuth();
    });

    // PostMessage 인증 리스너 설정
    const handleAuthMessage = (data: { userId: string; sessionToken: string; user: any }) => {
      console.log('[AuthProvider] Received auth from host:', { userId: data.userId });
      
      // microblog-lms에서 전달받은 인증 정보를 open-webui 형식으로 변환
      const convertedUser: User = {
        id: data.userId,
        email: data.user?.email || '',
        name: data.user?.name || '',
        username: data.user?.username,
        role: data.user?.role || 'user',
        profile_image_url: data.user?.profile_image_url,
        profileImage: data.user?.profileImage,
        avatar: data.user?.avatar,
        phone: data.user?.phone,
        created_at: data.user?.created_at,
        updated_at: data.user?.updated_at,
        last_active_at: data.user?.last_active_at,
        settings: data.user?.settings,
        is_active: data.user?.is_active
      };

      // TokenManager를 통해 인증 정보 설정
      setTokenAndUser(data.sessionToken, convertedUser);
      
      // 호스트에게 준비 완료 알림
      globalBridge.send('openwebui:ready', {
        chatId: undefined,
        theme: document.documentElement.getAttribute('data-theme') || 'light'
      });
    };

    // 테마 동기화 리스너
    const handleThemeMessage = (data: { theme: 'light' | 'dark' }) => {
      console.log('[AuthProvider] Received theme from host:', data.theme);
      document.documentElement.setAttribute('data-theme', data.theme);
      document.documentElement.style.setProperty('--theme-mode', data.theme);
    };

    // 설정 동기화 리스너
    const handleConfigMessage = (data: { apiUrl: string; websocketUrl: string }) => {
      console.log('[AuthProvider] Received config from host:', data);
      // API URL을 환경 변수나 설정으로 저장
      localStorage.setItem('api_url', data.apiUrl);
      localStorage.setItem('websocket_url', data.websocketUrl);
    };

    // PostMessage 리스너 등록
    globalBridge.on('host:auth', handleAuthMessage);
    globalBridge.on('host:theme', handleThemeMessage);
    globalBridge.on('host:config', handleConfigMessage);

    // 정리 함수
    return () => {
      globalBridge.off('host:auth', handleAuthMessage);
      globalBridge.off('host:theme', handleThemeMessage);
      globalBridge.off('host:config', handleConfigMessage);
    };
  }, [syncWithApiService, setTokenAndUser, clearAuth, apiService]);

  // API 서비스 상태 변경 감지 및 동기화
  useEffect(() => {
    syncWithApiService();
  }, [apiService.isAuthenticated, apiService.isAuthChecking, apiService.user, syncWithApiService]);

  // 기존 호환성을 위한 함수들
  const signIn = useCallback(async (credentials: { email: string; password: string }) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const loginRequest: LoginRequest = {
        username: credentials.email,
        password: credentials.password,
      };
      
      const [response, error] = await apiService.auth.login(loginRequest);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (response?.data) {
        const token = response.data.data.access_token;
        const refreshToken = response.data.data.refresh_token;
        await apiService.onLoginSuccess(token, refreshToken);
        
        // 사용자 정보 가져오기
        const [userResponse, userError] = await apiService.auth.getCurrentUser();
        if (userResponse?.data) {
          setAuthState(prev => ({
            ...prev,
            user: userResponse.data.data as User,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          }));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '로그인에 실패했습니다.';
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, [apiService]);

  const signUp = useCallback(async (userData: { name: string; email: string; password: string; profile_image_url?: string }) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const signUpRequest: SignUpRequest = {
        username: userData.email,
        email: userData.email,
        password: userData.password,
        name: userData.name,
      };
      
      const [response, error] = await apiService.auth.signUp(signUpRequest);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (response?.data) {
        setAuthState(prev => ({
          ...prev,
          user: response.data.data as User,
          isLoading: false,
          error: null,
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '회원가입에 실패했습니다.';
      setAuthState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, [apiService]);

  const signOut = useCallback(async () => {
    try {
      await apiService.auth.logout();
    } catch (error) {
      console.error('Sign out API error:', error);
    } finally {
      clearAuth();
    }
  }, [apiService, clearAuth]);

  const updateUser = useCallback(async (userData: Partial<User>) => {
    try {
      // API 호출로 사용자 정보 업데이트 (실제 구현 시 추가)
      console.log('Updating user:', userData);
      
      // 현재 사용자 정보 업데이트
      if (authState.user) {
        const mergedUser = { ...authState.user, ...userData };
        setAuthState(prev => ({
          ...prev,
          user: mergedUser,
        }));
      }
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  }, [authState.user]);

  const refreshToken = useCallback(async () => {
    try {
      const [response, error] = await apiService.auth.refreshToken();
      if (error) {
        throw new Error(error.message);
      }
      
      if (response?.data) {
        const token = response.data.data.access_token;
        const refreshToken = response.data.data.refresh_token;
        await apiService.onLoginSuccess(token, refreshToken);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      clearAuth();
      throw error;
    }
  }, [apiService, clearAuth]);

  const checkAuth = useCallback(async () => {
    try {
      const isValid = await apiService.checkAuth();
      if (isValid) {
        syncWithApiService();
      } else {
        clearAuth();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      clearAuth();
    }
  }, [apiService, syncWithApiService, clearAuth]);

  // Context 값
  const value: AuthContextType = {
    ...authState,
    signIn,
    signUp,
    signOut,
    updateUser,
    refreshToken,
    checkAuth,
    setTokenAndUser,
    clearAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}