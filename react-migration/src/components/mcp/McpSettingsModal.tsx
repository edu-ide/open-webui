import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import { McpServerConfig, McpServerStatus } from '../../types/mcp';

interface McpSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_SSE_URL = 'https://mcp-upbit.ugot.uk/sse';

export default function McpSettingsModal({ isOpen, onClose }: McpSettingsModalProps) {
  const { 
    servers, 
    isInitialized,
    addServer, 
    removeServer, 
    connectServer, 
    disconnectServer 
  } = useMcpStore();
  
  const [isAddingServer, setIsAddingServer] = useState(false);
  
  // Debug log
  console.log('MCP Servers:', servers, 'Initialized:', isInitialized);
  const [newServer, setNewServer] = useState<Partial<McpServerConfig>>({
    name: '',
    transport: 'sse',
    endpoint: DEFAULT_SSE_URL,
    auth: {
      type: 'none'
    }
  });
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // SSE URL 기본값 설정
    if (newServer.transport === 'sse' && !newServer.endpoint) {
      setNewServer(prev => ({ ...prev, endpoint: DEFAULT_SSE_URL }));
    }
  }, [newServer.transport]);

  const handleAddServer = async () => {
    setError('');
    
    if (!newServer.name || !newServer.endpoint) {
      setError('Server name and endpoint are required');
      return;
    }

    try {
      const serverId = `${newServer.transport}-${Date.now()}`;
      const config: McpServerConfig = {
        id: serverId,
        name: newServer.name,
        transport: newServer.transport as any,
        endpoint: newServer.endpoint,
        auth: newServer.auth
      };

      await addServer(config);
      setIsAddingServer(false);
      setNewServer({
        name: '',
        transport: 'sse',
        endpoint: DEFAULT_SSE_URL,
        auth: {
          type: 'none'
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add server');
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    try {
      await removeServer(serverId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove server');
    }
  };

  const handleConnectServer = async (serverId: string) => {
    try {
      await connectServer(serverId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
    }
  };

  const handleDisconnectServer = async (serverId: string) => {
    try {
      await disconnectServer(serverId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect from server');
    }
  };

  const getStatusColor = (status: McpServerStatus) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 dark:text-green-400';
      case 'connecting':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: McpServerStatus) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            MCP Server Settings
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Server List */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Configured Servers
            </h3>
            {servers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No servers configured. Add a server to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {servers.map((server) => (
                  <div
                    key={server.config.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          {server.config.name}
                        </h4>
                        <span className={`flex items-center gap-1 text-xs ${getStatusColor(server.status)}`}>
                          {getStatusIcon(server.status)}
                          {server.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {server.config.transport.toUpperCase()} • {server.config.endpoint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {server.status === 'disconnected' ? (
                        <button
                          onClick={() => handleConnectServer(server.config.id)}
                          className="rounded px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        >
                          Connect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDisconnectServer(server.config.id)}
                          className="rounded px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                        >
                          Disconnect
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveServer(server.config.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Server Section */}
          {isAddingServer ? (
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                Add New Server
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={newServer.name || ''}
                    onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="My MCP Server"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                    Transport Type
                  </label>
                  <select
                    value={newServer.transport || 'sse'}
                    onChange={(e) => setNewServer({ 
                      ...newServer, 
                      transport: e.target.value as any,
                      endpoint: e.target.value === 'sse' ? DEFAULT_SSE_URL : ''
                    })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="sse">SSE (Server-Sent Events)</option>
                    <option value="websocket">WebSocket</option>
                    <option value="stdio">StdIO</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={newServer.endpoint || ''}
                    onChange={(e) => setNewServer({ ...newServer, endpoint: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    placeholder={newServer.transport === 'sse' ? DEFAULT_SSE_URL : 'Enter endpoint URL'}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                    Authentication
                  </label>
                  <select
                    value={newServer.auth?.type || 'none'}
                    onChange={(e) => setNewServer({ 
                      ...newServer, 
                      auth: { ...newServer.auth, type: e.target.value as any }
                    })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="none">None</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="oauth2">OAuth2</option>
                  </select>
                </div>
                {newServer.auth?.type === 'bearer' && (
                  <div>
                    <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                      Bearer Token
                    </label>
                    <input
                      type="password"
                      value={newServer.auth?.token || ''}
                      onChange={(e) => setNewServer({ 
                        ...newServer, 
                        auth: { ...newServer.auth, token: e.target.value }
                      })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Enter bearer token"
                    />
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsAddingServer(false);
                    setNewServer({
                      name: '',
                      transport: 'sse',
                      endpoint: DEFAULT_SSE_URL,
                      auth: {
                        type: 'none'
                      }
                    });
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddServer}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  Add Server
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingServer(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
            >
              <Plus className="h-4 w-4" />
              Add Server
            </button>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}