import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Spinner } from '@heroui/react';

// Layouts
import RootLayout from '../layouts/RootLayout';
import AppLayout from '../layouts/AppLayout';
import AdminLayout from '../layouts/AdminLayout';
import AuthLayout from '../layouts/AuthLayout';

// Pages - lazy loaded
const AuthPage = lazy(() => import('../pages/AuthPage'));
const SignInPage = lazy(() => import('../pages/auth/SignInPage'));
const SignUpPage = lazy(() => import('../pages/auth/SignUpPage'));
const ChatPage = lazy(() => import('../pages/ChatPage'));
const ChannelPage = lazy(() => import('../pages/ChannelPage'));
const HomePage = lazy(() => import('../pages/HomePage'));
const NotesPage = lazy(() => import('../pages/NotesPage'));
const NoteDetailPage = lazy(() => import('../pages/NoteDetailPage'));
const PlaygroundPage = lazy(() => import('../pages/PlaygroundPage'));
const WorkspacePage = lazy(() => import('../pages/WorkspacePage'));
const AdminUsersPage = lazy(() => import('../pages/admin/UsersPage'));
const AdminEvaluationsPage = lazy(() => import('../pages/admin/EvaluationsPage'));
const AdminFunctionsPage = lazy(() => import('../pages/admin/FunctionsPage'));
const AdminSettingsPage = lazy(() => import('../pages/admin/SettingsPage'));
const ErrorPage = lazy(() => import('../pages/ErrorPage'));
const SharedChatPage = lazy(() => import('../pages/SharedChatPage'));
const AiServerIntegrationPage = lazy(() => import('../pages/AiServerIntegrationPage'));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Spinner size="lg" />
  </div>
);

// Wrapper for lazy loaded components
const LazyPage = ({ Component }: { Component: React.ComponentType }) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <LazyPage Component={ErrorPage} />,
    children: [
      {
        path: 'auth',
        element: <AuthLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/auth/signin" replace />,
          },
          {
            path: 'signin',
            element: <LazyPage Component={SignInPage} />,
          },
          {
            path: 'signup',
            element: <LazyPage Component={SignUpPage} />,
          },
          {
            path: 'legacy',
            element: <LazyPage Component={AuthPage} />,
          },
        ],
      },
      {
        path: 's/:id',
        element: <LazyPage Component={SharedChatPage} />,
      },
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <LazyPage Component={ChatPage} />,
          },
          {
            path: 'c/:id',
            element: <LazyPage Component={ChatPage} />,
          },
          {
            path: 'channels/:id',
            element: <LazyPage Component={ChannelPage} />,
          },
          {
            path: 'home',
            element: <LazyPage Component={HomePage} />,
          },
          {
            path: 'notes',
            children: [
              {
                index: true,
                element: <LazyPage Component={NotesPage} />,
              },
              {
                path: ':id',
                element: <LazyPage Component={NoteDetailPage} />,
              },
            ],
          },
          {
            path: 'playground',
            element: <LazyPage Component={PlaygroundPage} />,
          },
          {
            path: 'workspace/*',
            element: <LazyPage Component={WorkspacePage} />,
          },
          {
            path: 'aiserver',
            element: <LazyPage Component={AiServerIntegrationPage} />,
          },
          {
            path: 'admin',
            element: <AdminLayout />,
            children: [
              {
                index: true,
                element: <Navigate to="/admin/users" replace />,
              },
              {
                path: 'users',
                element: <LazyPage Component={AdminUsersPage} />,
              },
              {
                path: 'evaluations',
                element: <LazyPage Component={AdminEvaluationsPage} />,
              },
              {
                path: 'functions/*',
                element: <LazyPage Component={AdminFunctionsPage} />,
              },
              {
                path: 'settings/*',
                element: <LazyPage Component={AdminSettingsPage} />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

// Route guard hook
export function useRouteGuard() {
  // This will be implemented in the auth system
  return {
    canActivate: (_route: string) => {
      // Check if user has permission to access route
      return true;
    },
  };
}