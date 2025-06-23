/**
 * AI Chat Stores
 * 
 * Svelte stores for managing AI chat state
 */

import { writable, type Writable } from 'svelte/store';
import type { ChatConversation, ChatMessage } from '$lib/services/aiChatService';

// AI Chat Modal visibility
export const showAIChatModal = writable(false);

// Current AI chat state
export const aiChatService: Writable<any> = writable(null);
export const currentAIConversation: Writable<ChatConversation | null> = writable(null);
export const aiConversations: Writable<ChatConversation[]> = writable([]);

// AI Server connection status
export const aiServerConnected = writable(false);
export const aiServerStatus: Writable<{
	openai_available: boolean;
	ollama_available: boolean;
	total_models: number;
	timestamp: number;
} | null> = writable(null);

// AI Chat preferences
export const aiChatSettings = writable({
	defaultProvider: 'openai' as 'openai' | 'ollama',
	enableStreaming: true,
	autoScroll: true,
	maxConversations: 50
});

// AI Chat UI state
export const aiChatLoading = writable(false);
export const aiChatError: Writable<string | null> = writable(null);

// Helper functions for AI Chat stores
export const aiChatStoreHelpers = {
	// Open AI Chat Modal
	openModal: () => {
		showAIChatModal.set(true);
	},

	// Close AI Chat Modal
	closeModal: () => {
		showAIChatModal.set(false);
	},

	// Set connection status
	setConnectionStatus: (connected: boolean) => {
		aiServerConnected.set(connected);
	},

	// Set server status
	setServerStatus: (status: any) => {
		aiServerStatus.set(status);
	},

	// Set loading state
	setLoading: (loading: boolean) => {
		aiChatLoading.set(loading);
	},

	// Set error state
	setError: (error: string | null) => {
		aiChatError.set(error);
	},

	// Update conversations
	updateConversations: (conversations: ChatConversation[]) => {
		aiConversations.set(conversations);
	},

	// Set current conversation
	setCurrentConversation: (conversation: ChatConversation | null) => {
		currentAIConversation.set(conversation);
	},

	// Clear all AI chat data
	clearAll: () => {
		currentAIConversation.set(null);
		aiConversations.set([]);
		aiServerConnected.set(false);
		aiServerStatus.set(null);
		aiChatError.set(null);
		aiChatService.set(null);
	}
};