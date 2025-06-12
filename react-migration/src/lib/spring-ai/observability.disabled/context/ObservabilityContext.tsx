/**
 * Observability Context
 * 
 * Observability 상태를 전역적으로 관리하는 React Context입니다.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useObservability, UseObservabilityOptions, UseObservabilityReturn } from '../hooks/useObservability';

/**
 * Observability Context 타입
 */
export type ObservabilityContextType = UseObservabilityReturn;

/**
 * Observability Context
 */
const ObservabilityContext = createContext<ObservabilityContextType | null>(null);

/**
 * Observability Provider props
 */
export interface ObservabilityProviderProps {
  children: ReactNode;
  options?: UseObservabilityOptions;
}

/**
 * Observability Provider 컴포넌트
 */
export const ObservabilityProvider: React.FC<ObservabilityProviderProps> = ({
  children,
  options = {},
}) => {
  const observabilityContext = useObservability(options);

  return (
    <ObservabilityContext.Provider value={observabilityContext}>
      {children}
    </ObservabilityContext.Provider>
  );
};

/**
 * Observability Context Hook
 */
export function useObservabilityContext(): ObservabilityContextType {
  const context = useContext(ObservabilityContext);
  
  if (!context) {
    throw new Error('useObservabilityContext must be used within an ObservabilityProvider');
  }
  
  return context;
}

/**
 * Observability Context Hook (Optional)
 * Provider 없이도 사용 가능한 버전
 */
export function useObservabilityContextOptional(): ObservabilityContextType | null {
  return useContext(ObservabilityContext);
}