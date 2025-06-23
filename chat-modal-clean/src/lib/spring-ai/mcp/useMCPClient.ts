import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MCPClient } from './MCPClient';
import type {
  MCPClientConfig,
  MCPConnectionState,
  MCPServerCapabilities,
  MCPResource,
  MCPTool,
  MCPPrompt,
  MCPClientEvents,
} from './types';

/**
 * MCP 클라이언트 상태
 */
export interface MCPClientState {
  connectionState: MCPConnectionState;
  serverCapabilities?: MCPServerCapabilities;
  resources: MCPResource[];
  tools: MCPTool[];
  prompts: MCPPrompt[];
  error?: Error;
  logs: Array<{
    timestamp: Date;
    level: string;
    logger?: string;
    data: any;
  }>;
}

/**
 * MCP 클라이언트 Hook 반환값
 */
export interface UseMCPClientReturn {
  state: MCPClientState;
  client: MCPClient | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  listResources: (cursor?: string) => Promise<void>;
  readResource: (uri: string) => Promise<any>;
  listTools: (cursor?: string) => Promise<void>;
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  listPrompts: (cursor?: string) => Promise<void>;
  getPrompt: (name: string, args?: Record<string, any>) => Promise<any>;
  setLogLevel: (level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency') => Promise<void>;
  clearLogs: () => void;
}

/**
 * MCP 클라이언트 React Hook
 */
export function useMCPClient(config: MCPClientConfig): UseMCPClientReturn {
  const [state, setState] = useState<MCPClientState>({
    connectionState: 'disconnected',
    resources: [],
    tools: [],
    prompts: [],
    logs: [],
  });

  const clientRef = useRef<MCPClient | null>(null);
  const isMountedRef = useRef(true);

  // 클라이언트 인스턴스 생성
  const client = useMemo(() => {
    if (!clientRef.current) {
      clientRef.current = new MCPClient(config);
    }
    return clientRef.current;
  }, [config.serverUrl]); // serverUrl이 변경될 때만 새 클라이언트 생성

  // 상태 업데이트 헬퍼
  const updateState = useCallback((updates: Partial<MCPClientState> | ((prev: MCPClientState) => MCPClientState)) => {
    if (isMountedRef.current) {
      if (typeof updates === 'function') {
        setState(updates);
      } else {
        setState(prev => ({ ...prev, ...updates }));
      }
    }
  }, []);

  // 이벤트 핸들러들
  const handleConnectionStateChanged = useCallback((data: MCPClientEvents['connection-state-changed']) => {
    updateState({ 
      connectionState: data.state,
      error: data.error,
    });
  }, [updateState]);

  const handleInitialized = useCallback((data: MCPClientEvents['initialized']) => {
    updateState({ 
      serverCapabilities: data.capabilities,
    });
  }, [updateState]);

  const handleResourceUpdated = useCallback((_data: MCPClientEvents['resource-updated']) => {
    // 리소스 업데이트 시 목록 갱신
    if (clientRef.current?.getConnectionState() === 'connected') {
      listResources();
    }
  }, []);

  const handleResourceListChanged = useCallback(() => {
    // 리소스 목록 변경 시 재조회
    if (clientRef.current?.getConnectionState() === 'connected') {
      listResources();
    }
  }, []);

  const handleToolListChanged = useCallback(() => {
    // 도구 목록 변경 시 재조회
    if (clientRef.current?.getConnectionState() === 'connected') {
      listTools();
    }
  }, []);

  const handlePromptListChanged = useCallback(() => {
    // 프롬프트 목록 변경 시 재조회
    if (clientRef.current?.getConnectionState() === 'connected') {
      listPrompts();
    }
  }, []);

  const handleLogMessage = useCallback((data: MCPClientEvents['log-message']) => {
    updateState((prev: MCPClientState) => ({
      ...prev,
      logs: [...prev.logs, {
        timestamp: new Date(),
        level: data.level,
        logger: data.logger,
        data: data.data,
      }].slice(-100), // 최대 100개 로그 유지
    }));
  }, [updateState]);

  const handleError = useCallback((data: MCPClientEvents['error']) => {
    updateState({ error: data.error });
    console.error('MCP Client Error:', data.error, data.context);
  }, [updateState]);

  // 연결 함수
  const connect = useCallback(async () => {
    if (!client) return;

    try {
      updateState({ error: undefined });
      await client.connect();
      
      // 연결 성공 후 초기 데이터 로드
      if (client.getConnectionState() === 'connected') {
        await Promise.all([
          listResources(),
          listTools(),
          listPrompts(),
        ]);
      }
    } catch (error) {
      updateState({ error: error as Error });
      throw error;
    }
  }, [client, updateState]);

  // 연결 해제 함수
  const disconnect = useCallback(async () => {
    if (!client) return;

    await client.disconnect();
    updateState({
      resources: [],
      tools: [],
      prompts: [],
      logs: [],
    });
  }, [client, updateState]);

  // 리소스 목록 조회
  const listResources = useCallback(async (cursor?: string) => {
    if (!client || client.getConnectionState() !== 'connected') return;

    try {
      const response = await client.listResources(cursor) as any;
      if ('result' in response && 'resources' in response.result) {
        updateState({ resources: response.result.resources });
      }
    } catch (error) {
      console.error('Failed to list resources:', error);
      updateState({ error: error as Error });
    }
  }, [client, updateState]);

  // 리소스 읽기
  const readResource = useCallback(async (uri: string) => {
    if (!client || client.getConnectionState() !== 'connected') {
      throw new Error('Not connected');
    }

    const response = await client.readResource(uri);
    if ('result' in response) {
      return response.result;
    }
    throw new Error('Failed to read resource');
  }, [client]);

  // 도구 목록 조회
  const listTools = useCallback(async (cursor?: string) => {
    if (!client || client.getConnectionState() !== 'connected') return;

    try {
      const response = await client.listTools(cursor) as any;
      if ('result' in response && 'tools' in response.result) {
        updateState({ tools: response.result.tools });
      }
    } catch (error) {
      console.error('Failed to list tools:', error);
      updateState({ error: error as Error });
    }
  }, [client, updateState]);

  // 도구 실행
  const callTool = useCallback(async (name: string, args?: Record<string, any>) => {
    if (!client || client.getConnectionState() !== 'connected') {
      throw new Error('Not connected');
    }

    const response = await client.callTool(name, args);
    if ('result' in response) {
      return response.result;
    }
    throw new Error('Failed to call tool');
  }, [client]);

  // 프롬프트 목록 조회
  const listPrompts = useCallback(async (cursor?: string) => {
    if (!client || client.getConnectionState() !== 'connected') return;

    try {
      const response = await client.listPrompts(cursor) as any;
      if ('result' in response && 'prompts' in response.result) {
        updateState({ prompts: response.result.prompts });
      }
    } catch (error) {
      console.error('Failed to list prompts:', error);
      updateState({ error: error as Error });
    }
  }, [client, updateState]);

  // 프롬프트 가져오기
  const getPrompt = useCallback(async (name: string, args?: Record<string, any>) => {
    if (!client || client.getConnectionState() !== 'connected') {
      throw new Error('Not connected');
    }

    const response = await client.getPrompt(name, args);
    if ('result' in response) {
      return response.result;
    }
    throw new Error('Failed to get prompt');
  }, [client]);

  // 로그 레벨 설정
  const setLogLevel = useCallback(async (level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency') => {
    if (!client || client.getConnectionState() !== 'connected') {
      throw new Error('Not connected');
    }

    await client.setLogLevel(level);
  }, [client]);

  // 로그 지우기
  const clearLogs = useCallback(() => {
    updateState({ logs: [] });
  }, [updateState]);

  // 이벤트 리스너 등록/해제
  useEffect(() => {
    if (!client) return;

    // 이벤트 리스너 등록
    client.on('connection-state-changed', handleConnectionStateChanged);
    client.on('initialized', handleInitialized);
    client.on('resource-updated', handleResourceUpdated);
    client.on('resource-list-changed', handleResourceListChanged);
    client.on('tool-list-changed', handleToolListChanged);
    client.on('prompt-list-changed', handlePromptListChanged);
    client.on('log-message', handleLogMessage);
    client.on('error', handleError);

    // 클린업
    return () => {
      client.off('connection-state-changed', handleConnectionStateChanged);
      client.off('initialized', handleInitialized);
      client.off('resource-updated', handleResourceUpdated);
      client.off('resource-list-changed', handleResourceListChanged);
      client.off('tool-list-changed', handleToolListChanged);
      client.off('prompt-list-changed', handlePromptListChanged);
      client.off('log-message', handleLogMessage);
      client.off('error', handleError);
    };
  }, [
    client,
    handleConnectionStateChanged,
    handleInitialized,
    handleResourceUpdated,
    handleResourceListChanged,
    handleToolListChanged,
    handlePromptListChanged,
    handleLogMessage,
    handleError,
  ]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
      }
    };
  }, []);

  return {
    state,
    client,
    connect,
    disconnect,
    listResources,
    readResource,
    listTools,
    callTool,
    listPrompts,
    getPrompt,
    setLogLevel,
    clearLogs,
  };
}

/**
 * MCP 클라이언트 Context Provider를 위한 타입
 */
export interface MCPClientContextValue extends UseMCPClientReturn {
  config: MCPClientConfig;
}

/**
 * 기본 MCP 클라이언트 설정
 */
export const defaultMCPConfig: MCPClientConfig = {
  serverUrl: '/api/mcp',
  protocolVersion: '1.0.0',
  clientInfo: {
    name: 'spring-ai-react-client',
    version: '1.0.0',
  },
  capabilities: {
    roots: {
      listChanged: true,
    },
    sampling: {},
  },
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  handshakeTimeout: 10000,
  heartbeatInterval: 30000,
};