import { McpClient } from './McpClient';
import { McpServerConfig, JsonRpcRequest, JsonRpcResponse } from '../../types/mcp';

export class SseClient extends McpClient {
  private eventSource: EventSource | null = null;
  private messageQueue: JsonRpcRequest[] = [];
  private isConnecting = false;

  constructor(config: McpServerConfig) {
    super(config);
    if (!config.url) {
      throw new Error('SSE client requires a URL');
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected() || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.updateStatus('connecting');

    try {
      await this.establishConnection();
      this.updateStatus('connected');
      await this.initialize();
      
      // Process queued messages
      while (this.messageQueue.length > 0) {
        const request = this.messageQueue.shift();
        if (request) {
          await this.sendRequest(request);
        }
      }
    } catch (error) {
      this.updateStatus('error', error instanceof Error ? error.message : 'Connection failed');
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.url) {
        reject(new Error('No URL configured'));
        return;
      }

      this.eventSource = new EventSource(this.config.url);

      const connectionTimeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this.disconnect();
      }, 10000);

      this.eventSource.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log(`SSE connection established to ${this.config.url}`);
        resolve();
      };

      this.eventSource.onerror = (event) => {
        clearTimeout(connectionTimeout);
        console.error('SSE connection error:', event);
        
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          reject(new Error('SSE connection closed'));
          this.handleDisconnect();
        }
      };

      this.eventSource.addEventListener('response', (event) => {
        try {
          const response: JsonRpcResponse = JSON.parse(event.data);
          this.handleResponse(response);
        } catch (error) {
          console.error('Failed to parse SSE response:', error);
        }
      });

      this.eventSource.addEventListener('error', (event) => {
        try {
          const errorData = JSON.parse(event.data);
          console.error('SSE error event:', errorData);
        } catch {
          console.error('SSE error event:', event);
        }
      });

      this.eventSource.addEventListener('ping', (event) => {
        // Handle keepalive pings
        console.debug('SSE ping received:', event.data);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    this.messageQueue = [];
    this.pendingRequests.clear();
    this.updateStatus('disconnected');
  }

  protected async sendRequest(request: JsonRpcRequest): Promise<void> {
    if (!this.isConnected()) {
      // Queue the request if not connected
      this.messageQueue.push(request);
      return;
    }

    if (!this.config.url) {
      throw new Error('No URL configured');
    }

    // For SSE, we need to send requests via HTTP POST
    const response = await fetch(this.config.url.replace('/messages', ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // The response will come through the SSE connection
  }

  private handleDisconnect() {
    this.updateStatus('disconnected');
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection lost'));
    }
    this.pendingRequests.clear();

    // Emit disconnect event
    this.emit('disconnect');
  }

  destroy() {
    this.disconnect();
    super.destroy();
  }
}