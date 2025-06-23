# MCP Client & DCR OAuth2 구현 방법론 가이드

## 📋 개요

현재 AI 채팅 시스템에 **MCP (Model Context Protocol) Client**와 **DCR (Dynamic Client Registration) OAuth2** 기능을 추가하는 포괄적인 구현 가이드입니다.

---

## 🔌 1. MCP (Model Context Protocol) Client 구현

### 1.1 MCP란?

**Model Context Protocol**은 AI 모델 간의 컨텍스트 공유와 고급 상호작용을 위한 프로토콜입니다.

#### 주요 기능:
- 📝 **컨텍스트 관리**: 대화 컨텍스트의 영속적 저장 및 공유
- 🔧 **도구 호출**: AI가 외부 도구/API를 호출할 수 있는 기능
- 🔄 **워크플로우**: 복합적인 AI 작업 체인 관리
- 📊 **메타데이터**: 모델 성능 및 사용량 추적

### 1.2 MCP Client 아키텍처

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   MCP Client    │    │   AI Server     │
│   (Svelte)      │◄──►│   (TypeScript)  │◄──►│   (ai.ugot.uk)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Store      │    │   MCP Store     │    │   Context DB    │
│   Management    │    │   Management    │    │   (Redis/Mem)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1.3 구현 단계

#### 단계 1: MCP 타입 정의

```typescript
// src/lib/types/mcp.ts
export interface MCPMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPContext {
  id: string;
  conversation_id: string;
  content: any;
  metadata: {
    timestamp: number;
    model: string;
    tokens_used: number;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: any;
  handler: (params: any) => Promise<any>;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}
```

#### 단계 2: MCP Client 구현

```typescript
// src/lib/services/mcpClient.ts
import { v4 as uuidv4 } from 'uuid';
import type { MCPMessage, MCPContext, MCPTool } from '$lib/types/mcp';

export class MCPClient {
  private websocket: WebSocket | null = null;
  private tools: Map<string, MCPTool> = new Map();
  private contexts: Map<string, MCPContext> = new Map();
  private pendingRequests: Map<string, (response: MCPMessage) => void> = new Map();

  constructor(private serverUrl: string, private token: string) {}

  // WebSocket 연결 설정
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.websocket = new WebSocket(`${this.serverUrl}/mcp`, ['mcp-v1']);
      
      this.websocket.onopen = () => {
        this.authenticate();
        resolve();
      };

      this.websocket.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.websocket.onerror = (error) => reject(error);
    });
  }

  // 인증 메시지 전송
  private authenticate(): void {
    const authMessage: MCPMessage = {
      id: uuidv4(),
      type: 'request',
      method: 'auth',
      params: { token: this.token }
    };
    this.send(authMessage);
  }

  // 메시지 처리
  private handleMessage(message: MCPMessage): void {
    if (message.type === 'response' && this.pendingRequests.has(message.id)) {
      const resolver = this.pendingRequests.get(message.id)!;
      resolver(message);
      this.pendingRequests.delete(message.id);
    } else if (message.type === 'request') {
      this.handleRequest(message);
    }
  }

  // 요청 처리
  private async handleRequest(message: MCPMessage): Promise<void> {
    switch (message.method) {
      case 'tool_call':
        await this.handleToolCall(message);
        break;
      case 'context_update':
        await this.handleContextUpdate(message);
        break;
    }
  }

  // 도구 호출 처리
  private async handleToolCall(message: MCPMessage): Promise<void> {
    const { tool_name, parameters } = message.params;
    const tool = this.tools.get(tool_name);
    
    if (tool) {
      try {
        const result = await tool.handler(parameters);
        this.send({
          id: message.id,
          type: 'response',
          result
        });
      } catch (error) {
        this.send({
          id: message.id,
          type: 'response',
          error: {
            code: -1,
            message: error.message
          }
        });
      }
    }
  }

  // 컨텍스트 업데이트 처리
  private async handleContextUpdate(message: MCPMessage): Promise<void> {
    const context: MCPContext = message.params;
    this.contexts.set(context.id, context);
    
    // 컨텍스트 스토어 업데이트
    this.updateContextStore(context);
  }

  // 도구 등록
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  // 컨텍스트 전송
  async sendContext(conversationId: string, content: any): Promise<void> {
    const context: MCPContext = {
      id: uuidv4(),
      conversation_id: conversationId,
      content,
      metadata: {
        timestamp: Date.now(),
        model: 'current_model',
        tokens_used: 0
      }
    };

    const message: MCPMessage = {
      id: uuidv4(),
      type: 'request',
      method: 'context_store',
      params: context
    };

    await this.sendAndWait(message);
    this.contexts.set(context.id, context);
  }

  // 메시지 전송 및 응답 대기
  private async sendAndWait(message: MCPMessage): Promise<MCPMessage> {
    return new Promise((resolve) => {
      this.pendingRequests.set(message.id, resolve);
      this.send(message);
    });
  }

  // 메시지 전송
  private send(message: MCPMessage): void {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify(message));
    }
  }

  // 컨텍스트 스토어 업데이트
  private updateContextStore(context: MCPContext): void {
    // Svelte 스토어 업데이트 로직
  }
}
```

#### 단계 3: MCP 도구 구현

```typescript
// src/lib/services/mcpTools.ts
import type { MCPTool } from '$lib/types/mcp';

// 웹 검색 도구
export const webSearchTool: MCPTool = {
  name: 'web_search',
  description: '웹에서 정보를 검색합니다',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '검색 쿼리' },
      count: { type: 'number', description: '결과 개수', default: 5 }
    },
    required: ['query']
  },
  handler: async (params) => {
    const response = await fetch(`/api/search?q=${params.query}&count=${params.count}`);
    return await response.json();
  }
};

// 파일 읽기 도구
export const fileReadTool: MCPTool = {
  name: 'file_read',
  description: '파일을 읽습니다',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '파일 경로' }
    },
    required: ['path']
  },
  handler: async (params) => {
    const response = await fetch(`/api/files/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: params.path })
    });
    return await response.json();
  }
};

// 계산 도구
export const calculatorTool: MCPTool = {
  name: 'calculator',
  description: '수학 계산을 수행합니다',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: '수학 표현식' }
    },
    required: ['expression']
  },
  handler: async (params) => {
    try {
      // 안전한 수학 표현식 평가
      const result = eval(params.expression.replace(/[^0-9+\-*/().\s]/g, ''));
      return { result, expression: params.expression };
    } catch (error) {
      throw new Error(`계산 오류: ${error.message}`);
    }
  }
};
```

#### 단계 4: MCP 스토어 관리

```typescript
// src/lib/stores/mcp.ts
import { writable, type Writable } from 'svelte/store';
import type { MCPContext, MCPTool } from '$lib/types/mcp';

// MCP 연결 상태
export const mcpConnected = writable(false);

// MCP 컨텍스트 관리
export const mcpContexts: Writable<Map<string, MCPContext>> = writable(new Map());

// 등록된 도구들
export const mcpTools: Writable<Map<string, MCPTool>> = writable(new Map());

// MCP 오류 상태
export const mcpError: Writable<string | null> = writable(null);

// MCP 헬퍼 함수들
export const mcpHelpers = {
  addContext: (context: MCPContext) => {
    mcpContexts.update(contexts => {
      contexts.set(context.id, context);
      return contexts;
    });
  },

  removeContext: (contextId: string) => {
    mcpContexts.update(contexts => {
      contexts.delete(contextId);
      return contexts;
    });
  },

  addTool: (tool: MCPTool) => {
    mcpTools.update(tools => {
      tools.set(tool.name, tool);
      return tools;
    });
  },

  setError: (error: string | null) => {
    mcpError.set(error);
  }
};
```

---

## 🔐 2. DCR (Dynamic Client Registration) OAuth2 구현

### 2.1 DCR OAuth2란?

**Dynamic Client Registration**은 클라이언트가 런타임에 OAuth2 인증 서버에 동적으로 등록되는 OAuth2 확장 기능입니다.

#### 주요 특징:
- 🔄 **동적 등록**: 클라이언트 ID/Secret 동적 생성
- 🔒 **향상된 보안**: 클라이언트별 고유 자격 증명
- 📱 **멀티 클라이언트**: 여러 클라이언트 인스턴스 지원
- ⏰ **토큰 갱신**: 자동 액세스 토큰 갱신

### 2.2 DCR OAuth2 플로우

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client    │    │  Auth Server    │    │  Resource       │
│   App       │    │  (DCR Endpoint) │    │  Server         │
└─────────────┘    └─────────────────┘    └─────────────────┘
       │                     │                     │
       │ 1. Registration     │                     │
       │────────────────────►│                     │
       │                     │                     │
       │ 2. Client Creds     │                     │
       │◄────────────────────│                     │
       │                     │                     │
       │ 3. Authorization    │                     │
       │────────────────────►│                     │
       │                     │                     │
       │ 4. Access Token     │                     │
       │◄────────────────────│                     │
       │                     │                     │
       │ 5. API Request      │                     │
       │─────────────────────────────────────────►│
       │                     │                     │
       │ 6. Protected Resource                     │
       │◄─────────────────────────────────────────│
```

### 2.3 구현 단계

#### 단계 1: DCR OAuth2 타입 정의

```typescript
// src/lib/types/oauth2.ts
export interface ClientRegistrationRequest {
  client_name: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  software_id?: string;
  software_version?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  registration_access_token?: string;
  registration_client_uri?: string;
  grant_types: string[];
  response_types: string[];
  redirect_uris: string[];
  scope?: string;
}

export interface TokenRequest {
  grant_type: string;
  client_id: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  refresh_token?: string;
  username?: string;
  password?: string;
  scope?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
}
```

#### 단계 2: DCR OAuth2 클라이언트 구현

```typescript
// src/lib/services/dcrOAuth2Client.ts
import type { 
  ClientRegistrationRequest, 
  ClientRegistrationResponse, 
  TokenRequest, 
  TokenResponse,
  OAuthError
} from '$lib/types/oauth2';

export class DCROAuth2Client {
  private clientRegistration: ClientRegistrationResponse | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;

  constructor(
    private authServerUrl: string,
    private clientName: string,
    private redirectUri: string
  ) {}

  // 1. 클라이언트 동적 등록
  async registerClient(): Promise<ClientRegistrationResponse> {
    const registrationRequest: ClientRegistrationRequest = {
      client_name: this.clientName,
      client_uri: window.location.origin,
      redirect_uris: [this.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read write',
      token_endpoint_auth_method: 'client_secret_basic'
    };

    const response = await fetch(`${this.authServerUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(registrationRequest)
    });

    if (!response.ok) {
      const error: OAuthError = await response.json();
      throw new Error(`Client registration failed: ${error.error_description || error.error}`);
    }

    this.clientRegistration = await response.json();
    this.saveClientRegistration();
    return this.clientRegistration;
  }

  // 2. 인증 URL 생성
  getAuthorizationUrl(state?: string, scope?: string): string {
    if (!this.clientRegistration) {
      throw new Error('Client not registered');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientRegistration.client_id,
      redirect_uri: this.redirectUri,
      scope: scope || 'read write',
      state: state || this.generateState()
    });

    return `${this.authServerUrl}/authorize?${params.toString()}`;
  }

  // 3. 인증 코드로 토큰 교환
  async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    if (!this.clientRegistration) {
      throw new Error('Client not registered');
    }

    const tokenRequest: TokenRequest = {
      grant_type: 'authorization_code',
      client_id: this.clientRegistration.client_id,
      client_secret: this.clientRegistration.client_secret,
      code,
      redirect_uri: this.redirectUri
    };

    const response = await fetch(`${this.authServerUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(tokenRequest as any)
    });

    if (!response.ok) {
      const error: OAuthError = await response.json();
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    const tokenResponse: TokenResponse = await response.json();
    this.storeTokens(tokenResponse);
    return tokenResponse;
  }

  // 4. 토큰 갱신
  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.refreshToken || !this.clientRegistration) {
      throw new Error('No refresh token available');
    }

    const tokenRequest: TokenRequest = {
      grant_type: 'refresh_token',
      client_id: this.clientRegistration.client_id,
      client_secret: this.clientRegistration.client_secret,
      refresh_token: this.refreshToken
    };

    const response = await fetch(`${this.authServerUrl}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(tokenRequest as any)
    });

    if (!response.ok) {
      const error: OAuthError = await response.json();
      throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
    }

    const tokenResponse: TokenResponse = await response.json();
    this.storeTokens(tokenResponse);
    return tokenResponse;
  }

  // 5. 유효한 액세스 토큰 얻기
  async getValidAccessToken(): Promise<string> {
    // 토큰이 없거나 만료된 경우
    if (!this.accessToken || this.isTokenExpired()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('No valid token available. Re-authentication required.');
      }
    }

    return this.accessToken!;
  }

  // 6. 인증된 API 요청
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getValidAccessToken();
    
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    return fetch(url, { ...options, headers });
  }

  // 토큰 저장
  private storeTokens(tokenResponse: TokenResponse): void {
    this.accessToken = tokenResponse.access_token;
    this.refreshToken = tokenResponse.refresh_token || this.refreshToken;
    this.tokenExpiry = tokenResponse.expires_in 
      ? Date.now() + (tokenResponse.expires_in * 1000)
      : null;

    // 로컬 스토리지에 저장
    localStorage.setItem('oauth2_tokens', JSON.stringify({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      expires_at: this.tokenExpiry
    }));
  }

  // 토큰 만료 확인
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return false;
    return Date.now() > (this.tokenExpiry - 60000); // 1분 여유
  }

  // 클라이언트 등록 정보 저장
  private saveClientRegistration(): void {
    if (this.clientRegistration) {
      localStorage.setItem('oauth2_client', JSON.stringify(this.clientRegistration));
    }
  }

  // 클라이언트 등록 정보 로드
  loadClientRegistration(): boolean {
    const stored = localStorage.getItem('oauth2_client');
    if (stored) {
      this.clientRegistration = JSON.parse(stored);
      return true;
    }
    return false;
  }

  // 토큰 로드
  loadTokens(): boolean {
    const stored = localStorage.getItem('oauth2_tokens');
    if (stored) {
      const tokens = JSON.parse(stored);
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;
      this.tokenExpiry = tokens.expires_at;
      return true;
    }
    return false;
  }

  // State 생성 (CSRF 보호)
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // 로그아웃
  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    localStorage.removeItem('oauth2_tokens');
  }

  // 클라이언트 등록 해제
  async unregisterClient(): Promise<void> {
    if (this.clientRegistration?.registration_access_token && 
        this.clientRegistration?.registration_client_uri) {
      
      await fetch(this.clientRegistration.registration_client_uri, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.clientRegistration.registration_access_token}`
        }
      });
    }

    this.clientRegistration = null;
    localStorage.removeItem('oauth2_client');
  }
}
```

#### 단계 3: OAuth2 스토어 관리

```typescript
// src/lib/stores/oauth2.ts
import { writable, type Writable } from 'svelte/store';
import type { ClientRegistrationResponse, TokenResponse } from '$lib/types/oauth2';

// OAuth2 인증 상태
export const oauth2Authenticated = writable(false);

// 클라이언트 등록 정보
export const oauth2Client: Writable<ClientRegistrationResponse | null> = writable(null);

// 토큰 정보
export const oauth2Tokens: Writable<TokenResponse | null> = writable(null);

// OAuth2 오류
export const oauth2Error: Writable<string | null> = writable(null);

// OAuth2 로딩 상태
export const oauth2Loading = writable(false);

// OAuth2 헬퍼 함수들
export const oauth2Helpers = {
  setAuthenticated: (authenticated: boolean) => {
    oauth2Authenticated.set(authenticated);
  },

  setClient: (client: ClientRegistrationResponse | null) => {
    oauth2Client.set(client);
  },

  setTokens: (tokens: TokenResponse | null) => {
    oauth2Tokens.set(tokens);
  },

  setError: (error: string | null) => {
    oauth2Error.set(error);
  },

  setLoading: (loading: boolean) => {
    oauth2Loading.set(loading);
  },

  clearAll: () => {
    oauth2Authenticated.set(false);
    oauth2Client.set(null);
    oauth2Tokens.set(null);
    oauth2Error.set(null);
    oauth2Loading.set(false);
  }
};
```

#### 단계 4: 통합 인증 서비스

```typescript
// src/lib/services/authService.ts
import { DCROAuth2Client } from './dcrOAuth2Client';
import { oauth2Helpers } from '$lib/stores/oauth2';

export class AuthService {
  private oauthClient: DCROAuth2Client;

  constructor() {
    this.oauthClient = new DCROAuth2Client(
      'https://auth.ugot.uk', // 인증 서버 URL
      'AI Chat Client',       // 클라이언트 이름
      `${window.location.origin}/auth/callback` // 리다이렉트 URI
    );
  }

  // 초기화
  async initialize(): Promise<boolean> {
    try {
      oauth2Helpers.setLoading(true);

      // 저장된 클라이언트 등록 정보 로드
      const hasClient = this.oauthClient.loadClientRegistration();
      
      if (!hasClient) {
        // 클라이언트 등록
        const registration = await this.oauthClient.registerClient();
        oauth2Helpers.setClient(registration);
      }

      // 저장된 토큰 로드
      const hasTokens = this.oauthClient.loadTokens();
      
      if (hasTokens) {
        try {
          // 토큰 유효성 확인
          await this.oauthClient.getValidAccessToken();
          oauth2Helpers.setAuthenticated(true);
          return true;
        } catch (error) {
          // 토큰이 유효하지 않음, 재인증 필요
          console.warn('Invalid tokens, re-authentication required');
        }
      }

      return false;
    } catch (error) {
      oauth2Helpers.setError(`Initialization failed: ${error.message}`);
      return false;
    } finally {
      oauth2Helpers.setLoading(false);
    }
  }

  // 로그인 시작
  startLogin(): void {
    try {
      const authUrl = this.oauthClient.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      oauth2Helpers.setError(`Login failed: ${error.message}`);
    }
  }

  // 인증 콜백 처리
  async handleCallback(code: string): Promise<boolean> {
    try {
      oauth2Helpers.setLoading(true);
      
      const tokens = await this.oauthClient.exchangeCodeForTokens(code);
      oauth2Helpers.setTokens(tokens);
      oauth2Helpers.setAuthenticated(true);
      
      return true;
    } catch (error) {
      oauth2Helpers.setError(`Callback handling failed: ${error.message}`);
      return false;
    } finally {
      oauth2Helpers.setLoading(false);
    }
  }

  // 인증된 요청
  async makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response> {
    return this.oauthClient.makeAuthenticatedRequest(url, options);
  }

  // 로그아웃
  async logout(): Promise<void> {
    try {
      this.oauthClient.logout();
      oauth2Helpers.clearAll();
    } catch (error) {
      oauth2Helpers.setError(`Logout failed: ${error.message}`);
    }
  }

  // 클라이언트 등록 해제
  async unregister(): Promise<void> {
    try {
      await this.oauthClient.unregisterClient();
      oauth2Helpers.clearAll();
    } catch (error) {
      oauth2Helpers.setError(`Unregistration failed: ${error.message}`);
    }
  }
}
```

---

## 🔧 3. 통합 구현 방안

### 3.1 기존 AI Chat Service 업그레이드

```typescript
// src/lib/services/enhancedAIChatService.ts
import { AIChatService } from './aiChatService';
import { MCPClient } from './mcpClient';
import { AuthService } from './authService';
import { webSearchTool, fileReadTool, calculatorTool } from './mcpTools';

export class EnhancedAIChatService extends AIChatService {
  private mcpClient: MCPClient;
  private authService: AuthService;

  constructor() {
    super(''); // 토큰은 authService에서 관리
    this.authService = new AuthService();
    this.mcpClient = new MCPClient('wss://ai.ugot.uk', '');
  }

  // 초기화
  async initialize(): Promise<void> {
    // OAuth2 인증 초기화
    const isAuthenticated = await this.authService.initialize();
    
    if (!isAuthenticated) {
      throw new Error('Authentication required');
    }

    // MCP 클라이언트 연결
    await this.mcpClient.connect();

    // 도구 등록
    this.mcpClient.registerTool(webSearchTool);
    this.mcpClient.registerTool(fileReadTool);
    this.mcpClient.registerTool(calculatorTool);
  }

  // 향상된 메시지 전송 (MCP 컨텍스트 포함)
  async sendEnhancedMessage(
    conversationId: string,
    message: string,
    provider: 'openai' | 'ollama' = 'openai',
    includeContext: boolean = true
  ): Promise<ChatMessage> {
    // MCP 컨텍스트 전송
    if (includeContext) {
      await this.mcpClient.sendContext(conversationId, {
        message,
        timestamp: Date.now(),
        user_context: await this.getUserContext()
      });
    }

    // 인증된 요청으로 메시지 전송
    const request = {
      message,
      provider,
      conversation_id: conversationId,
      mcp_enabled: true
    };

    const response = await this.authService.makeAuthenticatedRequest(
      'https://ai.ugot.uk/api/v2/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      }
    );

    const result = await response.json();
    
    return this.addAssistantMessage(
      conversationId,
      result.response,
      result.model,
      result.provider,
      result.usage
    );
  }

  // 사용자 컨텍스트 수집
  private async getUserContext(): Promise<any> {
    return {
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      page_url: window.location.href,
      // 추가 컨텍스트 정보
    };
  }
}
```

### 3.2 UI 컴포넌트 업데이트

```typescript
// src/lib/components/auth/OAuth2LoginButton.svelte
<script lang="ts">
  import { oauth2Authenticated, oauth2Loading, oauth2Error } from '$lib/stores/oauth2';
  import { AuthService } from '$lib/services/authService';

  const authService = new AuthService();

  async function handleLogin() {
    const isInitialized = await authService.initialize();
    if (!isInitialized) {
      authService.startLogin();
    }
  }

  async function handleLogout() {
    await authService.logout();
  }
</script>

{#if $oauth2Loading}
  <button class="btn btn-loading" disabled>
    Authenticating...
  </button>
{:else if $oauth2Authenticated}
  <button class="btn btn-danger" on:click={handleLogout}>
    Logout
  </button>
{:else}
  <button class="btn btn-primary" on:click={handleLogin}>
    Login with OAuth2
  </button>
{/if}

{#if $oauth2Error}
  <div class="error-message">
    {$oauth2Error}
  </div>
{/if}
```

---

## 📋 4. 구현 체크리스트

### MCP Client 구현
- [ ] MCP 타입 정의 작성
- [ ] MCPClient 클래스 구현
- [ ] WebSocket 연결 관리
- [ ] 도구 등록 시스템
- [ ] 컨텍스트 관리
- [ ] MCP 스토어 구현
- [ ] 기본 도구들 구현 (웹검색, 파일읽기, 계산기)

### DCR OAuth2 구현
- [ ] OAuth2 타입 정의 작성
- [ ] DCROAuth2Client 클래스 구현
- [ ] 클라이언트 동적 등록
- [ ] 인증 플로우 구현
- [ ] 토큰 관리 (저장, 갱신, 만료 처리)
- [ ] OAuth2 스토어 구현
- [ ] AuthService 통합 서비스

### 통합 및 UI
- [ ] EnhancedAIChatService 구현
- [ ] 기존 AI Chat 서비스와 통합
- [ ] OAuth2 로그인 컴포넌트
- [ ] MCP 도구 사용 UI
- [ ] 오류 처리 및 사용자 피드백

### 테스트 및 배포
- [ ] 단위 테스트 작성
- [ ] 통합 테스트
- [ ] 보안 검토
- [ ] 문서화 업데이트
- [ ] 프로덕션 배포

---

## 🚀 5. 구현 우선순위

### 1단계: DCR OAuth2 (보안 강화)
- 더 안전한 인증 시스템 구축
- 토큰 관리 자동화
- 사용자 경험 개선

### 2단계: MCP Client (기능 확장)
- AI 상호작용 고도화
- 도구 호출 시스템
- 컨텍스트 관리

### 3단계: 통합 및 최적화
- 두 시스템 통합
- 성능 최적화
- 사용자 인터페이스 개선

---

**작성일**: 2025년 6월 23일  
**작성자**: Claude Code Assistant  
**프로젝트**: AI Chat MCP & DCR OAuth2 구현 가이드