import React, { useState, useRef, useEffect } from 'react';
import { aiServerApi, AiServerUtils } from '../../api/aiserver-client';
import type { ChatRequest, ChatResponse, FunctionChatRequest } from '../../api/aiserver-client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  model?: string;
  isStreaming?: boolean;
}

interface AiServerChatComponentProps {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  enableFunctions?: boolean;
  defaultModel?: 'openai' | 'ollama';
}

export const AiServerChatComponent: React.FC<AiServerChatComponentProps> = ({
  className = '',
  placeholder = 'AI에게 메시지를 보내세요...',
  autoFocus = false,
  enableFunctions = true,
  defaultModel = 'openai'
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'openai' | 'ollama'>(defaultModel);
  const [enableStreaming, setEnableStreaming] = useState(true);
  const [availableModels, setAvailableModels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 메시지 목록 끝으로 스크롤
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 컴포넌트 마운트 시 사용 가능한 모델 조회
  useEffect(() => {
    loadAvailableModels();
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const loadAvailableModels = async () => {
    try {
      const response = await aiServerApi.getAvailableModels();
      if (AiServerUtils.isSuccessResponse(response)) {
        setAvailableModels(response.data?.models || {});
      }
    } catch (error) {
      console.error('Failed to load available models:', error);
    }
  };

  const generateMessageId = () => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const createMessage = (role: ChatMessage['role'], content: string, model?: string): ChatMessage => {
    return {
      id: generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      model,
    };
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = createMessage('user', inputValue);
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setError(null);

    try {
      if (enableStreaming) {
        await handleStreamingResponse(inputValue);
      } else {
        await handleRegularResponse(inputValue);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setError(error instanceof Error ? error.message : '메시지 전송 중 오류가 발생했습니다.');
      
      // 오류 메시지 추가
      const errorMessage = createMessage('system', `오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegularResponse = async (message: string) => {
    const request: ChatRequest | FunctionChatRequest = {
      message,
      model: selectedModel,
    };

    const response = enableFunctions 
      ? await aiServerApi.functionChat(request)
      : await aiServerApi.chat(request as ChatRequest);

    if (AiServerUtils.isSuccessResponse(response)) {
      const aiMessage = createMessage('assistant', response.data?.response || response.data, selectedModel);
      setMessages(prev => [...prev, aiMessage]);
    } else if (AiServerUtils.isErrorResponse(response)) {
      throw new Error(response.error);
    } else {
      // ChatResponse 형태의 응답 처리
      const chatResponse = response as ChatResponse;
      if (chatResponse.success && chatResponse.response) {
        const aiMessage = createMessage('assistant', chatResponse.response, chatResponse.model);
        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error('응답 형식이 올바르지 않습니다.');
      }
    }
  };

  const handleStreamingResponse = async (message: string) => {
    const request: ChatRequest = {
      message,
      model: selectedModel,
    };

    // 스트리밍 응답을 위한 빈 메시지 생성
    const aiMessageId = generateMessageId();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      model: selectedModel,
      isStreaming: true,
    };

    setMessages(prev => [...prev, aiMessage]);

    const stream = aiServerApi.streamChat(request);
    let fullResponse = '';

    try {
      await AiServerUtils.processStream(
        stream,
        (chunk) => {
          // JSON 응답에서 실제 텍스트 추출
          try {
            const parsed = JSON.parse(chunk);
            const responseText = parsed.response || parsed.content || chunk;
            fullResponse += responseText;
            
            setMessages(prev => 
              prev.map(msg => 
                msg.id === aiMessageId 
                  ? { ...msg, content: fullResponse }
                  : msg
              )
            );
          } catch {
            // JSON 파싱 실패 시 원본 텍스트 사용
            fullResponse += chunk;
            setMessages(prev => 
              prev.map(msg => 
                msg.id === aiMessageId 
                  ? { ...msg, content: fullResponse }
                  : msg
              )
            );
          }
        },
        () => {
          // 스트리밍 완료
          setMessages(prev => 
            prev.map(msg => 
              msg.id === aiMessageId 
                ? { ...msg, isStreaming: false }
                : msg
            )
          );
        },
        (error) => {
          console.error('Streaming error:', error);
          setMessages(prev => 
            prev.map(msg => 
              msg.id === aiMessageId 
                ? { ...msg, content: `오류: ${error.message}`, isStreaming: false }
                : msg
            )
          );
        }
      );
    } catch (error) {
      throw error;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const testConnection = async () => {
    try {
      setIsLoading(true);
      const response = await aiServerApi.healthCheck();
      if (AiServerUtils.isSuccessResponse(response)) {
        const successMessage = createMessage('system', '✅ AI 서버 연결 테스트 성공');
        setMessages(prev => [...prev, successMessage]);
      } else {
        throw new Error('Health check failed');
      }
    } catch (error) {
      const errorMessage = createMessage('system', `❌ AI 서버 연결 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`ai-server-chat flex flex-col h-full ${className}`}>
      {/* 헤더 */}
      <div className="chat-header border-b border-gray-200 p-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            AI Chat {enableFunctions && '(Functions Enabled)'}
          </h2>
          <div className="flex items-center space-x-2">
            {/* 모델 선택 */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as 'openai' | 'ollama')}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama</option>
            </select>
            
            {/* 스트리밍 토글 */}
            <label className="flex items-center text-sm">
              <input
                type="checkbox"
                checked={enableStreaming}
                onChange={(e) => setEnableStreaming(e.target.checked)}
                className="mr-2"
              />
              스트리밍
            </label>
            
            {/* 컨트롤 버튼들 */}
            <button
              onClick={testConnection}
              disabled={isLoading}
              className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 text-sm"
            >
              연결 테스트
            </button>
            <button
              onClick={clearChat}
              className="px-3 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
            >
              채팅 지우기
            </button>
          </div>
        </div>
        
        {/* 오류 표시 */}
        {error && (
          <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* 메시지 목록 */}
      <div className="messages-container flex-1 overflow-y-auto p-4 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p>AI와 대화를 시작하세요!</p>
            <p className="text-sm mt-2">
              {enableFunctions ? '함수 호출이 활성화되어 있습니다.' : '기본 채팅 모드입니다.'}
            </p>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message mb-4 ${
              message.role === 'user' ? 'text-right' : 'text-left'
            }`}
          >
            <div
              className={`inline-block max-w-[80%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : message.role === 'system'
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                  : 'bg-white text-gray-900 border border-gray-200'
              }`}
            >
              <div className="message-content whitespace-pre-wrap">
                {message.content}
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 bg-current opacity-75 animate-pulse ml-1">|</span>
                )}
              </div>
              <div className="message-meta text-xs opacity-75 mt-1">
                {formatTimestamp(message.timestamp)}
                {message.model && ` • ${message.model}`}
                {message.isStreaming && ' • 입력 중...'}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="input-area border-t border-gray-200 p-4 bg-white">
        <div className="flex space-x-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            disabled={isLoading}
            className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '전송 중...' : '전송'}
          </button>
        </div>
        
        {/* 상태 정보 */}
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>
            모델: {selectedModel} | 함수 호출: {enableFunctions ? '활성화' : '비활성화'} | 스트리밍: {enableStreaming ? '활성화' : '비활성화'}
          </span>
          <span>
            Shift + Enter로 줄바꿈
          </span>
        </div>
      </div>
    </div>
  );
};

export default AiServerChatComponent;