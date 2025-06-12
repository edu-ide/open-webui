import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

/**
 * 에러 바운더리 컴포넌트
 * React 컴포넌트 트리에서 발생하는 에러를 포착하고 처리
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 에러 정보를 상태에 저장
    this.setState({
      error,
      errorInfo,
    });

    // 에러 리포팅 서비스에 에러를 로그
    console.error('ErrorBoundary가 에러를 포착했습니다:', error, errorInfo);
    
    // 부모 컴포넌트에 에러 알림
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // 개발 모드에서는 에러 정보를 더 자세히 출력
    if (import.meta.env.DEV) {
      console.group('🚨 ErrorBoundary Error Details');
      console.error('Error:', error);
      console.error('Component Stack:', errorInfo.componentStack);
      console.groupEnd();
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 사용자 정의 폴백 UI가 있으면 사용
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 기본 에러 UI 렌더링
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="mx-auto max-w-md px-6 py-12">
            <div className="text-center">
              <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-500" />
              <h1 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
                앱에서 오류가 발생했습니다
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                예상치 못한 문제가 발생했습니다. 문제가 지속되면 새로고침을 시도해 주세요.
              </p>
              
              {/* 개발 모드에서만 에러 세부사항 표시 */}
              {import.meta.env.DEV && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                    에러 세부사항 보기
                  </summary>
                  <div className="mt-2 rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                    <p className="text-xs font-mono text-red-800 dark:text-red-300">
                      {this.state.error.toString()}
                    </p>
                    {this.state.errorInfo && (
                      <pre className="mt-2 max-h-40 overflow-auto text-xs font-mono text-red-700 dark:text-red-400">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  color="primary"
                  variant="solid"
                  onClick={this.handleRetry}
                  className="w-full sm:w-auto"
                >
                  다시 시도
                </Button>
                <Button
                  color="default"
                  variant="bordered"
                  onClick={this.handleReload}
                  className="w-full sm:w-auto"
                >
                  페이지 새로고침
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 함수형 컴포넌트를 위한 간단한 에러 바운더리 HOC
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

export default ErrorBoundary;