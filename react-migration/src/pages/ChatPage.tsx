import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ChatContainer from '../components/chat/ChatContainer';
import ChatInput from '../components/chat/ChatInput';
import { useChat } from '../contexts/ChatContext';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    getCurrentChat,
    selectChat,
    createChat,
    sendMessage,
    regenerateMessage,
    stopGeneration,
    isGenerating,
  } = useChat();

  const currentChat = getCurrentChat();

  // Handle chat selection/creation
  useEffect(() => {
    if (id) {
      selectChat(id);
    } else {
      // If no chat ID in URL, create a new chat
      createChat().then((chatId) => {
        navigate(`/c/${chatId}`, { replace: true });
      });
    }
  }, [id, selectChat, createChat, navigate]);

  const handleSendMessage = async (content: string, files?: File[]) => {
    await sendMessage(content, files);
  };

  const handleStopGeneration = () => {
    stopGeneration();
  };

  const handleRegenerate = (messageId: string) => {
    regenerateMessage(messageId);
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const handleRate = (messageId: string, rating: 'up' | 'down') => {
    console.log('Rate message:', messageId, rating);
  };

  const isEmptyChat = !currentChat || currentChat.messages.length === 0;

  return (
    <div className="flex h-screen w-full flex-col">
      {/* Chat Content */}
      <div className="flex h-full w-full flex-col">
        {isEmptyChat ? (
          /* Empty State - Original Open WebUI Style */
          <div className="flex h-full flex-col justify-center">
            <div className="flex flex-col items-center justify-center px-6 text-center">
              <div className="mb-4">
                <div className="flex size-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <svg className="size-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z" />
                  </svg>
                </div>
              </div>
              <div className="mb-8">
                <h1 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-gray-100">
                  How can I help you today?
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                  Ask me anything, or get started with these suggestions
                </p>
              </div>
              
              {/* Suggestion Cards */}
              <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
                <button className="group flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Creative Writing</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Help me write a story about space exploration</p>
                  </div>
                </button>
                
                <button className="group flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Code Assistant</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Review my Python code for optimization</p>
                  </div>
                </button>
                
                <button className="group flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Learning</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Explain quantum computing in simple terms</p>
                  </div>
                </button>
                
                <button className="group flex items-start gap-3 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400">
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">Analysis</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Analyze market trends for tech stocks</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="flex-1 overflow-hidden">
            <ChatContainer
              messages={currentChat.messages}
              isLoading={isGenerating}
              onRegenerate={handleRegenerate}
              onCopy={handleCopy}
              onRate={handleRate}
            />
          </div>
        )}

        {/* Chat Input - Fixed at bottom */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
          <ChatInput
            onSendMessage={handleSendMessage}
            isLoading={isGenerating}
            onStopGeneration={handleStopGeneration}
            placeholder="HMR 테스트 중입니다... (Shift+Enter로 줄바꿈)"
          />
        </div>
      </div>
    </div>
  );
}