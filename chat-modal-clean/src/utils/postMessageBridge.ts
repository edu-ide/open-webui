// PostMessage 통신을 위한 타입 정의
export interface MessageTypes {
  // Host -> WebComponent 메시지
  'host:theme': { theme: 'light' | 'dark' };
  'host:auth': { userId: string; sessionToken: string; user: any };
  'host:navigation': { route: string; params?: Record<string, string> };
  'host:config': { apiUrl: string; websocketUrl: string };
  
  // WebComponent -> Host 메시지  
  'openwebui:ready': { chatId?: string; theme: string };
  'openwebui:navigation': { route: string; title?: string };
  'openwebui:chat-created': { chatId: string; title: string };
  'openwebui:chat-message': { chatId: string; message: any };
  'openwebui:error': { error: string; details?: any };
  'openwebui:resize': { height: number };
}

export type MessageType = keyof MessageTypes;
export type MessageData<T extends MessageType> = MessageTypes[T];

// 메시지 송신자 클래스
export class PostMessageBridge {
  private origin: string;
  private target: Window;
  private listeners: Map<string, Function[]> = new Map();

  constructor(target: Window = window.parent, origin: string = '*') {
    this.target = target;
    this.origin = origin;
    this.setupListener();
  }

  private setupListener() {
    window.addEventListener('message', (event) => {
      if (this.origin !== '*' && event.origin !== this.origin) {
        return;
      }

      const { type, data } = event.data;
      if (!type) return;

      const handlers = this.listeners.get(type);
      if (handlers) {
        handlers.forEach(handler => handler(data, event));
      }
    });
  }

  // 메시지 전송
  send<T extends MessageType>(type: T, data: MessageData<T>, _source?: string) {
    this.target.postMessage({
      type,
      data,
      source: _source || 'open-webui-chat',
      timestamp: Date.now()
    }, this.origin);
  }

  // 메시지 수신 리스너 등록
  on<T extends MessageType>(
    type: T, 
    handler: (data: MessageData<T>, event: MessageEvent) => void
  ) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);
  }

  // 리스너 제거
  off<T extends MessageType>(
    type: T, 
    handler: (data: MessageData<T>, event: MessageEvent) => void
  ) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // 모든 리스너 제거
  destroy() {
    this.listeners.clear();
  }
}

// React Hook으로 사용하기 위한 헬퍼
import React from 'react';

export const usePostMessageBridge = (target?: Window, origin?: string) => {
  const [bridge] = React.useState(() => new PostMessageBridge(target, origin));
  
  React.useEffect(() => {
    return () => bridge.destroy();
  }, [bridge]);

  return bridge;
};

// 전역 브리지 인스턴스 (싱글톤)
export const globalBridge = new PostMessageBridge();

// 테마 동기화 헬퍼
export const syncTheme = (_bridge: PostMessageBridge, theme: 'light' | 'dark') => {
  // CSS 변수 업데이트
  document.documentElement.style.setProperty('--theme-mode', theme);
  document.documentElement.setAttribute('data-theme', theme);
  
  // 부모에게 테마 변경 알림 (타입 추가 필요)
  // bridge.send('openwebui:theme-changed', { theme });
};

// 에러 리포팅 헬퍼
export const reportError = (bridge: PostMessageBridge, error: Error, context?: string) => {
  bridge.send('openwebui:error', {
    error: error.message,
    details: {
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    }
  });
};