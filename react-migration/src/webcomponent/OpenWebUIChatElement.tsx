import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import ChatPage from '../pages/ChatPage';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { globalBridge } from '../utils/postMessageBridge';
import '../index.css';

interface OpenWebUIChatProps {
  theme?: 'light' | 'dark';
  userId?: string;
  sessionToken?: string;
  chatId?: string;
}


// 인증 초기화 컴포넌트
const AuthInitializer: React.FC<OpenWebUIChatProps> = ({ userId, sessionToken }) => {
  const { setTokenAndUser } = useAuth();

  useEffect(() => {
    if (userId && sessionToken) {
      console.log('[WebComponent] Initializing auth with attributes:', { userId });
      
      // 웹 컴포넌트 속성에서 받은 인증 정보로 초기화
      const user = {
        id: userId,
        email: '',
        name: 'WebComponent User',
        role: 'user' as const,
      };
      
      setTokenAndUser(sessionToken, user);
    }
  }, [userId, sessionToken, setTokenAndUser]);

  return null;
};

const OpenWebUIChatComponent: React.FC<OpenWebUIChatProps> = ({
  theme = 'light',
  userId,
  sessionToken,
  chatId
}) => {
  const [currentTheme, setCurrentTheme] = useState(theme);

  // 테마 변경 리스너
  useEffect(() => {
    setCurrentTheme(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 초기 준비 완료 알림
  useEffect(() => {
    globalBridge.send('openwebui:ready', { 
      chatId, 
      theme: currentTheme 
    });
  }, [chatId, currentTheme]);

  return (
    <HeroUIProvider>
      <AuthProvider>
        <AuthInitializer userId={userId} sessionToken={sessionToken} />
        <div 
          className={`open-webui-chat-wrapper ${currentTheme}`}
          style={{ 
            width: '100%', 
            height: '100%',
            colorScheme: currentTheme 
          }}
        >
          <ChatPage />
        </div>
      </AuthProvider>
    </HeroUIProvider>
  );
};

// Web Component 정의
class OpenWebUIChatElement extends HTMLElement {
  private root: any;
  private observer?: MutationObserver;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['theme', 'user-id', 'session-token', 'chat-id'];
  }

  connectedCallback() {
    this.render();
    this.setupAttributeObserver();
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount();
    }
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  attributeChangedCallback() {
    if (this.root) {
      this.render();
    }
  }

  private setupAttributeObserver() {
    this.observer = new MutationObserver(() => {
      this.render();
    });
    
    this.observer.observe(this, {
      attributes: true,
      attributeFilter: ['theme', 'user-id', 'session-token', 'chat-id']
    });
  }

  private render() {
    if (!this.shadowRoot) return;

    // CSS 스타일 격리를 위한 스타일 시트
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        contain: layout style paint;
      }
      
      .open-webui-chat-wrapper {
        width: 100%;
        height: 100%;
        font-family: system-ui, -apple-system, sans-serif;
      }
      
      /* HeroUI 및 Tailwind 스타일이 여기에 주입됩니다 */
    `);
    
    this.shadowRoot.adoptedStyleSheets = [styleSheet];

    // React 컴포넌트 렌더링
    if (!this.root) {
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      this.shadowRoot.appendChild(container);
      this.root = createRoot(container);
    }

    const props: OpenWebUIChatProps = {
      theme: this.getAttribute('theme') as 'light' | 'dark' || 'light',
      userId: this.getAttribute('user-id') || undefined,
      sessionToken: this.getAttribute('session-token') || undefined,
      chatId: this.getAttribute('chat-id') || undefined,
    };

    this.root.render(<OpenWebUIChatComponent {...props} />);
  }
}

export default OpenWebUIChatElement;