import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Types
interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata?: {
    model?: string;
    tokens?: number;
    processing_time?: number;
  };
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  created_at: Date;
  updated_at: Date;
  metadata?: {
    model?: string;
    system_prompt?: string;
  };
}

interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  isLoading: boolean;
  isGenerating: boolean;
  currentModel: string;
  systemPrompt: string;
}

interface ChatContextType extends ChatState {
  // Chat management
  createChat: (title?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  selectChat: (chatId: string) => void;
  updateChatTitle: (chatId: string, title: string) => Promise<void>;
  clearChats: () => Promise<void>;
  
  // Message management
  sendMessage: (content: string, files?: File[]) => Promise<void>;
  regenerateMessage: (messageId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  stopGeneration: () => void;
  
  // Settings
  setModel: (model: string) => void;
  setSystemPrompt: (prompt: string) => void;
  
  // Utilities
  getCurrentChat: () => Chat | null;
  getAllChats: () => Chat[];
  exportChat: (chatId: string) => Promise<string>;
  importChat: (data: string) => Promise<void>;
}

// Initial state
const initialState: ChatState = {
  chats: [],
  currentChatId: null,
  isLoading: false,
  isGenerating: false,
  currentModel: 'gpt-3.5-turbo',
  systemPrompt: '',
};

// Actions
type ChatAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_CHATS'; payload: Chat[] }
  | { type: 'ADD_CHAT'; payload: Chat }
  | { type: 'UPDATE_CHAT'; payload: { id: string; updates: Partial<Chat> } }
  | { type: 'DELETE_CHAT'; payload: string }
  | { type: 'SELECT_CHAT'; payload: string | null }
  | { type: 'ADD_MESSAGE'; payload: { chatId: string; message: Message } }
  | { type: 'UPDATE_MESSAGE'; payload: { chatId: string; messageId: string; updates: Partial<Message> } }
  | { type: 'DELETE_MESSAGE'; payload: { chatId: string; messageId: string } }
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'SET_SYSTEM_PROMPT'; payload: string }
  | { type: 'CLEAR_CHATS' };

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    
    case 'SET_CHATS':
      return { ...state, chats: action.payload };
    
    case 'ADD_CHAT':
      return { 
        ...state, 
        chats: [action.payload, ...state.chats],
        currentChatId: action.payload.id 
      };
    
    case 'UPDATE_CHAT':
      return {
        ...state,
        chats: state.chats.map(chat =>
          chat.id === action.payload.id
            ? { ...chat, ...action.payload.updates, updated_at: new Date() }
            : chat
        ),
      };
    
    case 'DELETE_CHAT':
      const newChats = state.chats.filter(chat => chat.id !== action.payload);
      return {
        ...state,
        chats: newChats,
        currentChatId: state.currentChatId === action.payload 
          ? (newChats.length > 0 ? newChats[0].id : null)
          : state.currentChatId,
      };
    
    case 'SELECT_CHAT':
      return { ...state, currentChatId: action.payload };
    
    case 'ADD_MESSAGE':
      return {
        ...state,
        chats: state.chats.map(chat =>
          chat.id === action.payload.chatId
            ? { 
                ...chat, 
                messages: [...chat.messages, action.payload.message],
                updated_at: new Date()
              }
            : chat
        ),
      };
    
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        chats: state.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: chat.messages.map(msg =>
                  msg.id === action.payload.messageId
                    ? { ...msg, ...action.payload.updates }
                    : msg
                ),
                updated_at: new Date()
              }
            : chat
        ),
      };
    
    case 'DELETE_MESSAGE':
      return {
        ...state,
        chats: state.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: chat.messages.filter(msg => msg.id !== action.payload.messageId),
                updated_at: new Date()
              }
            : chat
        ),
      };
    
    case 'SET_MODEL':
      return { ...state, currentModel: action.payload };
    
    case 'SET_SYSTEM_PROMPT':
      return { ...state, systemPrompt: action.payload };
    
    case 'CLEAR_CHATS':
      return { ...state, chats: [], currentChatId: null };
    
    default:
      return state;
  }
}

// Context
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Provider component
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  // Chat management
  const createChat = useCallback(async (title?: string): Promise<string> => {
    const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newChat: Chat = {
      id: chatId,
      title: title || 'New Chat',
      messages: [],
      created_at: new Date(),
      updated_at: new Date(),
      metadata: {
        model: state.currentModel,
        system_prompt: state.systemPrompt,
      },
    };

    dispatch({ type: 'ADD_CHAT', payload: newChat });
    
    // TODO: Persist to storage/API
    try {
      localStorage.setItem(`chat-${chatId}`, JSON.stringify(newChat));
      const chatIds = JSON.parse(localStorage.getItem('chat-ids') || '[]');
      localStorage.setItem('chat-ids', JSON.stringify([chatId, ...chatIds]));
    } catch (error) {
      console.error('Failed to save chat:', error);
    }

    return chatId;
  }, [state.currentModel, state.systemPrompt]);

  const deleteChat = useCallback(async (chatId: string): Promise<void> => {
    dispatch({ type: 'DELETE_CHAT', payload: chatId });
    
    // TODO: Remove from storage/API
    try {
      localStorage.removeItem(`chat-${chatId}`);
      const chatIds = JSON.parse(localStorage.getItem('chat-ids') || '[]');
      localStorage.setItem('chat-ids', JSON.stringify(chatIds.filter((id: string) => id !== chatId)));
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  }, []);

  const selectChat = useCallback((chatId: string) => {
    dispatch({ type: 'SELECT_CHAT', payload: chatId });
  }, []);

  const updateChatTitle = useCallback(async (chatId: string, title: string): Promise<void> => {
    dispatch({ type: 'UPDATE_CHAT', payload: { id: chatId, updates: { title } } });
    
    // TODO: Persist to storage/API
    try {
      const chatData = localStorage.getItem(`chat-${chatId}`);
      if (chatData) {
        const chat = JSON.parse(chatData);
        chat.title = title;
        chat.updated_at = new Date().toISOString();
        localStorage.setItem(`chat-${chatId}`, JSON.stringify(chat));
      }
    } catch (error) {
      console.error('Failed to update chat title:', error);
    }
  }, []);

  const clearChats = useCallback(async (): Promise<void> => {
    dispatch({ type: 'CLEAR_CHATS' });
    
    // TODO: Clear from storage/API
    try {
      const chatIds = JSON.parse(localStorage.getItem('chat-ids') || '[]');
      chatIds.forEach((id: string) => {
        localStorage.removeItem(`chat-${id}`);
      });
      localStorage.removeItem('chat-ids');
    } catch (error) {
      console.error('Failed to clear chats:', error);
    }
  }, []);

  // Message management
  const sendMessage = useCallback(async (content: string, _files?: File[]): Promise<void> => {
    let chatId = state.currentChatId;
    
    // Create new chat if none exists
    if (!chatId) {
      chatId = await createChat();
    }

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      content,
      role: 'user',
      timestamp: new Date(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: { chatId, message: userMessage } });
    dispatch({ type: 'SET_GENERATING', payload: true });

    try {
      // TODO: Send to AI API
      // Simulate AI response for now
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      
      const aiMessage: Message = {
        id: `msg-${Date.now()}-ai`,
        content: `AI 응답: "${content}"에 대한 답변입니다.\n\n이것은 시뮬레이션된 응답입니다. 실제 AI API 연동 시 실제 응답으로 대체됩니다.`,
        role: 'assistant',
        timestamp: new Date(),
        metadata: {
          model: state.currentModel,
          tokens: Math.floor(Math.random() * 1000) + 100,
          processing_time: Math.floor(Math.random() * 3000) + 500,
        },
      };

      dispatch({ type: 'ADD_MESSAGE', payload: { chatId, message: aiMessage } });
      
      // Auto-generate title for first message
      if (state.chats.find(c => c.id === chatId)?.messages.length === 0) {
        const title = content.length > 50 ? content.substring(0, 47) + '...' : content;
        await updateChatTitle(chatId, title);
      }

    } catch (error) {
      console.error('Failed to send message:', error);
      // TODO: Show error message
    } finally {
      dispatch({ type: 'SET_GENERATING', payload: false });
    }
  }, [state.currentChatId, state.currentModel, createChat, updateChatTitle, state.chats]);

  const regenerateMessage = useCallback(async (messageId: string): Promise<void> => {
    // TODO: Implement message regeneration
    console.log('Regenerating message:', messageId);
  }, []);

  const deleteMessage = useCallback(async (messageId: string): Promise<void> => {
    const chatId = state.currentChatId;
    if (!chatId) return;

    dispatch({ type: 'DELETE_MESSAGE', payload: { chatId, messageId } });
  }, [state.currentChatId]);

  const stopGeneration = useCallback(() => {
    dispatch({ type: 'SET_GENERATING', payload: false });
    // TODO: Cancel API request
  }, []);

  // Settings
  const setModel = useCallback((model: string) => {
    dispatch({ type: 'SET_MODEL', payload: model });
    localStorage.setItem('chat-model', model);
  }, []);

  const setSystemPrompt = useCallback((prompt: string) => {
    dispatch({ type: 'SET_SYSTEM_PROMPT', payload: prompt });
    localStorage.setItem('chat-system-prompt', prompt);
  }, []);

  // Utilities
  const getCurrentChat = useCallback((): Chat | null => {
    if (!state.currentChatId) return null;
    return state.chats.find(chat => chat.id === state.currentChatId) || null;
  }, [state.currentChatId, state.chats]);

  const getAllChats = useCallback((): Chat[] => {
    return [...state.chats].sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
  }, [state.chats]);

  const exportChat = useCallback(async (chatId: string): Promise<string> => {
    const chat = state.chats.find(c => c.id === chatId);
    if (!chat) throw new Error('Chat not found');
    
    return JSON.stringify(chat, null, 2);
  }, [state.chats]);

  const importChat = useCallback(async (data: string): Promise<void> => {
    try {
      const chat: Chat = JSON.parse(data);
      // Generate new ID to avoid conflicts
      chat.id = `chat-${Date.now()}-imported`;
      chat.created_at = new Date();
      chat.updated_at = new Date();
      
      dispatch({ type: 'ADD_CHAT', payload: chat });
    } catch (error) {
      throw new Error('Invalid chat data');
    }
  }, []);

  // Load data on mount
  React.useEffect(() => {
    try {
      const savedModel = localStorage.getItem('chat-model');
      if (savedModel) {
        dispatch({ type: 'SET_MODEL', payload: savedModel });
      }

      const savedPrompt = localStorage.getItem('chat-system-prompt');
      if (savedPrompt) {
        dispatch({ type: 'SET_SYSTEM_PROMPT', payload: savedPrompt });
      }

      // Load chat history
      const chatIds = JSON.parse(localStorage.getItem('chat-ids') || '[]');
      const chats: Chat[] = [];
      
      chatIds.forEach((id: string) => {
        try {
          const chatData = localStorage.getItem(`chat-${id}`);
          if (chatData) {
            const chat = JSON.parse(chatData);
            // Convert date strings back to Date objects
            chat.created_at = new Date(chat.created_at);
            chat.updated_at = new Date(chat.updated_at);
            chat.messages = chat.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }));
            chats.push(chat);
          }
        } catch (error) {
          console.error(`Failed to load chat ${id}:`, error);
        }
      });

      if (chats.length > 0) {
        // Sort by updated_at desc
        chats.sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
        dispatch({ type: 'SET_CHATS', payload: chats });
      }
    } catch (error) {
      console.error('Failed to load chat data:', error);
    }
  }, []);

  const value: ChatContextType = {
    ...state,
    createChat,
    deleteChat,
    selectChat,
    updateChatTitle,
    clearChats,
    sendMessage,
    regenerateMessage,
    deleteMessage,
    stopGeneration,
    setModel,
    setSystemPrompt,
    getCurrentChat,
    getAllChats,
    exportChat,
    importChat,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

// Hook to use chat context
export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}

// Export types
export type { Message, Chat, ChatState, ChatContextType };