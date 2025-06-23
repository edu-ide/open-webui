/**
 * MCP (Model Context Protocol) Stores
 * 
 * Svelte stores for managing MCP client state, tools, and contexts
 */

import { writable, derived, type Writable } from 'svelte/store';
import type { 
	MCPContext, 
	MCPTool, 
	MCPServerInfo,
	MCPConnectionOptions,
	MCPStreamChunk
} from '$lib/types/mcp';
import { MCPClient } from '$lib/services/mcpClient';
import { getAllTools } from '$lib/services/mcpTools';

// MCP Client instance
export const mcpClient: Writable<MCPClient | null> = writable(null);

// Connection state
export const mcpConnected = writable(false);
export const mcpAuthenticated = writable(false);
export const mcpReconnecting = writable(false);
export const mcpReconnectAttempt = writable(0);

// Server information
export const mcpServerInfo: Writable<MCPServerInfo | null> = writable(null);

// Tools management
export const mcpTools: Writable<Map<string, MCPTool>> = writable(new Map());
export const mcpToolsEnabled = writable(true);

// Context management
export const mcpContexts: Writable<Map<string, MCPContext>> = writable(new Map());
export const mcpActiveContexts: Writable<string[]> = writable([]);

// Error handling
export const mcpError: Writable<string | null> = writable(null);
export const mcpLastError: Writable<{ timestamp: number; error: string } | null> = writable(null);

// Streaming state
export const mcpStreaming = writable(false);
export const mcpStreamBuffer: Writable<MCPStreamChunk[]> = writable([]);

// Settings
export const mcpSettings = writable({
	autoReconnect: true,
	enableTools: true,
	enableContexts: true,
	maxContextsStored: 100,
	debugMode: false
});

// Derived stores
export const mcpStatus = derived(
	[mcpConnected, mcpAuthenticated, mcpReconnecting],
	([$connected, $authenticated, $reconnecting]) => {
		if ($reconnecting) return 'reconnecting';
		if ($authenticated) return 'authenticated';
		if ($connected) return 'connected';
		return 'disconnected';
	}
);

export const mcpToolsList = derived(
	mcpTools,
	($tools) => Array.from($tools.values())
);

export const mcpContextsList = derived(
	mcpContexts,
	($contexts) => Array.from($contexts.values())
		.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp)
);

// MCP Store Helpers
export const mcpHelpers = {
	/**
	 * Initialize MCP client
	 */
	async initialize(options: MCPConnectionOptions): Promise<void> {
		try {
			mcpError.set(null);
			
			// Create MCP client with event handlers
			const client = new MCPClient(options, {
				onOpen: () => {
					mcpConnected.set(true);
					mcpReconnecting.set(false);
					mcpReconnectAttempt.set(0);
					console.log('MCP connected');
				},
				
				onClose: (event) => {
					mcpConnected.set(false);
					mcpAuthenticated.set(false);
					
					if (event.code !== 1000) {
						mcpError.set(`Connection closed: ${event.reason || 'Unknown reason'}`);
					}
				},
				
				onError: (error) => {
					console.error('MCP error:', error);
					mcpError.set(error.message);
					mcpLastError.set({
						timestamp: Date.now(),
						error: error.message
					});
				},
				
				onReconnect: (attempt) => {
					mcpReconnecting.set(true);
					mcpReconnectAttempt.set(attempt);
				},
				
				onAuthenticated: () => {
					mcpAuthenticated.set(true);
					console.log('MCP authenticated');
					
					// Get server info
					const serverInfo = client.getServerInfo();
					if (serverInfo) {
						mcpServerInfo.set(serverInfo);
					}
				}
			});
			
			// Connect to server
			await client.connect();
			
			// Store client
			mcpClient.set(client);
			
			// Register default tools if enabled
			const settings = get(mcpSettings);
			if (settings.enableTools) {
				await this.registerDefaultTools();
			}
			
		} catch (error) {
			console.error('Failed to initialize MCP:', error);
			mcpError.set(`Initialization failed: ${error.message}`);
			throw error;
		}
	},
	
	/**
	 * Register default tools
	 */
	async registerDefaultTools(): Promise<void> {
		const client = get(mcpClient);
		if (!client) return;
		
		const tools = getAllTools();
		const toolsMap = new Map<string, MCPTool>();
		
		for (const tool of tools) {
			try {
				await client.registerTool(tool);
				toolsMap.set(tool.name, tool);
				console.log(`Registered tool: ${tool.name}`);
			} catch (error) {
				console.error(`Failed to register tool ${tool.name}:`, error);
			}
		}
		
		mcpTools.set(toolsMap);
	},
	
	/**
	 * Register custom tool
	 */
	async registerTool(tool: MCPTool): Promise<void> {
		const client = get(mcpClient);
		if (!client) throw new Error('MCP client not initialized');
		
		await client.registerTool(tool);
		
		mcpTools.update(tools => {
			tools.set(tool.name, tool);
			return tools;
		});
	},
	
	/**
	 * Unregister tool
	 */
	async unregisterTool(toolName: string): Promise<void> {
		const client = get(mcpClient);
		if (!client) throw new Error('MCP client not initialized');
		
		await client.unregisterTool(toolName);
		
		mcpTools.update(tools => {
			tools.delete(toolName);
			return tools;
		});
	},
	
	/**
	 * Store context
	 */
	async storeContext(
		conversationId: string, 
		content: any, 
		metadata?: any
	): Promise<MCPContext> {
		const client = get(mcpClient);
		if (!client) throw new Error('MCP client not initialized');
		
		const context = await client.storeContext(conversationId, content, metadata);
		
		mcpContexts.update(contexts => {
			contexts.set(context.id, context);
			
			// Limit stored contexts
			const settings = get(mcpSettings);
			if (contexts.size > settings.maxContextsStored) {
				// Remove oldest contexts
				const sorted = Array.from(contexts.entries())
					.sort((a, b) => a[1].metadata.timestamp - b[1].metadata.timestamp);
				
				const toRemove = sorted.slice(0, contexts.size - settings.maxContextsStored);
				toRemove.forEach(([id]) => contexts.delete(id));
			}
			
			return contexts;
		});
		
		// Add to active contexts
		mcpActiveContexts.update(active => {
			if (!active.includes(context.id)) {
				return [...active, context.id];
			}
			return active;
		});
		
		return context;
	},
	
	/**
	 * Retrieve contexts
	 */
	async retrieveContexts(query: any): Promise<MCPContext[]> {
		const client = get(mcpClient);
		if (!client) throw new Error('MCP client not initialized');
		
		const contexts = await client.retrieveContexts(query);
		
		// Update local store
		const contextsMap = new Map<string, MCPContext>();
		contexts.forEach(ctx => contextsMap.set(ctx.id, ctx));
		mcpContexts.set(contextsMap);
		
		return contexts;
	},
	
	/**
	 * Send streaming message
	 */
	async sendStreamingMessage(
		message: string,
		conversationId: string,
		onChunk: (chunk: MCPStreamChunk) => void,
		metadata?: any
	): Promise<void> {
		const client = get(mcpClient);
		if (!client) throw new Error('MCP client not initialized');
		
		mcpStreaming.set(true);
		mcpStreamBuffer.set([]);
		
		try {
			await client.sendStreamingMessage(
				message,
				conversationId,
				(chunk) => {
					// Update stream buffer
					mcpStreamBuffer.update(buffer => [...buffer, chunk]);
					
					// Call user callback
					onChunk(chunk);
					
					// Check if done
					if (chunk.done) {
						mcpStreaming.set(false);
					}
				},
				metadata
			);
		} catch (error) {
			mcpStreaming.set(false);
			throw error;
		}
	},
	
	/**
	 * Clear contexts
	 */
	clearContexts(): void {
		mcpContexts.set(new Map());
		mcpActiveContexts.set([]);
	},
	
	/**
	 * Clear error
	 */
	clearError(): void {
		mcpError.set(null);
	},
	
	/**
	 * Disconnect
	 */
	disconnect(): void {
		const client = get(mcpClient);
		if (client) {
			client.disconnect();
		}
		
		// Reset all stores
		mcpClient.set(null);
		mcpConnected.set(false);
		mcpAuthenticated.set(false);
		mcpReconnecting.set(false);
		mcpReconnectAttempt.set(0);
		mcpServerInfo.set(null);
		mcpTools.set(new Map());
		mcpContexts.set(new Map());
		mcpActiveContexts.set([]);
		mcpError.set(null);
		mcpStreaming.set(false);
		mcpStreamBuffer.set([]);
	},
	
	/**
	 * Update settings
	 */
	updateSettings(settings: Partial<typeof mcpSettings>): void {
		mcpSettings.update(current => ({
			...current,
			...settings
		}));
	}
};

// Helper function to get store value
function get<T>(store: Writable<T>): T {
	let value: T;
	store.subscribe(v => value = v)();
	return value!;
}