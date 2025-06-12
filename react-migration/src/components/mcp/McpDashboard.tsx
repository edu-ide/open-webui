import React, { useState } from 'react';
import { Layout, Row, Col } from 'antd';
import { ServerList } from './ServerList';
import { ToolsExplorer } from './ToolsExplorer';
import { ExecutionLog } from './ExecutionLog';
import { useMcpCleanup } from '../../hooks/useMcp';
import './McpDashboard.css';

const { Header, Content, Sider } = Layout;

export const McpDashboard: React.FC = () => {
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>();
  const [selectedTool, setSelectedTool] = useState<string | undefined>();
  
  // Cleanup MCP manager on unmount
  useMcpCleanup();

  return (
    <Layout className="mcp-dashboard">
      <Header className="mcp-header">
        <h1>MCP Client Dashboard</h1>
      </Header>
      <Layout>
        <Sider width={300} className="mcp-sider">
          <ServerList 
            selectedServerId={selectedServerId}
            onSelectServer={setSelectedServerId}
          />
        </Sider>
        <Content className="mcp-content">
          <Row gutter={[16, 16]} style={{ height: '100%' }}>
            <Col span={24} style={{ height: '60%' }}>
              <ToolsExplorer 
                serverId={selectedServerId}
                selectedTool={selectedTool}
                onSelectTool={setSelectedTool}
              />
            </Col>
            <Col span={24} style={{ height: '40%' }}>
              <ExecutionLog 
                serverId={selectedServerId}
              />
            </Col>
          </Row>
        </Content>
      </Layout>
    </Layout>
  );
};