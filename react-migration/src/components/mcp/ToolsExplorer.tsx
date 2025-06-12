import React, { useState } from 'react';
import { Card, Empty, Spin, Button, Form, Input, message } from 'antd';
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMcpTools, useMcpExecute, useMcpServer } from '../../hooks/useMcp';
import { McpTool } from '../../types/mcp';
// Remove react-json-view import - we'll use a simple JSON display

interface ToolsExplorerProps {
  serverId?: string;
  selectedTool?: string;
  onSelectTool: (toolName: string) => void;
}

export const ToolsExplorer: React.FC<ToolsExplorerProps> = ({ 
  serverId, 
  selectedTool, 
  onSelectTool 
}) => {
  const server = useMcpServer(serverId || '');
  const { tools, isLoading, error, refetch } = useMcpTools(serverId);
  const { execute } = useMcpExecute();
  const [form] = Form.useForm();
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const selectedToolData = tools.find(t => t.name === selectedTool);

  const handleExecute = async () => {
    if (!serverId || !selectedTool) return;

    try {
      setExecuting(true);
      const values = await form.validateFields();
      const execution = await execute.mutateAsync({
        serverId,
        toolName: selectedTool,
        args: values,
      });

      if (execution.status === 'completed') {
        message.success('Tool executed successfully');
        setLastResult(execution.result);
      } else {
        message.error(`Execution failed: ${execution.error}`);
        setLastResult({ error: execution.error });
      }
    } catch (error) {
      message.error(`Failed to execute tool: ${error}`);
      console.error('Execution error:', error);
    } finally {
      setExecuting(false);
    }
  };

  const renderToolDetails = () => {
    if (!selectedToolData) {
      return (
        <Empty 
          description="Select a tool to view details"
          style={{ marginTop: 48 }}
        />
      );
    }

    const schema = selectedToolData.inputSchema;
    const properties = schema.properties || {};
    const required = schema.required || [];

    return (
      <div>
        <h3>{selectedToolData.name}</h3>
        <p style={{ color: '#8c8c8c', marginBottom: 16 }}>
          {selectedToolData.description}
        </p>

        <h4>Input Parameters</h4>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleExecute}
        >
          {Object.entries(properties).map(([key, prop]: [string, any]) => (
            <Form.Item
              key={key}
              name={key}
              label={key}
              required={required.includes(key)}
              help={prop.description}
              rules={[
                {
                  required: required.includes(key),
                  message: `${key} is required`,
                },
              ]}
            >
              {prop.type === 'object' ? (
                <Input.TextArea 
                  rows={4} 
                  placeholder="Enter JSON object"
                />
              ) : prop.type === 'array' ? (
                <Input.TextArea 
                  rows={3} 
                  placeholder="Enter JSON array"
                />
              ) : prop.type === 'boolean' ? (
                <Input placeholder="true or false" />
              ) : prop.type === 'number' ? (
                <Input type="number" />
              ) : (
                <Input />
              )}
            </Form.Item>
          ))}

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<PlayCircleOutlined />}
              loading={executing}
              disabled={!server || server.status !== 'connected'}
            >
              Execute Tool
            </Button>
          </Form.Item>
        </Form>

        {lastResult && (
          <div style={{ marginTop: 24 }}>
            <h4>Execution Result</h4>
            <div style={{ 
              background: '#f5f5f5', 
              padding: 16, 
              borderRadius: 4,
              maxHeight: 300,
              overflow: 'auto'
            }}>
              <pre style={{ 
                margin: 0, 
                fontFamily: 'monospace',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card 
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Tools Explorer</span>
          <Button 
            size="small" 
            icon={<ReloadOutlined />}
            onClick={() => refetch()}
            disabled={!serverId}
          >
            Refresh
          </Button>
        </div>
      }
      className="tools-explorer"
    >
      {!serverId ? (
        <Empty description="Select a server to view tools" />
      ) : server?.status !== 'connected' ? (
        <Empty description="Server is not connected" />
      ) : isLoading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Empty description={`Failed to load tools: ${error}`} />
      ) : (
        <div className="tools-explorer-content">
          <div className="tool-list">
            {tools.length === 0 ? (
              <Empty description="No tools available" />
            ) : (
              tools.map(tool => (
                <div
                  key={tool.name}
                  className={`tool-item ${selectedTool === tool.name ? 'selected' : ''}`}
                  onClick={() => onSelectTool(tool.name)}
                >
                  <div className="tool-item-name">{tool.name}</div>
                  <div className="tool-item-description">{tool.description}</div>
                </div>
              ))
            )}
          </div>
          <div className="tool-details">
            {renderToolDetails()}
          </div>
        </div>
      )}
    </Card>
  );
};