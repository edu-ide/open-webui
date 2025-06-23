import { EventEmitter } from 'events';
import {
  McpServerConfig,
  McpServerState,
  McpServerStatus,
  McpTool,
  McpToolCallParams,
  McpToolResult,
  McpExecution,
  JsonRpcRequest,
  JsonRpcResponse,
  McpInitializeResult,
  McpServerEvent,
} from '../../types/mcp';

export abstract class McpClient extends EventEmitter {
  protected config: McpServerConfig;
  protected state: McpServerState;
  protected requestId: number = 1;
  protected pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: McpServerConfig) {
    super();
    this.config = config;
    this.state = {
      config,
      status: 'disconnected',
    };
  }

  // Abstract methods to be implemented by subclasses
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  protected abstract sendRequest(request: JsonRpcRequest): Promise<void>;

  // Common methods
  public getState(): McpServerState {
    return { ...this.state };
  }

  public getStatus(): McpServerStatus {
    return this.state.status;
  }

  public isConnected(): boolean {
    return this.state.status === 'connected';
  }

  protected updateStatus(status: McpServerStatus, error?: string) {
    this.state.status = status;
    if (error) {
      this.state.error = error;
      this.state.lastError = new Date();
    }
    
    const event: McpServerEvent = {
      type: status === 'connected' ? 'connected' : 
            status === 'disconnected' ? 'disconnected' : 
            'error',
      serverId: this.config.id,
      timestamp: new Date(),
      data: error ? { error } : undefined,
    };
    
    this.emit('statusChange', this.state);
    this.emit('event', event);
  }

  protected async makeRequest<T = any>(method: string, params?: any, timeout: number = 30000): Promise<T> {
    if (!this.isConnected()) {
      throw new Error('Client is not connected');
    }

    const id = this.requestId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle });

      this.sendRequest(request).catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  protected handleResponse(response: JsonRpcResponse) {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  // MCP Protocol Methods
  public async initialize(): Promise<McpInitializeResult> {
    const result = await this.makeRequest<McpInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'react-mcp-client',
        version: '1.0.0',
      },
    });

    this.state.capabilities = result.capabilities;
    this.state.serverInfo = result.serverInfo;
    this.state.lastConnected = new Date();

    return result;
  }

  public async listTools(): Promise<McpTool[]> {
    const result = await this.makeRequest<{ tools: McpTool[] }>('tools/list');
    this.state.tools = result.tools;
    return result.tools;
  }

  public async callTool(params: McpToolCallParams): Promise<McpToolResult> {
    const result = await this.makeRequest<McpToolResult>('tools/call', params);
    return result;
  }

  public async executeTool(toolName: string, args?: Record<string, any>): Promise<McpExecution> {
    const execution: McpExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      serverId: this.config.id,
      tool: toolName,
      arguments: args,
      status: 'pending',
      startTime: new Date(),
    };

    this.emit('executionStart', execution);

    try {
      execution.status = 'running';
      const result = await this.callTool({ name: toolName, arguments: args });
      
      execution.status = 'completed';
      execution.result = result;
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    } catch (error) {
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
    }

    this.emit('executionComplete', execution);
    return execution;
  }

  public async listResources() {
    const result = await this.makeRequest('resources/list');
    this.state.resources = result.resources;
    return result.resources;
  }

  public async listPrompts() {
    const result = await this.makeRequest('prompts/list');
    this.state.prompts = result.prompts;
    return result.prompts;
  }

  // Cleanup
  public destroy() {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client destroyed'));
    }
    this.pendingRequests.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    // Disconnect if connected
    if (this.isConnected()) {
      this.disconnect().catch(console.error);
    }
  }
}