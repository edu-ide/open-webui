<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import { toast } from 'svelte-sonner';
	
	import { EnhancedAIChatService, type EnhancedChatConversation, type EnhancedChatMessage } from '$lib/services/enhancedAIChatService';
	import { healthCheck, getModelsStatus } from '$lib/apis/aiserver';
	import { user } from '$lib/stores';
	import { mcpStatus, mcpToolsList, mcpContextsList, mcpError } from '$lib/stores/mcp';
	
	import Modal from '../common/Modal.svelte';
	import Spinner from '../common/Spinner.svelte';
	
	export let show = false;
	export let onClose = () => {};
	
	// Service and state
	let aiChatService: EnhancedAIChatService | null = null;
	let currentConversation: EnhancedChatConversation | null = null;
	let conversations: EnhancedChatConversation[] = [];
	let isLoading = false;
	let isConnected = false;
	let connectionError = '';
	
	// UI state
	let messageInput = '';
	let chatContainer: HTMLElement;
	let selectedProvider: 'openai' | 'ollama' = 'openai';
	let isStreaming = false;
	let enableTools = true;
	let enableContext = true;
	
	// Reactive stores
	const messages = writable<EnhancedChatMessage[]>([]);
	const modelStatus = writable<any>(null);
	
	onMount(async () => {
		if ($user?.token) {
			await initializeAIChat();
		}
	});
	
	onDestroy(() => {
		cleanup();
	});
	
	async function initializeAIChat() {
		try {
			isLoading = true;
			connectionError = '';
			
			// Initialize Enhanced AI Chat Service with MCP
			aiChatService = new EnhancedAIChatService($user.token);
			
			// Initialize MCP connection
			try {
				await aiChatService.initialize();
			} catch (mcpError) {
				console.warn('MCP initialization failed, continuing without MCP:', mcpError);
			}
			
			// Check AI Server health
			const health = await healthCheck();
			isConnected = health.status === 'UP';
			
			if (isConnected) {
				// Get model status
				const status = await getModelsStatus($user.token);
				modelStatus.set(status);
				
				// Load existing conversations
				conversations = aiChatService.getAllConversations() as EnhancedChatConversation[];
				
				const mcpEnabled = aiChatService.isMCPEnabled();
				if (mcpEnabled) {
					toast.success('AI Chat connected with MCP tools');
				} else {
					toast.success('AI Chat connected');
				}
			} else {
				connectionError = 'AI Server is not available';
			}
		} catch (error) {
			console.error('Failed to initialize AI Chat:', error);
			connectionError = `Connection failed: ${error.message}`;
			isConnected = false;
		} finally {
			isLoading = false;
		}
	}
	
	async function cleanup() {
		if (aiChatService) {
			await aiChatService.cleanup();
		}
		aiChatService = null;
		currentConversation = null;
		conversations = [];
	}
	
	function createNewConversation() {
		if (!aiChatService) return;
		
		const conversation = aiChatService.createConversation() as EnhancedChatConversation;
		conversations = aiChatService.getAllConversations() as EnhancedChatConversation[];
		selectConversation(conversation);
	}
	
	function selectConversation(conversation: EnhancedChatConversation) {
		currentConversation = conversation;
		messages.set(conversation.messages);
		
		// Auto-scroll to bottom
		setTimeout(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 100);
	}
	
	async function sendMessage() {
		if (!messageInput.trim() || !aiChatService || !currentConversation) return;
		
		const message = messageInput.trim();
		messageInput = '';
		
		try {
			if (isStreaming) {
				// Use enhanced streaming with MCP
				await aiChatService.sendEnhancedStreamingMessage(
					currentConversation.id,
					message,
					selectedProvider,
					(chunk, metadata) => {
						// Update messages reactively
						messages.set([...currentConversation!.messages]);
						scrollToBottom();
					},
					(assistantMessage) => {
						messages.set([...currentConversation!.messages]);
						scrollToBottom();
						
						// Show tool usage if any
						if (assistantMessage.tools_used && assistantMessage.tools_used.length > 0) {
							toast.success(`Message sent (used tools: ${assistantMessage.tools_used.join(', ')})`);
						} else {
							toast.success('Message sent');
						}
					},
					(error) => {
						toast.error(`Failed to send message: ${error.message}`);
					},
					enableContext,
					enableTools
				);
			} else {
				// Use enhanced message with MCP
				const response = await aiChatService.sendEnhancedMessage(
					currentConversation.id, 
					message, 
					selectedProvider,
					enableContext,
					enableTools
				);
				messages.set([...currentConversation.messages]);
				scrollToBottom();
				
				// Show tool usage if any
				if (response.tools_used && response.tools_used.length > 0) {
					toast.success(`Message sent (used tools: ${response.tools_used.join(', ')})`);
				} else {
					toast.success('Message sent');
				}
			}
			
			// Update conversations list
			conversations = aiChatService.getAllConversations() as EnhancedChatConversation[];
			
		} catch (error) {
			console.error('Failed to send message:', error);
			toast.error(`Failed to send message: ${error.message}`);
		}
	}
	
	function scrollToBottom() {
		setTimeout(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 100);
	}
	
	function deleteConversation(conversationId: string) {
		if (!aiChatService) return;
		
		aiChatService.deleteConversation(conversationId);
		conversations = aiChatService.getAllConversations() as EnhancedChatConversation[];
		
		if (currentConversation?.id === conversationId) {
			currentConversation = null;
			messages.set([]);
		}
		
		toast.success('Conversation deleted');
	}
	
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}
	
	// Auto-create first conversation when modal opens
	$: if (show && aiChatService && conversations.length === 0) {
		createNewConversation();
	}
</script>

<Modal size="xl" bind:show>
	<div slot="header" class="flex items-center justify-between">
		<div class="flex items-center space-x-3">
			<div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
				<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
			</div>
			<div>
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">AI Chat</h2>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					Powered by {selectedProvider === 'openai' ? 'Gemini Flash' : 'Ollama'}
					{#if isConnected}
						<span class="inline-flex items-center ml-2">
							<span class="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
							Connected
						</span>
					{:else}
						<span class="inline-flex items-center ml-2">
							<span class="w-2 h-2 bg-red-500 rounded-full mr-1"></span>
							Disconnected
						</span>
					{/if}
				</p>
			</div>
		</div>
		
		<div class="flex items-center space-x-2">
			<!-- Provider Selector -->
			<select bind:value={selectedProvider} class="px-3 py-1 text-sm border rounded-lg dark:bg-gray-700 dark:border-gray-600">
				<option value="openai">Gemini Flash</option>
				<option value="ollama">Ollama</option>
			</select>
			
			<!-- Streaming Toggle -->
			<label class="flex items-center space-x-2 text-sm">
				<input type="checkbox" bind:checked={isStreaming} class="rounded" />
				<span>Stream</span>
			</label>
			
			<!-- MCP Tools Toggle -->
			{#if aiChatService?.isMCPEnabled()}
				<label class="flex items-center space-x-2 text-sm">
					<input type="checkbox" bind:checked={enableTools} class="rounded" />
					<span>Tools</span>
				</label>
			{/if}
			
			<!-- MCP Status -->
			{#if $mcpStatus !== 'disconnected'}
				<div class="flex items-center text-xs">
					<span class="w-2 h-2 rounded-full mr-1 {$mcpStatus === 'authenticated' ? 'bg-green-500' : $mcpStatus === 'connected' ? 'bg-yellow-500' : 'bg-red-500'}"></span>
					MCP: {$mcpStatus}
				</div>
			{/if}
		</div>
	</div>

	<div slot="content" class="h-96 flex">
		{#if isLoading}
			<div class="flex-1 flex items-center justify-center">
				<Spinner className="w-8 h-8" />
				<span class="ml-2">Connecting to AI Server...</span>
			</div>
		{:else if !isConnected}
			<div class="flex-1 flex items-center justify-center">
				<div class="text-center">
					<div class="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
						<svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L5.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Connection Failed</h3>
					<p class="text-gray-600 dark:text-gray-400 mb-4">{connectionError}</p>
					<button 
						on:click={initializeAIChat}
						class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
					>
						Retry Connection
					</button>
				</div>
			</div>
		{:else}
			<!-- Sidebar with conversations -->
			<div class="w-64 border-r border-gray-200 dark:border-gray-700 flex flex-col">
				<div class="p-4 border-b border-gray-200 dark:border-gray-700">
					<button 
						on:click={createNewConversation}
						class="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
					>
						New Chat
					</button>
				</div>
				
				<div class="flex-1 overflow-y-auto p-2">
					{#each conversations as conversation (conversation.id)}
						<div 
							class="p-3 rounded-lg cursor-pointer transition-colors mb-2 {currentConversation?.id === conversation.id ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}"
							on:click={() => selectConversation(conversation)}
						>
							<div class="flex items-center justify-between">
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
										{conversation.title}
									</p>
									<p class="text-xs text-gray-500 dark:text-gray-400">
										{conversation.messages.length} messages
									</p>
								</div>
								<button 
									on:click|stopPropagation={() => deleteConversation(conversation.id)}
									class="ml-2 p-1 text-gray-400 hover:text-red-600 transition-colors"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Chat area -->
			<div class="flex-1 flex flex-col">
				{#if currentConversation}
					<!-- Messages -->
					<div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
						{#each $messages as message (message.id)}
							<div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
								<div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg {message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'}">
									<div class="text-sm whitespace-pre-wrap">{message.content}</div>
									{#if message.role === 'assistant'}
										<div class="text-xs opacity-70 mt-1">
											{#if message.model}
												{message.provider} • {message.model}
											{/if}
											{#if message.tools_used && message.tools_used.length > 0}
												<span class="ml-2">🔧 {message.tools_used.join(', ')}</span>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
					
					<!-- Input area -->
					<div class="p-4 border-t border-gray-200 dark:border-gray-700">
						<div class="flex space-x-2">
							<textarea
								bind:value={messageInput}
								on:keypress={handleKeyPress}
								placeholder="Type your message..."
								rows="2"
								class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
							></textarea>
							<button 
								on:click={sendMessage}
								disabled={!messageInput.trim()}
								class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
								</svg>
							</button>
						</div>
					</div>
				{:else}
					<div class="flex-1 flex items-center justify-center">
						<div class="text-center">
							<div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
								<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.965 8.965 0 01-4.126-1.004L3 21l1.996-5.874A7.963 7.963 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
								</svg>
							</div>
							<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Start a Conversation</h3>
							<p class="text-gray-600 dark:text-gray-400 mb-4">Select a conversation or create a new one to begin chatting</p>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</Modal>