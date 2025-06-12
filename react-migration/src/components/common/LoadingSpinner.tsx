import React from 'react';
import { Spinner } from '@heroui/react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
  label?: string;
  className?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

/**
 * 로딩 스피너 컴포넌트
 * 다양한 크기와 스타일의 로딩 인디케이터 제공
 */
export function LoadingSpinner({
  size = 'md',
  color = 'primary',
  label = '로딩 중...',
  className = '',
  fullScreen = false,
  overlay = false,
}: LoadingSpinnerProps) {
  const spinnerElement = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Spinner size={size} color={color} />
      {label && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {label}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
        {spinnerElement}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-gray-900/80">
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
}

/**
 * 페이지 전체 로딩 컴포넌트
 */
export function PageLoading({ label = '페이지를 불러오는 중...' }: { label?: string }) {
  return <LoadingSpinner fullScreen label={label} />;
}

/**
 * 컨테이너 오버레이 로딩 컴포넌트
 */
export function OverlayLoading({ label = '처리 중...' }: { label?: string }) {
  return <LoadingSpinner overlay label={label} />;
}

/**
 * 인라인 로딩 컴포넌트 (작은 크기)
 */
export function InlineLoading({ label }: { label?: string }) {
  return <LoadingSpinner size="sm" label={label} className="py-4" />;
}

/**
 * 버튼 로딩 컴포넌트 (버튼 내부용)
 */
export function ButtonLoading() {
  return <Spinner size="sm" color="current" className="text-current" />;
}

/**
 * 스켈레톤 로딩 컴포넌트
 */
export function SkeletonLoading({ 
  lines = 3, 
  className = '' 
}: { 
  lines?: number; 
  className?: string; 
}) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`h-4 rounded bg-gray-200 dark:bg-gray-700 ${
            index === lines - 1 ? 'w-3/4' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
}

/**
 * 채팅 메시지 스켈레톤 로딩
 */
export function ChatMessageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="flex space-x-3">
        <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-1">
            <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-3/5 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 카드 스켈레톤 로딩
 */
export function CardSkeleton({ 
  showAvatar = true, 
  showActions = true 
}: { 
  showAvatar?: boolean; 
  showActions?: boolean; 
}) {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-start space-x-3">
        {showAvatar && (
          <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
        )}
        <div className="flex-1 space-y-3">
          <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-3 w-4/5 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          {showActions && (
            <div className="flex space-x-2">
              <div className="h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-8 w-16 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoadingSpinner;