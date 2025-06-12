import { useState } from 'react';
import { ClipboardDocumentIcon, ArrowPathIcon, HandThumbUpIcon, HandThumbDownIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatMessageProps {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isLast?: boolean;
  isLoading?: boolean;
  onRegenerate?: () => void;
  onCopy?: () => void;
  onRate?: (rating: 'up' | 'down') => void;
}

export default function ChatMessage({
  content,
  role,
  timestamp,
  isLoading = false,
  onRegenerate,
  onCopy,
  onRate,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`group flex gap-4 p-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="flex size-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {isUser ? 'U' : 'AI'}
          </span>
        </div>
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-3xl ${isUser ? 'text-right' : ''}`}>
        {/* Message Header */}
        <div className={`mb-2 flex items-center gap-2 ${isUser ? 'justify-end' : ''}`}>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {isUser ? '나' : 'Assistant'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(timestamp)}
          </span>
        </div>

        {/* Message Body */}
        <div className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 ${
          isUser ? 'bg-blue-50 dark:bg-blue-900/20' : ''
        }`}>
          {isUser ? (
            <p className="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">{content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-gray dark:prose-invert">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]"></div>
                    <div className="h-2 w-2 animate-bounce rounded-full bg-current"></div>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">AI가 답변을 생성하고 있습니다...</span>
                </div>
              ) : (
                <ReactMarkdown
                  components={{
                    code({ className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match;
                      return isInline ? (
                        <code className={`rounded bg-gray-100 px-1 py-0.5 text-sm dark:bg-gray-800 ${className}`} {...props}>
                          {children}
                        </code>
                      ) : (
                        <SyntaxHighlighter
                          style={tomorrow as any}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-lg"
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      );
                    },
                  }}
                >
                  {content}
                </ReactMarkdown>
              )}
            </div>
          )}
        </div>

        {/* Message Actions */}
        {!isLoading && (
          <div className={`mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${isUser ? 'justify-end' : ''}`}>
            <button
              onClick={handleCopy}
              title={copied ? '복사됨!' : '복사'}
              className="flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <ClipboardDocumentIcon className="size-4" />
            </button>

            {!isUser && (
              <>
                <button
                  onClick={onRegenerate}
                  title="재생성"
                  className="flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <ArrowPathIcon className="size-4" />
                </button>

                <button
                  onClick={() => onRate?.('up')}
                  title="좋아요"
                  className="flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-700 dark:hover:text-green-400"
                >
                  <HandThumbUpIcon className="size-4" />
                </button>

                <button
                  onClick={() => onRate?.('down')}
                  title="싫어요"
                  className="flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700 dark:hover:text-red-400"
                >
                  <HandThumbDownIcon className="size-4" />
                </button>

                <button
                  title="더보기"
                  className="flex size-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <EllipsisHorizontalIcon className="size-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}