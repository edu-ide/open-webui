import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { HeroUIProvider } from '@heroui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ChatProvider } from '../contexts/ChatContext';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function RootLayout() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Theme management
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider>
        <AuthProvider>
          <ChatProvider>
            <div className="min-h-screen bg-background text-foreground">
              <AuthGuard>
                <Outlet context={{ theme, toggleTheme }} />
              </AuthGuard>
            </div>
          </ChatProvider>
        </AuthProvider>
      </HeroUIProvider>
    </QueryClientProvider>
  );
}

// Auth guard component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, setTokenAndUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 개발 환경에서 자동 로그인 (데모용)
    const isDevelopment = import.meta.env.DEV;
    
    if (!isLoading && !isAuthenticated && isDevelopment) {
      // 개발용 더미 사용자 생성
      const demoUser = {
        id: 'demo-user-1',
        email: 'demo@example.com',
        name: 'Demo User',
        username: 'demo',
        role: 'user' as const,
        profile_image_url: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
      };
      
      const demoToken = 'demo-token-' + Date.now();
      
      console.log('[AuthGuard] 개발 환경: 자동 로그인 설정');
      setTokenAndUser(demoToken, demoUser);
      return;
    }

    // Public routes that don't require authentication
    const publicRoutes = ['/auth', '/s/', '/error'];
    const isPublicRoute = publicRoutes.some(route => location.pathname.startsWith(route));

    if (!isLoading && !isAuthenticated && !isPublicRoute && !isDevelopment) {
      // Save the attempted URL for redirecting after login
      const returnUrl = location.pathname + location.search;
      navigate(`/auth?returnUrl=${encodeURIComponent(returnUrl)}`, { replace: true });
    }
  }, [isAuthenticated, isLoading, location, navigate, setTokenAndUser]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
}