import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { McpManager } from '../services/mcp/McpManager';
import {
  McpServerConfig,
  McpServerState,
  McpTool,
  McpExecution,
  McpLogEntry,
} from '../types/mcp';

interface McpState {
  // State
  servers: McpServerState[];
  activeServerId: string | null;
  tools: McpTool[];
  executions: McpExecution[];
  logs: McpLogEntry[];
  isInitialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  addServer: (config: McpServerConfig) => Promise<void>;
  removeServer: (serverId: string) => Promise<void>;
  connectServer: (serverId: string) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  updateServerAuth: (params: {
    serverId: string;
    authType: 'bearer' | 'oauth2';
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    expiresIn?: number;
    scope?: string;
  }) => Promise<void>;
  setActiveServer: (serverId: string | null) => void;
  refreshServers: () => void;
  refreshTools: (serverId?: string) => Promise<void>;
  executeTool: (serverId: string, toolName: string, args?: Record<string, any>) => Promise<McpExecution>;
  clearLogs: (serverId?: string) => void;
}

// Default servers to be added on initialization
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

// Global McpManager instance
let mcpManager: McpManager | null = null;

const getMcpManager = (): McpManager => {
  if (!mcpManager) {
    mcpManager = new McpManager();
  }
  return mcpManager;
};

export const useMcpStore = create<McpState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    servers: [],
    activeServerId: null,
    tools: [],
    executions: [],
    logs: [],
    isInitialized: false,

    // Initialize the store and MCP manager
    initialize: async () => {
      if (get().isInitialized) return;

      const manager = getMcpManager();

      try {
        // Add default servers
        for (const serverConfig of DEFAULT_SERVERS) {
          try {
            // Check if server already exists
            const existingServers = manager.getAllServers();
            const serverExists = existingServers.some(s => s.config.id === serverConfig.id);
            
            if (!serverExists) {
              await manager.addServer(serverConfig);
            }
          } catch (error) {
            console.error(`Failed to add default server ${serverConfig.id}:`, error);
          }
        }

        // Set up event listeners
        const handleServerStateChange = (state: McpServerState) => {
          get().refreshServers();
        };

        const handleServerAdded = () => {
          get().refreshServers();
        };

        const handleServerRemoved = () => {
          get().refreshServers();
        };

        const handleExecutionUpdate = (execution: McpExecution) => {
          set(state => ({
            executions: [...state.executions.filter(e => e.id !== execution.id), execution]
          }));
        };

        const handleLog = (entry: McpLogEntry) => {
          set(state => ({
            logs: [...state.logs, entry].slice(-1000) // Keep last 1000 logs
          }));
        };

        manager.on('serverStateChange', handleServerStateChange);
        manager.on('serverAdded', handleServerAdded);
        manager.on('serverRemoved', handleServerRemoved);
        manager.on('executionUpdate', handleExecutionUpdate);
        manager.on('executionStart', handleExecutionUpdate);
        manager.on('executionComplete', handleExecutionUpdate);
        manager.on('log', handleLog);

        // Initial data load
        get().refreshServers();

        set({ isInitialized: true });
      } catch (error) {
        console.error('Failed to initialize MCP store:', error);
      }
    },

    // Add a new server
    addServer: async (config: McpServerConfig) => {
      const manager = getMcpManager();
      await manager.addServer(config);
      get().refreshServers();
    },

    // Remove a server
    removeServer: async (serverId: string) => {
      const manager = getMcpManager();
      await manager.removeServer(serverId);
      
      // Clear active server if it was removed
      if (get().activeServerId === serverId) {
        set({ activeServerId: null, tools: [] });
      }
      
      get().refreshServers();
    },

    // Connect to a server
    connectServer: async (serverId: string) => {
      const manager = getMcpManager();
      await manager.connectServer(serverId);
      
      // Auto-select as active server if connected successfully
      const serverState = manager.getServerState(serverId);
      if (serverState.status === 'connected') {
        get().setActiveServer(serverId);
        await get().refreshTools(serverId);
      }
      
      get().refreshServers();
    },

    // Disconnect from a server
    disconnectServer: async (serverId: string) => {
      const manager = getMcpManager();
      await manager.disconnectServer(serverId);
      
      // Clear active server if it was disconnected
      if (get().activeServerId === serverId) {
        set({ activeServerId: null, tools: [] });
      }
      
      get().refreshServers();
    },

    // Update server authentication
    updateServerAuth: async ({
      serverId,
      authType,
      accessToken,
      refreshToken,
      tokenType,
      expiresIn,
      scope
    }: {
      serverId: string;
      authType: 'bearer' | 'oauth2';
      accessToken: string;
      refreshToken?: string;
      tokenType?: string;
      expiresIn?: number;
      scope?: string;
    }) => {
      const manager = getMcpManager();
      const serverState = manager.getServerState(serverId);
      
      if (!serverState) {
        throw new Error('Server not found');
      }

      const updatedAuth = {
        ...serverState.config.auth,
        type: authType,
        token: accessToken,
        ...(authType === 'oauth2' && {
          oauth2: {
            ...serverState.config.auth?.oauth2,
            accessToken,
            refreshToken,
            tokenType,
            expiresIn,
            scope,
            tokenExpiry: expiresIn ? Date.now() + (expiresIn * 1000) : undefined
          }
        })
      };

      const updatedConfig = {
        ...serverState.config,
        auth: updatedAuth
      };

      await manager.updateServer(serverId, updatedConfig);
      get().refreshServers();
    },

    // Set active server
    setActiveServer: (serverId: string | null) => {
      set({ activeServerId: serverId });
      
      if (serverId) {
        get().refreshTools(serverId);
      } else {
        set({ tools: [] });
      }
    },

    // Refresh servers list
    refreshServers: () => {
      const manager = getMcpManager();
      const servers = manager.getAllServers();
      set({ servers });
    },

    // Refresh tools for a server
    refreshTools: async (serverId?: string) => {
      const targetServerId = serverId || get().activeServerId;
      if (!targetServerId) {
        set({ tools: [] });
        return;
      }

      try {
        const manager = getMcpManager();
        const tools = await manager.listTools(targetServerId);
        set({ tools });
      } catch (error) {
        console.error('Failed to refresh tools:', error);
        set({ tools: [] });
      }
    },

    // Execute a tool
    executeTool: async (serverId: string, toolName: string, args?: Record<string, any>) => {
      const manager = getMcpManager();
      const execution = await manager.executeTool(serverId, toolName, args);
      
      set(state => ({
        executions: [...state.executions.filter(e => e.id !== execution.id), execution]
      }));
      
      return execution;
    },

    // Clear logs
    clearLogs: (serverId?: string) => {
      const manager = getMcpManager();
      manager.clearLogs(serverId);
      
      if (serverId) {
        set(state => ({
          logs: state.logs.filter(log => log.serverId !== serverId)
        }));
      } else {
        set({ logs: [] });
      }
    },
  }))
);

// Initialize the store when the module is loaded
useMcpStore.getState().initialize();