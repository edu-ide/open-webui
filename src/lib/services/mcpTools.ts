/**
 * MCP Tool Implementations
 * 
 * Collection of tools that can be registered with MCP client
 * for AI to use during conversations
 */

import type { MCPTool } from '$lib/types/mcp';

/**
 * Web Search Tool
 * Allows AI to search the web for information
 */
export const webSearchTool: MCPTool = {
	name: 'web_search',
	description: 'Search the web for information using a search query',
	parameters: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'The search query to use'
			},
			count: {
				type: 'number',
				description: 'Number of results to return',
				default: 5,
				minimum: 1,
				maximum: 10
			}
		},
		required: ['query']
	},
	handler: async (params) => {
		const { query, count = 5 } = params;
		
		try {
			// In a real implementation, this would call a search API
			// For now, we'll simulate the response
			console.log(`Searching web for: ${query}`);
			
			// Mock search results
			const results = Array.from({ length: count }, (_, i) => ({
				title: `Result ${i + 1} for "${query}"`,
				url: `https://example.com/search?q=${encodeURIComponent(query)}&p=${i + 1}`,
				snippet: `This is a snippet of search result ${i + 1} containing information about ${query}...`,
				date: new Date().toISOString()
			}));
			
			return {
				query,
				count: results.length,
				results
			};
		} catch (error) {
			throw new Error(`Web search failed: ${error.message}`);
		}
	}
};

/**
 * Calculator Tool
 * Performs mathematical calculations
 */
export const calculatorTool: MCPTool = {
	name: 'calculator',
	description: 'Perform mathematical calculations using a safe expression evaluator',
	parameters: {
		type: 'object',
		properties: {
			expression: {
				type: 'string',
				description: 'Mathematical expression to evaluate (e.g., "2 + 2 * 3")'
			}
		},
		required: ['expression']
	},
	handler: async (params) => {
		const { expression } = params;
		
		try {
			// Safe mathematical expression evaluation
			// Remove any non-mathematical characters for security
			const safeExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
			
			// Use Function constructor for safe evaluation
			const result = new Function('return ' + safeExpression)();
			
			if (!isFinite(result)) {
				throw new Error('Invalid calculation result');
			}
			
			return {
				expression: safeExpression,
				result,
				formatted: result.toLocaleString()
			};
		} catch (error) {
			throw new Error(`Calculation failed: ${error.message}`);
		}
	}
};

/**
 * DateTime Tool
 * Provides current date and time information
 */
export const dateTimeTool: MCPTool = {
	name: 'datetime',
	description: 'Get current date and time information',
	parameters: {
		type: 'object',
		properties: {
			timezone: {
				type: 'string',
				description: 'Timezone to use (e.g., "America/New_York", "Asia/Seoul")',
				default: 'UTC'
			},
			format: {
				type: 'string',
				description: 'Format for the output (iso, local, relative)',
				enum: ['iso', 'local', 'relative'],
				default: 'iso'
			}
		}
	},
	handler: async (params) => {
		const { timezone = 'UTC', format = 'iso' } = params;
		
		try {
			const now = new Date();
			
			// Get timezone offset
			const options: Intl.DateTimeFormatOptions = {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false
			};
			
			let formatted: string;
			
			switch (format) {
				case 'iso':
					formatted = now.toISOString();
					break;
				
				case 'local':
					formatted = new Intl.DateTimeFormat('en-US', options).format(now);
					break;
				
				case 'relative':
					// Simple relative time
					const seconds = Math.floor(now.getTime() / 1000);
					formatted = `${seconds} seconds since epoch`;
					break;
				
				default:
					formatted = now.toString();
			}
			
			return {
				timestamp: now.getTime(),
				iso: now.toISOString(),
				timezone,
				formatted,
				year: now.getFullYear(),
				month: now.getMonth() + 1,
				day: now.getDate(),
				hour: now.getHours(),
				minute: now.getMinutes(),
				second: now.getSeconds(),
				dayOfWeek: now.getDay()
			};
		} catch (error) {
			throw new Error(`DateTime operation failed: ${error.message}`);
		}
	}
};

/**
 * Code Executor Tool
 * Executes simple code snippets (JavaScript only for security)
 */
export const codeExecutorTool: MCPTool = {
	name: 'code_executor',
	description: 'Execute simple JavaScript code snippets safely',
	parameters: {
		type: 'object',
		properties: {
			code: {
				type: 'string',
				description: 'JavaScript code to execute'
			},
			timeout: {
				type: 'number',
				description: 'Execution timeout in milliseconds',
				default: 5000,
				maximum: 10000
			}
		},
		required: ['code']
	},
	handler: async (params) => {
		const { code, timeout = 5000 } = params;
		
		try {
			// Create a safe execution environment
			const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
			
			// Wrap code in async function with timeout
			const wrappedCode = `
				const console = {
					log: (...args) => logs.push(args.map(a => String(a)).join(' ')),
					error: (...args) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
					warn: (...args) => logs.push('[WARN] ' + args.map(a => String(a)).join(' '))
				};
				const logs = [];
				
				${code}
				
				return { logs, result: typeof result !== 'undefined' ? result : undefined };
			`;
			
			// Execute with timeout
			const executeWithTimeout = new Promise((resolve, reject) => {
				const timer = setTimeout(() => {
					reject(new Error('Code execution timeout'));
				}, timeout);
				
				try {
					const fn = new AsyncFunction(wrappedCode);
					fn().then((result) => {
						clearTimeout(timer);
						resolve(result);
					}).catch((error) => {
						clearTimeout(timer);
						reject(error);
					});
				} catch (error) {
					clearTimeout(timer);
					reject(error);
				}
			});
			
			const { logs, result } = await executeWithTimeout as any;
			
			return {
				success: true,
				logs,
				result,
				executionTime: Date.now()
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
				logs: [],
				executionTime: Date.now()
			};
		}
	}
};

/**
 * Memory Tool
 * Stores and retrieves information in conversation memory
 */
export const memoryTool: MCPTool = {
	name: 'memory',
	description: 'Store and retrieve information in conversation memory',
	parameters: {
		type: 'object',
		properties: {
			action: {
				type: 'string',
				description: 'Action to perform',
				enum: ['store', 'retrieve', 'delete', 'list']
			},
			key: {
				type: 'string',
				description: 'Memory key (required for store, retrieve, delete)'
			},
			value: {
				type: 'any',
				description: 'Value to store (required for store action)'
			},
			tags: {
				type: 'array',
				items: { type: 'string' },
				description: 'Tags for categorizing memory items'
			}
		},
		required: ['action']
	},
	handler: async (params) => {
		const { action, key, value, tags = [] } = params;
		
		// In-memory storage (in production, this would use a persistent store)
		const memoryStore = globalThis.__mcpMemoryStore || (globalThis.__mcpMemoryStore = new Map());
		
		try {
			switch (action) {
				case 'store':
					if (!key) throw new Error('Key is required for store action');
					
					const memoryItem = {
						key,
						value,
						tags,
						timestamp: Date.now(),
						updated: Date.now()
					};
					
					memoryStore.set(key, memoryItem);
					
					return {
						success: true,
						action: 'stored',
						key,
						timestamp: memoryItem.timestamp
					};
				
				case 'retrieve':
					if (!key) throw new Error('Key is required for retrieve action');
					
					const item = memoryStore.get(key);
					
					if (!item) {
						return {
							success: false,
							action: 'retrieve',
							key,
							error: 'Key not found'
						};
					}
					
					return {
						success: true,
						action: 'retrieved',
						key,
						value: item.value,
						tags: item.tags,
						timestamp: item.timestamp,
						updated: item.updated
					};
				
				case 'delete':
					if (!key) throw new Error('Key is required for delete action');
					
					const deleted = memoryStore.delete(key);
					
					return {
						success: deleted,
						action: 'deleted',
						key
					};
				
				case 'list':
					const items = Array.from(memoryStore.entries()).map(([k, v]) => ({
						key: k,
						tags: v.tags,
						timestamp: v.timestamp,
						updated: v.updated
					}));
					
					// Filter by tags if provided
					const filtered = tags.length > 0
						? items.filter(item => 
							item.tags.some(tag => tags.includes(tag))
						)
						: items;
					
					return {
						success: true,
						action: 'list',
						count: filtered.length,
						items: filtered
					};
				
				default:
					throw new Error(`Unknown action: ${action}`);
			}
		} catch (error) {
			throw new Error(`Memory operation failed: ${error.message}`);
		}
	}
};

/**
 * URL Fetch Tool
 * Fetches content from URLs
 */
export const urlFetchTool: MCPTool = {
	name: 'url_fetch',
	description: 'Fetch content from a URL',
	parameters: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'URL to fetch'
			},
			method: {
				type: 'string',
				description: 'HTTP method',
				enum: ['GET', 'POST', 'PUT', 'DELETE'],
				default: 'GET'
			},
			headers: {
				type: 'object',
				description: 'HTTP headers',
				additionalProperties: { type: 'string' }
			},
			body: {
				type: 'any',
				description: 'Request body (for POST/PUT)'
			},
			format: {
				type: 'string',
				description: 'Response format',
				enum: ['text', 'json', 'html'],
				default: 'text'
			}
		},
		required: ['url']
	},
	handler: async (params) => {
		const { url, method = 'GET', headers = {}, body, format = 'text' } = params;
		
		try {
			// Validate URL
			const urlObj = new URL(url);
			
			// Only allow HTTPS for security
			if (urlObj.protocol !== 'https:') {
				throw new Error('Only HTTPS URLs are allowed');
			}
			
			const options: RequestInit = {
				method,
				headers: {
					'User-Agent': 'MCP-Client/1.0',
					...headers
				}
			};
			
			if (body && ['POST', 'PUT'].includes(method)) {
				options.body = typeof body === 'string' ? body : JSON.stringify(body);
				if (!headers['Content-Type']) {
					options.headers['Content-Type'] = 'application/json';
				}
			}
			
			const response = await fetch(url, options);
			
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			let content: any;
			
			switch (format) {
				case 'json':
					content = await response.json();
					break;
				
				case 'html':
				case 'text':
				default:
					content = await response.text();
					break;
			}
			
			return {
				success: true,
				url,
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
				content,
				contentType: response.headers.get('content-type'),
				contentLength: response.headers.get('content-length')
			};
		} catch (error) {
			throw new Error(`URL fetch failed: ${error.message}`);
		}
	}
};

/**
 * Get all available tools
 */
export function getAllTools(): MCPTool[] {
	return [
		webSearchTool,
		calculatorTool,
		dateTimeTool,
		codeExecutorTool,
		memoryTool,
		urlFetchTool
	];
}

/**
 * Get tool by name
 */
export function getToolByName(name: string): MCPTool | undefined {
	return getAllTools().find(tool => tool.name === name);
}

// Declare global type for memory store
declare global {
	var __mcpMemoryStore: Map<string, any> | undefined;
}