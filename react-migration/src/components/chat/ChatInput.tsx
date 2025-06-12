import { useState, useRef, useCallback } from 'react';
import { 
  PaperAirplaneIcon,
  PaperClipIcon,
  StopIcon,
  MicrophoneIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface ChatInputProps {
  onSendMessage: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  onStopGeneration?: () => void;
  placeholder?: string;
}

export default function ChatInput({
  onSendMessage,
  isLoading = false,
  onStopGeneration,
  placeholder = "메시지를 입력하세요...",
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    console.log('handleSubmit called', { message, isLoading, attachedFiles });
    if (!message.trim() || isLoading) return;
    
    console.log('Sending message:', message.trim());
    onSendMessage(message.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
    setMessage('');
    setAttachedFiles([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachedFiles, isLoading, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    console.log('Key down:', e.key, 'shiftKey:', e.shiftKey);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('Enter key detected, calling handleSubmit');
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    setMessage(target.value);
    
    // Auto-resize textarea
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  };

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const canSend = message.trim().length > 0 && !isLoading;

  return (
    <div className="w-full font-primary">
      <div className="mx-auto bg-transparent flex justify-center">
        <div className="flex flex-col px-3 sm:px-4 max-w-6xl w-full">
          <div className="w-full relative py-2 sm:py-3">
            <div className="bg-white dark:bg-gray-900">
              <div className="w-full">
                <div className="">
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    multiple
                    accept="image/*,.pdf,.txt,.doc,.docx,.md"
                    onChange={handleFileChange}
                  />

                  <form
                    className="w-full flex gap-1.5"
                    onSubmit={(e) => {
                      console.log('Form submit event');
                      e.preventDefault();
                      handleSubmit();
                    }}
                  >
                    <div className="flex-1 flex flex-col relative w-full shadow-sm sm:shadow-lg rounded-2xl sm:rounded-3xl border border-gray-50 dark:border-gray-850 hover:border-gray-100 focus-within:border-gray-100 hover:dark:border-gray-800 focus-within:dark:border-gray-800 transition px-1 bg-white/90 dark:bg-gray-400/5 dark:text-gray-100">
                      {/* Attached Files */}
                      {attachedFiles.length > 0 && (
                        <div className="mx-2 mt-2.5 -mb-1 flex items-center flex-wrap gap-2">
                          {attachedFiles.map((file, index) => (
                            <div key={index} className="relative group">
                              <div className="relative flex items-center">
                                <div className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
                                  <span className="max-w-[100px] truncate">{file.name}</span>
                                </div>
                              </div>
                              <div className="absolute -top-1 -right-1">
                                <button
                                  className="bg-white text-black border border-white rounded-full group-hover:visible invisible transition"
                                  type="button"
                                  onClick={() => removeFile(index)}
                                >
                                  <XMarkIcon className="size-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="px-2 sm:px-2.5">
                        <div
                          className="scrollbar-hidden bg-transparent dark:text-gray-100 outline-hidden w-full pt-2 sm:pt-3 px-1 resize-none h-fit max-h-40 sm:max-h-80 overflow-auto"
                          id="chat-input-container"
                        >
                          <textarea
                            id="chat-input"
                            ref={textareaRef}
                            className="scrollbar-hidden bg-transparent dark:text-gray-100 outline-hidden w-full resize-none border-0 outline-none text-base"
                            placeholder={placeholder ? placeholder : '메시지를 보내세요'}
                            value={message}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            style={{
                              minHeight: '20px',
                              maxHeight: '160px',
                              height: 'auto'
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-between mt-1 mb-1.5 sm:mb-2.5 mx-0.5 max-w-full">
                        <div className="ml-1 self-end flex items-center flex-1 max-w-[80%] gap-0.5">
                          <button
                            type="button"
                            onClick={handleFileAttach}
                            className="bg-transparent hover:bg-gray-100 text-gray-800 dark:text-white dark:hover:bg-gray-800 transition rounded-full p-1 sm:p-1.5 outline-hidden focus:outline-hidden"
                            aria-label="파일 첨부"
                          >
                            <PaperClipIcon className="size-4 sm:size-5" />
                          </button>
                        </div>

                        <div className="self-end flex space-x-0.5 sm:space-x-1 mr-1 shrink-0">
                          <button
                            id="voice-input-button"
                            className="text-gray-600 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200 transition rounded-full p-1 sm:p-1.5 mr-0.5 self-center"
                            type="button"
                            aria-label="음성 입력"
                          >
                            <MicrophoneIcon className="w-4 h-4 sm:w-5 sm:h-5 translate-y-[0.5px]" />
                          </button>

                          {isLoading ? (
                            <div className="flex items-center">
                              <button
                                className="bg-white hover:bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-800 transition rounded-full p-1 sm:p-1.5"
                                onClick={onStopGeneration}
                                type="button"
                              >
                                <StopIcon className="size-4 sm:size-5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <button
                                id="send-message-button"
                                className={`transition rounded-full p-1 sm:p-1.5 self-center ${
                                  canSend
                                    ? 'bg-black text-white hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100'
                                    : 'text-white bg-gray-200 dark:text-gray-900 dark:bg-gray-700 disabled'
                                }`}
                                type="submit"
                                disabled={!canSend}
                                onClick={(e) => {
                                  console.log('Submit button clicked');
                                  e.preventDefault();
                                  handleSubmit();
                                }}
                              >
                                <PaperAirplaneIcon className="size-4 sm:size-5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}