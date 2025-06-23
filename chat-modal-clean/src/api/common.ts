/* tslint:disable */
/* eslint-disable */
/**
 * React Migration API Common
 * 공통 타입과 유틸리티 함수들
 *
 * @version 1.0.0
 */

import type { AxiosResponse } from 'axios';

/**
 * 기본 API 응답 인터페이스
 */
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
  timestamp: string;
}

/**
 * 페이징 응답 인터페이스
 */
export interface PagedResponse<T> extends ApiResponse<T[]> {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

/**
 * 에러 응답 인터페이스
 */
export interface ErrorResponse {
  error: string;
  message: string;
  path: string;
  status: number;
  timestamp: string;
}

/**
 * 사용자 정보 인터페이스
 */
export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  role: 'ADMIN' | 'USER';
  createdAt: string;
  updatedAt: string;
}

/**
 * 채팅 메시지 인터페이스
 */
export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * 채팅 세션 인터페이스
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  userId: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

/**
 * 모델 정보 인터페이스
 */
export interface Model {
  id: string;
  name: string;
  owned_by: string;
  created: number;
  context_length?: number;
  capabilities?: string[];
}

/**
 * 채팅 완성 요청 인터페이스
 */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
  user?: string;
}

/**
 * 채팅 완성 응답 인터페이스
 */
export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 인증 토큰 인터페이스
 */
export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * 로그인 요청 인터페이스
 */
export interface LoginRequest {
  username: string;
  password: string;
  remember_me?: boolean;
}

/**
 * 회원가입 요청 인터페이스
 */
export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  name?: string;
}

/**
 * 응답을 ApiResponse 형태로 래핑하는 함수
 */
export function wrapResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
  return {
    data: response.data,
    success: response.status >= 200 && response.status < 300,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 에러를 ErrorResponse 형태로 변환하는 함수
 */
export function createErrorResponse(error: any, path: string = ''): ErrorResponse {
  return {
    error: error.name || 'Unknown Error',
    message: error.message || 'An unknown error occurred',
    path,
    status: error.response?.status || 500,
    timestamp: new Date().toISOString(),
  };
}