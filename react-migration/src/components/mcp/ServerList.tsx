import React, { useEffect } from 'react';
import { Button, Badge, Space, Popconfirm, message } from 'antd';
import { 
  PlusOutlined, 
  ReloadOutlined, 
  ApiOutlined,
  DisconnectOutlined,
  DeleteOutlined 
} from '@ant-design/icons';
import { useMcpServers } from '../../hooks/useMcp';
import { McpServerConfig, McpServerStatus } from '../../types/mcp';

interface ServerListProps {
  selectedServerId?: string;
  onSelectServer: (serverId: string) => void;
}

// Sample server configurations (should come from config/API)
const sampleServers: McpServerConfig[] = [
  {
    id: 'shrimp-task-manager',
    name: 'Shrimp Task Manager',
    type: 'sse',
    url: 'http://localhost:9093/mcp/messages',
  },
  {
    id: 'spring-server-manager',
    name: 'Spring Server Manager',
    type: 'sse',
    url: 'http://localhost:9090/mcp/messages',
  },
  {
    id: 'mcp-database-server',
    name: 'Database Server',
    type: 'sse',
    url: 'http://localhost:9091/mcp/messages',
  },
];

export const ServerList: React.FC<ServerListProps> = ({ selectedServerId, onSelectServer }) => {
  const { servers, addServer, removeServer, connectServer, disconnectServer } = useMcpServers();

  // Auto-add sample servers on mount
  useEffect(() => {
    if (servers.length === 0) {
      sampleServers.forEach(config => {
        addServer.mutate(config);
      });
    }
  }, []);

  const getStatusBadge = (status: McpServerStatus) => {
    const statusConfig = {
      connected: { status: 'success' as const, text: 'Connected' },
      connecting: { status: 'processing' as const, text: 'Connecting' },
      disconnected: { status: 'default' as const, text: 'Disconnected' },
      error: { status: 'error' as const, text: 'Error' },
    };

    const config = statusConfig[status];
    return <Badge status={config.status} text={config.text} />;
  };

  const handleConnect = async (serverId: string) => {
    try {
      await connectServer.mutateAsync(serverId);
      message.success('Server connected successfully');
    } catch (error) {
      message.error(`Failed to connect: ${error}`);
    }
  };

  const handleDisconnect = async (serverId: string) => {
    try {
      await disconnectServer.mutateAsync(serverId);
      message.success('Server disconnected');
    } catch (error) {
      message.error(`Failed to disconnect: ${error}`);
    }
  };

  const handleRemove = async (serverId: string) => {
    try {
      await removeServer.mutateAsync(serverId);
      message.success('Server removed');
      if (selectedServerId === serverId) {
        onSelectServer('');
      }
    } catch (error) {
      message.error(`Failed to remove server: ${error}`);
    }
  };

  return (
    <div className="server-list">
      <div className="server-list-header">
        <h3>MCP Servers</h3>
        <Button 
          icon={<PlusOutlined />} 
          size="small"
          onClick={() => message.info('Add server dialog coming soon')}
        />
      </div>

      {servers.map(server => (
        <div 
          key={server.config.id}
          className={`server-item ${selectedServerId === server.config.id ? 'selected' : ''}`}
          onClick={() => onSelectServer(server.config.id)}
        >
          <div className="server-item-header">
            <div>
              <div className="server-item-name">{server.config.name}</div>
              <div className="server-item-type">Type: {server.config.type}</div>
            </div>
            {getStatusBadge(server.status)}
          </div>
          
          <Space style={{ marginTop: 8 }}>
            {server.status === 'disconnected' ? (
              <Button 
                size="small" 
                icon={<ApiOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleConnect(server.config.id);
                }}
                loading={connectServer.isPending}
              >
                Connect
              </Button>
            ) : (
              <Button 
                size="small" 
                icon={<DisconnectOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDisconnect(server.config.id);
                }}
                loading={disconnectServer.isPending}
              >
                Disconnect
              </Button>
            )}
            
            <Button 
              size="small" 
              icon={<ReloadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                if (server.status === 'connected') {
                  handleDisconnect(server.config.id).then(() => {
                    handleConnect(server.config.id);
                  });
                }
              }}
            >
              Refresh
            </Button>
            
            <Popconfirm
              title="Remove this server?"
              onConfirm={(e) => {
                e?.stopPropagation();
                handleRemove(server.config.id);
              }}
              onCancel={(e) => e?.stopPropagation()}
            >
              <Button 
                size="small" 
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              >
                Remove
              </Button>
            </Popconfirm>
          </Space>
          
          {server.error && (
            <div style={{ marginTop: 8, color: '#ff4d4f', fontSize: 12 }}>
              Error: {server.error}
            </div>
          )}
        </div>
      ))}

      <div className="quick-actions">
        <div className="quick-actions-title">Quick Actions</div>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button 
            block
            onClick={async () => {
              for (const server of servers) {
                if (server.status === 'disconnected') {
                  await handleConnect(server.config.id);
                }
              }
            }}
          >
            Connect All
          </Button>
          <Button 
            block
            onClick={async () => {
              for (const server of servers) {
                if (server.status === 'connected') {
                  await handleDisconnect(server.config.id);
                }
              }
            }}
          >
            Disconnect All
          </Button>
        </Space>
      </div>
    </div>
  );
};