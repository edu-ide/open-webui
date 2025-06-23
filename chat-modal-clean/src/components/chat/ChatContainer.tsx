import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import ChatMessage from './ChatMessage';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

interface ChatContainerProps {
  messages: Message[];
  isLoading?: boolean;
  onRegenerate?: (messageId: string) => void;
  onCopy?: (content: string) => void;
  onRate?: (messageId: string, rating: 'up' | 'down') => void;
  loadingMessage?: string;
}

export default function ChatContainer({
  messages,
  isLoading = false,
  onRegenerate,
  onCopy,
  onRate,
  loadingMessage,
}: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollToBottom();
    }
  }, [messages, isAtBottom]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    setIsAtBottom(isNearBottom);
    setShowScrollButton(!isNearBottom && messages.length > 0);
  };

  const handleRegenerate = (messageId: string) => {
    onRegenerate?.(messageId);
  };

  const handleCopy = (content: string) => {
    onCopy?.(content);
  };

  const handleRate = (messageId: string, rating: 'up' | 'down') => {
    onRate?.(messageId, rating);
  };

  return (
    <div className="relative flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
          {messages.map((message, index) => (
            <ChatMessage
              key={message.id}
              id={message.id}
              content={message.content}
              role={message.role}
              timestamp={message.timestamp}
              isLast={index === messages.length - 1}
              onRegenerate={() => handleRegenerate(message.id)}
              onCopy={() => handleCopy(message.content)}
              onRate={(rating) => handleRate(message.id, rating)}
            />
          ))}

          {/* Loading Message */}
          {isLoading && (
            <ChatMessage
              id="loading"
              content={loadingMessage || ""}
              role="assistant"
              timestamp={new Date()}
              isLoading={true}
            />
          )}
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 z-10 flex size-10 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
        >
          <ChevronDownIcon className="size-5" />
        </button>
      )}
    </div>
  );
}