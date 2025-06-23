import { SpringAIApiClient } from '../../../api/spring-ai/client';
import type {
  MCPClientConfig,
  MCPConnectionState,
  MCPClientEvents,
  JsonRpcResponse,
  JsonRpcNotification,
  MCPInitializeRequest,
  MCPInitializeResponse,
  MCPServerCapabilities,
  MCPMessage,
  MCPRequest,
  MCPResponse,
} from './types';

/**
 * MCP 클라이언트 구현
 * HTTP+SSE 기반 실시간 통신
 */
export class MCPClient extends SpringAIApiClient {
  private config: MCPClientConfig;
  private connectionState: MCPConnectionState = 'disconnected';
  private serverCapabilities?: MCPServerCapabilities;
  private eventSource?: EventSource;
  private eventListeners: Map<keyof MCPClientEvents, Set<Function>> = new Map();
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private requestIdCounter = 0;

  constructor(config: MCPClientConfig) {
    super(config.serverUrl);
    this.config = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      handshakeTimeout: 10000,
      heartbeatInterval: 30000,
      ...config,
    };
  }

  /**
   * MCP 서버 연결
   */
  async connect(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }

    this.setConnectionState('connecting');

    try {
      // 1. 초기화 핸드셰이크
      await this.initialize();

      // 2. SSE 이벤트 스트림 연결
      await this.connectEventStream();

      // 3. 하트비트 시작
      this.startHeartbeat();

      this.setConnectionState('connected');
      this.reconnectAttempts = 0;
    } catch (error) {
      this.setConnectionState('error');
      this.emit('error', { error: error as Error, context: 'connect' });
      
      // 자동 재연결 시도
      if (this.config.maxReconnectAttempts && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * MCP 서버 연결 해제
   */
  async disconnect(): Promise<void> {
    this.cleanup();
    this.setConnectionState('disconnected');
  }

  /**
   * MCP 초기화 핸드셰이크
   */
  private async initialize(): Promise<void> {
    this.setConnectionState('handshaking');

    const initRequest: MCPInitializeRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: this.config.protocolVersion,
        capabilities: this.config.capabilities,
        clientInfo: this.config.clientInfo,
      },
    };

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Handshake timeout')), this.config.handshakeTimeout);
    });

    try {
      const response = await Promise.race([
        this.sendRequest(initRequest),
        timeoutPromise,
      ]) as MCPInitializeResponse;

      if (response.error) {
        throw new Error(`Initialization failed: ${response.error.message}`);
      }

      this.serverCapabilities = response.result.capabilities;
      this.emit('initialized', {
        serverInfo: response.result.serverInfo,
        capabilities: response.result.capabilities,
      });
    } catch (error) {
      throw new Error(`MCP handshake failed: ${(error as Error).message}`);
    }
  }

  /**
   * SSE 이벤트 스트림 연결
   */
  private async connectEventStream(): Promise<void> {
    return new Promise((resolve, reject) => {
      const eventSourceUrl = `${this.config.serverUrl}/mcp/events`;
      
      this.eventSource = new EventSource(eventSourceUrl, {
        withCredentials: true,
      });

      const timeout = setTimeout(() => {
        reject(new Error('Event stream connection timeout'));
      }, 10000);

      this.eventSource.onopen = () => {
        clearTimeout(timeout);
        console.log('MCP event stream connected');
        resolve();
      };

      this.eventSource.onerror = (error) => {
        clearTimeout(timeout);
        console.error('MCP event stream error:', error);
        this.handleEventStreamError(error);
        reject(error);
      };

      this.eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as MCPMessage;
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse MCP message:', error, event.data);
        }
      };

      // 특정 이벤트 타입 리스너 등록
      this.eventSource.addEventListener('notification', (event: MessageEvent) => {
        try {
          const notification = JSON.parse(event.data) as JsonRpcNotification;
          this.handleNotification(notification);
        } catch (error) {
          console.error('Failed to parse notification:', error);
        }
      });
    });
  }

  /**
   * 메시지 처리
   */
  private handleMessage(message: MCPMessage): void {
    if ('method' in message && !('id' in message)) {
      // Notification
      this.handleNotification(message as JsonRpcNotification);
    } else if ('id' in message && ('result' in message || 'error' in message)) {
      // Response
      this.handleResponse(message as JsonRpcResponse);
    }
  }

  /**
   * 응답 처리
   */
  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id!);
    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id!);

    if (response.error) {
      pending.reject(response.error);
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * 알림 처리
   */
  private handleNotification(notification: JsonRpcNotification): void {
    switch (notification.method) {
      case 'notifications/resources/updated':
        this.emit('resource-updated', notification.params as any);
        break;
      case 'notifications/resources/list_changed':
        this.emit('resource-list-changed', {});
        break;
      case 'notifications/tools/list_changed':
        this.emit('tool-list-changed', {});
        break;
      case 'notifications/prompts/list_changed':
        this.emit('prompt-list-changed', {});
        break;
      case 'notifications/message':
        this.emit('log-message', notification.params as any);
        break;
      default:
        console.warn('Unknown notification method:', notification.method);
    }
  }

  /**
   * JSON-RPC 요청 전송
   */
  async sendRequest<T extends MCPRequest, R extends MCPResponse>(
    request: T
  ): Promise<R> {
    const requestId = request.id || this.generateRequestId();
    const fullRequest = { ...request, id: requestId };

    return new Promise((resolve, reject) => {
      // 타임아웃 설정
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${(request as any).method}`));
      }, 30000);

      // 대기 중인 요청 저장
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // HTTP POST로 요청 전송
      this.post('/mcp/command', fullRequest)
        .then((response) => {
          // 동기 응답 처리
          if (response && typeof response === 'object' && 'result' in response) {
            this.handleResponse(response as JsonRpcResponse);
          }
        })
        .catch((error) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(error);
        });
    });
  }

  /**
   * 리소스 목록 조회
   */
  async listResources(cursor?: string) {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'resources/list',
      params: cursor ? { cursor } : undefined,
    });
  }

  /**
   * 리소스 읽기
   */
  async readResource(uri: string) {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'resources/read',
      params: { uri },
    });
  }

  /**
   * 도구 목록 조회
   */
  async listTools(cursor?: string) {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/list',
      params: cursor ? { cursor } : undefined,
    });
  }

  /**
   * 도구 실행
   */
  async callTool(name: string, args?: Record<string, any>) {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'tools/call',
      params: { name, arguments: args },
    });
  }

  /**
   * 프롬프트 목록 조회
   */
  async listPrompts(cursor?: string) {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'prompts/list',
      params: cursor ? { cursor } : undefined,
    });
  }

  /**
   * 프롬프트 가져오기
   */
  async getPrompt(name: string, args?: Record<string, any>) {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'prompts/get',
      params: { name, arguments: args },
    });
  }

  /**
   * 로그 레벨 설정
   */
  async setLogLevel(level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency') {
    return this.sendRequest({
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method: 'logging/setLevel',
      params: { level },
    });
  }

  /**
   * 이벤트 리스너 등록
   */
  on<E extends keyof MCPClientEvents>(
    event: E,
    listener: (data: MCPClientEvents[E]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * 이벤트 리스너 제거
   */
  off<E extends keyof MCPClientEvents>(
    event: E,
    listener: (data: MCPClientEvents[E]) => void
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 이벤트 발생
   */
  private emit<E extends keyof MCPClientEvents>(
    event: E,
    data: MCPClientEvents[E]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  /**
   * 연결 상태 변경
   */
  private setConnectionState(state: MCPConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.emit('connection-state-changed', { state });
    }
  }

  /**
   * 현재 연결 상태 반환
   */
  getConnectionState(): MCPConnectionState {
    return this.connectionState;
  }

  /**
   * 서버 capabilities 반환
   */
  getServerCapabilities(): MCPServerCapabilities | undefined {
    return this.serverCapabilities;
  }

  /**
   * 하트비트 시작
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      try {
        // 간단한 ping 요청으로 연결 상태 확인
        // 간단한 ping 요청으로 연결 상태 확인
        // ping 메서드가 지원되지 않을 수 있으므로 resources/list 사용
        await this.sendRequest({
          jsonrpc: '2.0',
          id: this.generateRequestId(),
          method: 'resources/list',
          params: {},
        });
      } catch (error) {
        console.error('Heartbeat failed:', error);
        this.handleConnectionLoss();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 하트비트 중지
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * 이벤트 스트림 에러 처리
   */
  private handleEventStreamError(_error: Event): void {
    if (this.connectionState === 'connected') {
      this.handleConnectionLoss();
    }
  }

  /**
   * 연결 손실 처리
   */
  private handleConnectionLoss(): void {
    this.cleanup();
    this.setConnectionState('disconnected');
    
    if (this.config.maxReconnectAttempts && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.setConnectionState('error');
      this.emit('error', { 
        error: new Error('Maximum reconnection attempts reached'),
        context: 'connection-loss'
      });
    }
  }

  /**
   * 재연결 스케줄링
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState('reconnecting');

    const delay = Math.min(
      this.config.reconnectInterval! * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * 정리 작업
   */
  private cleanup(): void {
    // 이벤트 소스 정리
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    // 하트비트 정리
    this.stopHeartbeat();

    // 재연결 타이머 정리
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    // 대기 중인 요청 정리
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    });
    this.pendingRequests.clear();
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  /**
   * 정리 및 연결 해제
   */
  destroy(): void {
    this.disconnect();
    this.eventListeners.clear();
  }
}