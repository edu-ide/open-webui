import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { McpManager } from '../services/mcp/McpManager';
import { useMcpStore } from '../stores/mcpStore';
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

// Default servers
const DEFAULT_SERVERS: McpServerConfig[] = [
  {
    id: 'upbit-mcp-server',
    name: 'Upbit MCP Server',
    transport: 'sse',
    endpoint: 'https://mcp-upbit.ugot.uk/sse',
    auth: {
      type: 'none'
    }
  }
];

const getMcpManager = () => {
  if (!mcpManager) {
    mcpManager = new McpManager();
    // Add default servers after a short delay to ensure manager is ready
    setTimeout(() => {
      DEFAULT_SERVERS.forEach(async (server) => {
        try {
          // Check if server already exists
          const existingServers = mcpManager!.getAllServers();
          const serverExists = existingServers.some(s => s.config.id === server.id);
          if (!serverExists) {
            await mcpManager!.addServer(server);
          }
        } catch (error) {
          console.error('Error adding default server:', error);
        }
      });
    }, 100);
  }
  return mcpManager;
};

// Main MCP hook that uses Zustand store
export const useMcp = () => {
  const { 
    servers, 
    activeServerId, 
    tools, 
    connectServer, 
    setActiveServer, 
    executeTool 
  } = useMcpStore();

  const activeServer = servers.find(s => s.config.id === activeServerId) || null;
  const isConnected = activeServer?.status === 'connected' || false;

  const connectToServer = useCallback(async (serverId: string) => {
    try {
      await connectServer(serverId);
    } catch (error) {
      console.error('Failed to connect to server:', error);
      throw error;
    }
  }, [connectServer]);

  const executeToolCall = useCallback(async (toolName: string, args: Record<string, any>) => {
    if (!activeServerId) {
      throw new Error('No active server connection');
    }
    
    try {
      const result = await executeTool(activeServerId, toolName, args);
      return result;
    } catch (error) {
      console.error('Failed to execute tool:', error);
      throw error;
    }
  }, [activeServerId, executeTool]);

  return {
    servers,
    activeServer,
    tools,
    isConnected,
    connectToServer,
    executeToolCall,
  };
};

// Hook for managing MCP servers using Zustand
export const useMcpServers = () => {
  const { 
    servers, 
    addServer: addServerAction, 
    removeServer: removeServerAction, 
    connectServer: connectServerAction, 
    disconnectServer: disconnectServerAction,
    updateServerAuth: updateServerAuthAction
  } = useMcpStore();

  return {
    servers,
    addServer: addServerAction,
    removeServer: removeServerAction,
    connectServer: connectServerAction,
    disconnectServer: disconnectServerAction,
    updateServerAuth: updateServerAuthAction,
  };
};

// Hook for managing tools using Zustand
export const useMcpTools = (serverId?: string) => {
  const { tools, refreshTools } = useMcpStore();

  useEffect(() => {
    if (serverId) {
      refreshTools(serverId);
    }
  }, [serverId, refreshTools]);

  return {
    tools,
    isLoading: false,
    error: null,
    refetch: () => refreshTools(serverId),
  };
};

// Hook for executing tools using Zustand
export const useMcpExecute = () => {
  const { executions, executeTool } = useMcpStore();

  const execute = useCallback(async ({
    serverId,
    toolName,
    args,
  }: {
    serverId: string;
    toolName: string;
    args?: Record<string, any>;
  }) => {
    return await executeTool(serverId, toolName, args);
  }, [executeTool]);

  return {
    execute,
    executions,
    getExecution: (id: string) => executions.find(e => e.id === id),
    getServerExecutions: (serverId: string) => executions.filter(e => e.serverId === serverId),
  };
};

// Hook for MCP logs using Zustand
export const useMcpLogs = (serverId?: string, limit: number = 100) => {
  const { logs, clearLogs: clearLogsAction } = useMcpStore();

  const filteredLogs = useMemo(() => {
    let result = serverId ? logs.filter(log => log.serverId === serverId) : logs;
    return result.slice(-limit);
  }, [logs, serverId, limit]);

  const clearLogs = useCallback(() => {
    clearLogsAction(serverId);
  }, [clearLogsAction, serverId]);

  return {
    logs: filteredLogs,
    clearLogs,
  };
};

// Hook for specific server state using Zustand
export const useMcpServer = (serverId: string) => {
  const { servers } = useMcpStore();
  return servers.find(s => s.config.id === serverId) || null;
};