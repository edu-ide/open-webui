import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { McpManager } from '../services/mcp/McpManager';
import {
  McpServerConfig,
  McpServerState,
  McpTool,
  McpExecution,
  McpLogEntry,
  McpServerEvent,
} from '../types/mcp';

// Singleton McpManager instance
let mcpManager: McpManager | null = null;

const getMcpManager = () => {
  if (!mcpManager) {
    mcpManager = new McpManager();
  }
  return mcpManager;
};

// Main MCP hook that combines all functionality
export const useMcp = () => {
  const queryClient = useQueryClient();
  const manager = getMcpManager();
  const [servers, setServers] = useState<McpServerState[]>([]);
  const [activeServer, setActiveServer] = useState<McpServerState | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initial load
    const allServers = manager.getAllServers();
    setServers(allServers);
    
    // Find first connected server
    const connectedServer = allServers.find(s => s.status === 'connected');
    if (connectedServer) {
      setActiveServer(connectedServer);
      setIsConnected(true);
      // Load tools for connected server
      manager.listTools(connectedServer.config.id).then(setTools).catch(console.error);
    }

    // Listen for server changes
    const handleServerStateChange = (state: McpServerState) => {
      const updatedServers = manager.getAllServers();
      setServers(updatedServers);
      
      if (state.status === 'connected' && (!activeServer || activeServer.config.id === state.config.id)) {
        setActiveServer(state);
        setIsConnected(true);
        // Load tools when server connects
        manager.listTools(state.config.id).then(setTools).catch(console.error);
      } else if (state.status === 'disconnected' && activeServer?.config.id === state.config.id) {
        setIsConnected(false);
        setTools([]);
      }
    };

    manager.on('serverStateChange', handleServerStateChange);

    return () => {
      manager.off('serverStateChange', handleServerStateChange);
    };
  }, [activeServer]);

  const connectToServer = useCallback(async (serverId: string) => {
    try {
      await manager.connectServer(serverId);
      const server = manager.getServerState(serverId);
      setActiveServer(server);
      setIsConnected(server.status === 'connected');
      if (server.status === 'connected') {
        const serverTools = await manager.listTools(serverId);
        setTools(serverTools);
      }
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
  }, []);

  const executeToolCall = useCallback(async (toolName: string, args: Record<string, any>) => {
    if (!activeServer || activeServer.status !== 'connected') {
      throw new Error('No active server connection');
    }
    
    try {
      const result = await manager.executeTool(activeServer.config.id, toolName, args);
      return result;
    } catch (error) {
      console.error('Failed to execute tool:', error);
      throw error;
    }
  }, [activeServer]);

  return {
    servers,
    activeServer,
    tools,
    isConnected,
    connectToServer,
    executeToolCall,
  };
};

// Hook for managing MCP servers
export const useMcpServers = () => {
  const queryClient = useQueryClient();
  const manager = getMcpManager();
  const [servers, setServers] = useState<McpServerState[]>([]);

  useEffect(() => {
    // Initial load
    setServers(manager.getAllServers());

    // Listen for server changes
    const handleServerStateChange = (state: McpServerState) => {
      setServers(manager.getAllServers());
      queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] });
    };

    const handleServerAdded = () => {
      setServers(manager.getAllServers());
    };

    const handleServerRemoved = () => {
      setServers(manager.getAllServers());
    };

    manager.on('serverStateChange', handleServerStateChange);
    manager.on('serverAdded', handleServerAdded);
    manager.on('serverRemoved', handleServerRemoved);

    return () => {
      manager.off('serverStateChange', handleServerStateChange);
      manager.off('serverAdded', handleServerAdded);
      manager.off('serverRemoved', handleServerRemoved);
    };
  }, [queryClient]);

  const addServer = useMutation({
    mutationFn: async (config: McpServerConfig) => {
      await manager.addServer(config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] });
    },
  });

  const removeServer = useMutation({
    mutationFn: async (serverId: string) => {
      await manager.removeServer(serverId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] });
    },
  });

  const connectServer = useMutation({
    mutationFn: async (serverId: string) => {
      await manager.connectServer(serverId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] });
    },
  });

  const disconnectServer = useMutation({
    mutationFn: async (serverId: string) => {
      await manager.disconnectServer(serverId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp', 'servers'] });
    },
  });

  return {
    servers,
    addServer,
    removeServer,
    connectServer,
    disconnectServer,
  };
};

// Hook for managing tools
export const useMcpTools = (serverId?: string) => {
  const manager = getMcpManager();

  const query = useQuery({
    queryKey: ['mcp', 'tools', serverId],
    queryFn: async () => {
      if (!serverId) return [];
      return await manager.listTools(serverId);
    },
    enabled: !!serverId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    tools: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};

// Hook for executing tools
export const useMcpExecute = () => {
  const queryClient = useQueryClient();
  const manager = getMcpManager();
  const [executions, setExecutions] = useState<McpExecution[]>([]);

  useEffect(() => {
    // Initial load
    setExecutions(manager.getAllExecutions());

    // Listen for execution updates
    const handleExecutionUpdate = (execution: McpExecution) => {
      setExecutions(manager.getAllExecutions());
    };

    manager.on('executionUpdate', handleExecutionUpdate);
    manager.on('executionStart', handleExecutionUpdate);
    manager.on('executionComplete', handleExecutionUpdate);

    return () => {
      manager.off('executionUpdate', handleExecutionUpdate);
      manager.off('executionStart', handleExecutionUpdate);
      manager.off('executionComplete', handleExecutionUpdate);
    };
  }, []);

  const execute = useMutation({
    mutationFn: async ({
      serverId,
      toolName,
      args,
    }: {
      serverId: string;
      toolName: string;
      args?: Record<string, any>;
    }) => {
      return await manager.executeTool(serverId, toolName, args);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp', 'executions'] });
    },
  });

  return {
    execute,
    executions,
    getExecution: (id: string) => manager.getExecution(id),
    getServerExecutions: (serverId: string) => manager.getServerExecutions(serverId),
  };
};

// Hook for MCP logs
export const useMcpLogs = (serverId?: string, limit: number = 100) => {
  const manager = getMcpManager();
  const [logs, setLogs] = useState<McpLogEntry[]>([]);

  useEffect(() => {
    // Initial load
    setLogs(manager.getLogs(serverId, limit));

    // Listen for new logs
    const handleLog = (entry: McpLogEntry) => {
      if (!serverId || entry.serverId === serverId) {
        setLogs(manager.getLogs(serverId, limit));
      }
    };

    const handleLogsCleared = (clearedServerId?: string) => {
      if (!serverId || serverId === clearedServerId) {
        setLogs(manager.getLogs(serverId, limit));
      }
    };

    manager.on('log', handleLog);
    manager.on('logsCleared', handleLogsCleared);

    return () => {
      manager.off('log', handleLog);
      manager.off('logsCleared', handleLogsCleared);
    };
  }, [serverId, limit]);

  const clearLogs = useCallback(() => {
    manager.clearLogs(serverId);
  }, [serverId]);

  return {
    logs,
    clearLogs,
  };
};

// Hook for server events
export const useMcpEvents = (callback: (event: McpServerEvent) => void) => {
  const manager = getMcpManager();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const handleEvent = (event: McpServerEvent) => {
      callbackRef.current(event);
    };

    manager.on('serverEvent', handleEvent);

    return () => {
      manager.off('serverEvent', handleEvent);
    };
  }, []);
};

// Hook for specific server state
export const useMcpServer = (serverId: string) => {
  const manager = getMcpManager();
  const [state, setState] = useState<McpServerState | null>(null);

  useEffect(() => {
    try {
      setState(manager.getServerState(serverId));
    } catch {
      setState(null);
    }

    const handleStateChange = (newState: McpServerState) => {
      if (newState.config.id === serverId) {
        setState(newState);
      }
    };

    manager.on('serverStateChange', handleStateChange);

    return () => {
      manager.off('serverStateChange', handleStateChange);
    };
  }, [serverId]);

  return state;
};

// Cleanup hook
export const useMcpCleanup = () => {
  useEffect(() => {
    return () => {
      if (mcpManager) {
        mcpManager.destroy();
        mcpManager = null;
      }
    };
  }, []);
};