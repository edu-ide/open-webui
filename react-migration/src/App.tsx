import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HeroUIProvider } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PageLoading } from './components/common/LoadingSpinner';
import Sidebar from './components/layout/Sidebar';
import ChatPage from './pages/ChatPage';
import AuthPage from './pages/AuthPage';
import { McpMarketplace } from './components/marketplace';
import { useResponsive } from './hooks/useResponsive';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { useMcpServers } from './hooks/useMcp';
import { McpServerConfig } from './types/mcp';
import React from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5분
      retry: (failureCount, error: any) => {
        // 인증 에러는 재시도하지 않음
        if (error?.response?.status === 401 || error?.response?.status === 403) {
          return false;
        }
        // 최대 3회 재시도
        return failureCount < 3;
      },
      refetchOnWindowFocus: false, // 윈도우 포커스 시 자동 refetch 비활성화
    },
    mutations: {
      retry: false, // 뮤테이션은 재시도하지 않음
    },
  },
});

// MCP 초기화 컴포넌트
function McpInitializer() {
  const { servers, addServer } = useMcpServers();

  React.useEffect(() => {
    // 앱 시작시 기본 MCP 서버가 없으면 추가
    const hasDefaultServer = servers.some(server => 
      server.config.name === 'shrimp-task-manager-spring'
    );
    
    if (!hasDefaultServer && servers.length === 0) {
      const defaultServer: McpServerConfig = {
        id: 'shrimp-task-manager-default',
        name: 'shrimp-task-manager-spring',
        transport: 'sse',
        endpoint: 'https://mcp-shrimp.ugot.uk/sse',
        auth: { type: 'none' },
        options: {}
      };
      
      console.log('Initializing default MCP server:', defaultServer);
      addServer(defaultServer).catch(console.error);
    }
  }, [servers, addServer]);

  return null; // 렌더링할 UI 없음
}

function AppLayout() {
  const { isMobile, showSidebar, toggleSidebar } = useResponsive();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 사이드바 */}
      <Sidebar />
      
      {/* 메인 콘텐츠 */}
      <div className="flex flex-1 flex-col h-full min-h-0">
        {/* 상단 바 (모바일에서만 표시) */}
        {isMobile && !showSidebar && (
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 flex-shrink-0">
            <button
              onClick={toggleSidebar}
              className="flex items-center justify-center rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Bars3Icon className="size-5" />
            </button>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Open WebUI
            </div>
            <div className="w-9" /> {/* Spacer for centering */}
          </div>
        )}
        
        {/* 페이지 콘텐츠 */}
        <div className="flex-1 min-h-0">
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/" element={<ChatPage />} />
            <Route path="/c/:id" element={<ChatPage />} />
            <Route path="/marketplace" element={<McpMarketplace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

// React Fast Refresh를 위한 명명된 함수
export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HeroUIProvider>
          <Router>
            <ErrorBoundary fallback={<PageLoading label="인증 정보를 확인하는 중..." />}>
              <AuthProvider>
                <ErrorBoundary fallback={<PageLoading label="채팅 서비스를 초기화하는 중..." />}>
                  <ChatProvider>
                    <McpInitializer />
                    <div className="h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
                      <AppLayout />
                    </div>
                  </ChatProvider>
                </ErrorBoundary>
              </AuthProvider>
            </ErrorBoundary>
          </Router>
        </HeroUIProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// 기본 내보내기도 유지
export default App;
