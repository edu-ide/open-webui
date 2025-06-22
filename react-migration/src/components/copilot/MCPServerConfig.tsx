import React, { useState } from 'react';
import { useMcpServers } from '../../hooks/useMcp';
import { McpServerConfig } from '../../types/mcp';

export const MCPServerConfigPanel: React.FC = () => {
  const { servers, addServer, removeServer, connectServer, disconnectServer } = useMcpServers();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServer, setNewServer] = useState<Partial<McpServerConfig>>({
    type: 'stdio',
    name: '',
    command: '',
    args: [],
  });

  const handleAddServer = async () => {
    if (!newServer.name || !newServer.command) {
      alert('Please fill in all required fields');
      return;
    }

    const config: McpServerConfig = {
      id: `mcp-${Date.now()}`,
      name: newServer.name,
      type: newServer.type as 'stdio' | 'sse',
      command: newServer.command,
      args: newServer.args || [],
      env: {},
    };

    try {
      await addServer.mutateAsync(config);
      setShowAddForm(false);
      setNewServer({ type: 'stdio', name: '', command: '', args: [] });
      
      // Auto-connect to the new server
      await connectServer.mutateAsync(config.id);
    } catch (error) {
      console.error('Failed to add server:', error);
    }
  };

  // Default MCP servers for demo
  const defaultServers = [
    {
      id: 'spring-mcp',
      name: 'Spring AI MCP Server',
      type: 'sse' as const,
      url: '/api/v2/mcp/sse',
      description: 'Spring Boot backend MCP server'
    },
    {
      id: 'demo-weather',
      name: 'Demo Weather Server',
      type: 'stdio' as const,
      command: 'python',
      args: ['mcp_weather_server.py'],
      description: 'Sample weather MCP server'
    }
  ];

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">MCP Server Configuration</h3>
      
      {/* Quick Connect - Default Servers */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick Connect</h4>
        <div className="space-y-2">
          {defaultServers.map(server => (
            <div key={server.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">{server.name}</div>
                <div className="text-sm text-gray-500">{server.description}</div>
              </div>
              <button
                onClick={async () => {
                  const config: McpServerConfig = {
                    id: server.id,
                    name: server.name,
                    type: server.type,
                    ...(server.type === 'sse' ? { url: server.url } : { command: server.command, args: server.args }),
                    env: {},
                  };
                  
                  try {
                    await addServer.mutateAsync(config);
                    await connectServer.mutateAsync(config.id);
                  } catch (error) {
                    console.error('Failed to connect:', error);
                  }
                }}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Configured Servers */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Configured Servers</h4>
        {servers.length === 0 ? (
          <p className="text-gray-500 text-sm">No servers configured</p>
        ) : (
          <div className="space-y-2">
            {servers.map(server => (
              <div key={server.config.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{server.config.name}</div>
                  <div className="text-sm text-gray-500">
                    {server.config.type} - {server.status}
                  </div>
                </div>
                <div className="flex gap-2">
                  {server.status === 'disconnected' ? (
                    <button
                      onClick={() => connectServer.mutate(server.config.id)}
                      className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      Connect
                    </button>
                  ) : (
                    <button
                      onClick={() => disconnectServer.mutate(server.config.id)}
                      className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    onClick={() => removeServer.mutate(server.config.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Server */}
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className="mb-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
      >
        {showAddForm ? 'Cancel' : 'Add Custom Server'}
      </button>

      {showAddForm && (
        <div className="border rounded-lg p-4 mb-4">
          <h4 className="font-medium mb-3">Add MCP Server</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Server Name</label>
              <input
                type="text"
                value={newServer.name}
                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="My MCP Server"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newServer.type}
                onChange={(e) => setNewServer({ ...newServer, type: e.target.value as 'stdio' | 'sse' })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="stdio">Standard I/O</option>
                <option value="sse">Server-Sent Events</option>
              </select>
            </div>

            {newServer.type === 'stdio' ? (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Command</label>
                  <input
                    type="text"
                    value={newServer.command}
                    onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="python"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Arguments (one per line)</label>
                  <textarea
                    value={newServer.args?.join('\n') || ''}
                    onChange={(e) => setNewServer({ ...newServer, args: e.target.value.split('\n').filter(arg => arg.trim()) })}
                    className="w-full px-3 py-2 border rounded-lg"
                    rows={3}
                    placeholder="server.py&#10;--port&#10;8080"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <input
                  type="text"
                  value={newServer.url}
                  onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="http://localhost:8080/mcp"
                />
              </div>
            )}

            <button
              onClick={handleAddServer}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Add Server
            </button>
          </div>
        </div>
      )}
    </div>
  );
};