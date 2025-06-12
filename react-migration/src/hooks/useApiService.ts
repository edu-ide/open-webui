import { useState, useEffect, useCallback } from 'react';
import { 
  getReactMigrationApiService, 
  safeApiCall, 
  checkTokenStatus,
  AppError 
} from '../services/api-service';
import { LoginRequest, SignUpRequest, ChatCompletionRequest } from '../api/common';

/**
 * React Migration API 훅
 * 토큰 기반 인증을 사용하는 API와의 통신을 위한 React 훅
 */
export function useApiService() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [user, setUser] = useState<any>(null);
  
  const apiService = getReactMigrationApiService();

  // 인증 상태 확인
  const checkAuth = useCallback(async (): Promise<boolean> => {
    setIsAuthChecking(true);
    try {
      const tokenValid = await checkTokenStatus();
      setIsAuthenticated(tokenValid);
      
      if (tokenValid) {
        // 토큰이 유효하면 사용자 정보 가져오기
        const [userResponse, userError] = await safeApiCall(() => 
          apiService.authApi.getCurrentUser()
        );
        
        if (userResponse && !userError) {
          setUser(userResponse.data.data);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      
      return tokenValid;
    } catch (error) {
      console.error('인증 확인 실패:', error);
      setIsAuthenticated(false);
      setUser(null);
      return false;
    } finally {
      setIsAuthChecking(false);
    }
  }, [apiService]);

  // 로그인 성공 처리
  const onLoginSuccess = useCallback(async (token: string, refreshToken?: string): Promise<void> => {
    await apiService.onLoginSuccess(token, refreshToken);
    await checkAuth();
  }, [apiService, checkAuth]);

  // 로그아웃 처리
  const onLogout = useCallback(async (): Promise<void> => {
    apiService.onLogout();
    setIsAuthenticated(false);
    setUser(null);
  }, [apiService]);

  // 인증 리다이렉트 콜백 등록
  const registerAuthRedirect = useCallback((callback: (() => void) | null) => {
    apiService.registerAuthRedirectCallback(callback);
  }, [apiService]);

  // 컴포넌트 마운트 시 인증 확인
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 인증 관련 API 호출 래퍼들
  const authActions = {
    // 로그인
    login: useCallback(async (loginRequest: LoginRequest) => {
      const result = await safeApiCall(() => 
        apiService.authApi.login(loginRequest)
      );
      
      if (result[0] && !result[1]) { // 성공하면
        const tokenData = result[0].data.data;
        await onLoginSuccess(tokenData.access_token, tokenData.refresh_token);
      }
      
      return result;
    }, [apiService, onLoginSuccess]),

    // 회원가입
    signUp: useCallback(async (signUpRequest: SignUpRequest) => {
      return safeApiCall(() => 
        apiService.authApi.signUp(signUpRequest)
      );
    }, [apiService]),

    // 로그아웃
    logout: useCallback(async () => {
      const result = await safeApiCall(() => 
        apiService.authApi.logout()
      );
      
      if (!result[1]) { // 에러가 없으면
        await onLogout();
      }
      
      return result;
    }, [apiService, onLogout]),

    // 현재 사용자 정보 조회
    getCurrentUser: useCallback(async () => {
      return safeApiCall(() => 
        apiService.authApi.getCurrentUser()
      );
    }, [apiService]),

    // 토큰 갱신
    refreshToken: useCallback(async () => {
      return safeApiCall(() => 
        apiService.authApi.refreshToken()
      );
    }, [apiService]),
  };

  // 채팅 관련 API 호출 래퍼들
  const chatActions = {
    // 채팅 세션 목록 조회
    getChatSessions: useCallback(async (page?: number, size?: number) => {
      return safeApiCall(() => 
        apiService.chatApi.getChatSessions(page, size)
      );
    }, [apiService]),

    // 채팅 세션 조회
    getChatSession: useCallback(async (sessionId: string) => {
      return safeApiCall(() => 
        apiService.chatApi.getChatSession(sessionId)
      );
    }, [apiService]),

    // 새 채팅 세션 생성
    createChatSession: useCallback(async (title?: string) => {
      return safeApiCall(() => 
        apiService.chatApi.createChatSession(title)
      );
    }, [apiService]),

    // 채팅 완성 요청
    chatCompletion: useCallback(async (completionRequest: ChatCompletionRequest) => {
      return safeApiCall(() => 
        apiService.chatApi.chatCompletion(completionRequest)
      );
    }, [apiService]),

    // 채팅 세션 삭제
    deleteChatSession: useCallback(async (sessionId: string) => {
      return safeApiCall(() => 
        apiService.chatApi.deleteChatSession(sessionId)
      );
    }, [apiService]),
  };

  return {
    // 인증 상태
    isAuthenticated,
    isAuthChecking,
    user,

    // 인증 관리
    checkAuth,
    onLoginSuccess,
    onLogout,
    registerAuthRedirect,

    // API 클라이언트들 (직접 접근용)
    authApi: apiService.authApi,
    chatApi: apiService.chatApi,

    // 안전한 API 호출 래퍼들
    auth: authActions,
    chat: chatActions,

    // 유틸리티
    callSafely: safeApiCall,
    axios: apiService.getAxiosInstance(),
  };
}

export default useApiService;