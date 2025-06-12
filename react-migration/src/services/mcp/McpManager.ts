import { EventEmitter } from 'events';
import { McpClient } from './McpClient';
import { SseClient } from './SseClient';
import {
  McpServerConfig,
  McpServerState,
  McpExecution,
  McpLogEntry,
  McpServerEvent,
} from '../../types/mcp';

export class McpManager extends EventEmitter {
  private clients: Map<string, McpClient> = new Map();
  private executions: Map<string, McpExecution> = new Map();
  private logs: McpLogEntry[] = [];
  private maxLogEntries = 1000;

  constructor() {
    super();
  }

  // Server Management
  public async addServer(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      throw new Error(`Server ${config.id} already exists`);
    }

    const client = this.createClient(config);
    this.setupClientListeners(client);
    this.clients.set(config.id, client);

    this.emit('serverAdded', config);
    this.log('info', config.id, `Server added: ${config.name}`);
  }

  public async removeServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not found`);
    }

    await client.disconnect();
    client.destroy();
    this.clients.delete(serverId);

    this.emit('serverRemoved', serverId);
    this.log('info', serverId, `Server removed: ${serverId}`);
  }

  public async connectServer(serverId: string): Promise<void> {
    const client = this.getClient(serverId);
    await client.connect();
  }

  public async disconnectServer(serverId: string): Promise<void> {
    const client = this.getClient(serverId);
    await client.disconnect();
  }

  public getServerState(serverId: string): McpServerState {
    const client = this.getClient(serverId);
    return client.getState();
  }

  public getAllServers(): McpServerState[] {
    return Array.from(this.clients.values()).map(client => client.getState());
  }

  // Tool Operations
  public async listTools(serverId: string) {
    const client = this.getClient(serverId);
    return await client.listTools();
  }

  public async executeTool(serverId: string, toolName: string, args?: Record<string, any>): Promise<McpExecution> {
    const client = this.getClient(serverId);
    const execution = await client.executeTool(toolName, args);
    
    this.executions.set(execution.id, execution);
    this.emit('executionUpdate', execution);
    
    return execution;
  }

  // Execution Management
  public getExecution(executionId: string): McpExecution | undefined {
    return this.executions.get(executionId);
  }

  public getAllExecutions(): McpExecution[] {
    return Array.from(this.executions.values());
  }

  public getServerExecutions(serverId: string): McpExecution[] {
    return Array.from(this.executions.values())
      .filter(exec => exec.serverId === serverId);
  }

  // Logging
  public getLogs(serverId?: string, limit?: number): McpLogEntry[] {
    let logs = this.logs;
    
    if (serverId) {
      logs = logs.filter(log => log.serverId === serverId);
    }
    
    if (limit) {
      logs = logs.slice(-limit);
    }
    
    return logs;
  }

  public clearLogs(serverId?: string): void {
    if (serverId) {
      this.logs = this.logs.filter(log => log.serverId !== serverId);
    } else {
      this.logs = [];
    }
    
    this.emit('logsCleared', serverId);
  }

  // Private Methods
  private createClient(config: McpServerConfig): McpClient {
    switch (config.type) {
      case 'sse':
        return new SseClient(config);
      // TODO: Add support for other client types
      // case 'websocket':
      //   return new WebSocketClient(config);
      // case 'stdio':
      //   return new StdioClient(config);
      default:
        throw new Error(`Unsupported server type: ${config.type}`);
    }
  }

  private setupClientListeners(client: McpClient) {
    const serverId = client.getState().config.id;

    client.on('statusChange', (state: McpServerState) => {
      this.emit('serverStateChange', state);
    });

    client.on('event', (event: McpServerEvent) => {
      this.emit('serverEvent', event);
    });

    client.on('executionStart', (execution: McpExecution) => {
      this.executions.set(execution.id, execution);
      this.emit('executionStart', execution);
      this.log('info', serverId, `Execution started: ${execution.tool}`);
    });

    client.on('executionComplete', (execution: McpExecution) => {
      this.executions.set(execution.id, execution);
      this.emit('executionComplete', execution);
      
      const status = execution.status === 'completed' ? 'completed' : 'failed';
      const message = execution.status === 'completed' 
        ? `Execution completed: ${execution.tool}`
        : `Execution failed: ${execution.tool} - ${execution.error}`;
      
      this.log(execution.status === 'completed' ? 'info' : 'error', serverId, message);
    });
  }

  private getClient(serverId: string): McpClient {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not found`);
    }
    return client;
  }

  private log(level: McpLogEntry['level'], serverId: string, message: string, data?: any) {
    const entry: McpLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      serverId,
      level,
      message,
      data,
    };

    this.logs.push(entry);
    
    // Trim logs if exceeding max entries
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    this.emit('log', entry);
  }

  // Cleanup
  public async destroy() {
    // Disconnect and destroy all clients
    for (const [serverId, client] of this.clients) {
      try {
        await client.disconnect();
        client.destroy();
      } catch (error) {
        console.error(`Error destroying client ${serverId}:`, error);
      }
    }
    
    this.clients.clear();
    this.executions.clear();
    this.logs = [];
    this.removeAllListeners();
  }
}