import React from 'react';
import { Card, Button, Empty } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import { useMcpLogs } from '../../hooks/useMcp';
import { McpLogEntry } from '../../types/mcp';

interface ExecutionLogProps {
  serverId?: string;
}

export const ExecutionLog: React.FC<ExecutionLogProps> = ({ serverId }) => {
  const { logs, clearLogs } = useMcpLogs(serverId, 200);

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  const getLevelClass = (level: McpLogEntry['level']) => {
    return `log-entry-level ${level}`;
  };

  return (
    <Card 
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Execution Log</span>
          <Button 
            size="small" 
            icon={<ClearOutlined />}
            onClick={clearLogs}
            disabled={logs.length === 0}
          >
            Clear
          </Button>
        </div>
      }
      className="execution-log"
    >
      <div className="execution-log-content">
        {logs.length === 0 ? (
          <Empty description="No logs yet" />
        ) : (
          logs.map(log => (
            <div key={log.id} className="log-entry">
              <span className="log-entry-timestamp">
                [{formatTimestamp(log.timestamp)}]
              </span>
              <span className={getLevelClass(log.level)}>
                {log.level.toUpperCase()}
              </span>
              <span className="log-entry-message">
                {log.message}
              </span>
              {log.data && (
                <pre style={{ 
                  marginTop: 4, 
                  marginLeft: 24,
                  fontSize: 11,
                  color: '#8c8c8c' 
                }}>
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
};