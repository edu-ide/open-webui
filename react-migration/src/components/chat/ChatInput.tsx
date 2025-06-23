import { useState, useRef, useCallback } from 'react';
import { 
  PaperAirplaneIcon,
  PaperClipIcon,
  StopIcon,
  MicrophoneIcon,
  XMarkIcon,
  WrenchIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { useMcp } from '../../hooks/useMcp';
import McpToolsDropdown from './McpToolsDropdown';

interface ChatInputProps {
  onSendMessage: (message: string, files?: File[], tools?: any[]) => void;
  isLoading?: boolean;
  onStopGeneration?: () => void;
  placeholder?: string;
  onOpenSettings?: () => void;
}

export default function ChatInput({
  onSendMessage,
  isLoading = false,
  onStopGeneration,
  placeholder = "메시지를 입력하세요...",
  onOpenSettings,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [selectedTools, setSelectedTools] = useState<any[]>([]);
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // MCP integration
  const { tools, isConnected, activeServer } = useMcp();

  const handleSubmit = useCallback(() => {
    console.log('handleSubmit called', { message, isLoading, attachedFiles, selectedTools });
    if (!message.trim() || isLoading) return;
    
    console.log('Sending message:', message.trim());
    onSendMessage(
      message.trim(), 
      attachedFiles.length > 0 ? attachedFiles : undefined,
      selectedTools.length > 0 ? selectedTools : undefined
    );
    setMessage('');
    setAttachedFiles([]);
    setSelectedTools([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachedFiles, selectedTools, isLoading, onSendMessage]);

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

  const handleToolSelect = (tool: any) => {
    setSelectedTools(prev => {
      const exists = prev.find(t => t.name === tool.name);
      if (exists) {
        return prev.filter(t => t.name !== tool.name);
      } else {
        return [...prev, tool];
      }
    });
  };

  const removeSelectedTool = (toolName: string) => {
    setSelectedTools(prev => prev.filter(t => t.name !== toolName));
  };

  const canSend = message.trim().length > 0 && !isLoading;

  return (
    <div className="w-full">
      <div className="mx-auto max-w-3xl">
        <form
          className="relative"
          onSubmit={(e) => {
            console.log('Form submit event');
            e.preventDefault();
            handleSubmit();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx,.md"
            onChange={handleFileChange}
          />
          
          <div className="relative flex items-end rounded-3xl border border-gray-200 bg-white px-2 py-2 shadow-sm transition-all focus-within:border-gray-300 focus-within:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:focus-within:border-gray-600">
            {/* Attached Files and Selected Tools */}
            {(attachedFiles.length > 0 || selectedTools.length > 0) && (
              <div className="absolute bottom-full left-0 right-0 mb-2 px-2">
                <div className="flex flex-wrap gap-2">
                  {/* Attached Files */}
                  {attachedFiles.map((file, index) => (
                    <div key={`file-${index}`} className="relative group flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">
                      <PaperClipIcon className="size-4 text-gray-500 dark:text-gray-400" />
                      <span className="max-w-[200px] truncate text-sm text-gray-700 dark:text-gray-300">
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="ml-1 rounded-full p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                      >
                        <XMarkIcon className="size-4" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Selected Tools */}
                  {selectedTools.map((tool) => (
                    <div key={`tool-${tool.name}`} className="relative group flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2 dark:bg-blue-900/50">
                      <WrenchIcon className="size-4 text-blue-600 dark:text-blue-400" />
                      <span className="max-w-[200px] truncate text-sm text-blue-700 dark:text-blue-300">
                        {tool.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelectedTool(tool.name)}
                        className="ml-1 rounded-full p-0.5 text-blue-500 hover:bg-blue-200 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-800 dark:hover:text-blue-200"
                      >
                        <XMarkIcon className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Left side buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleFileAttach}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="파일 첨부"
              >
                <PaperClipIcon className="size-5" />
              </button>
              
              {/* MCP Tools Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowToolsDropdown(!showToolsDropdown)}
                  className={`rounded-lg p-2 transition-colors ${
                    isConnected && tools.length > 0
                      ? 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20'
                      : 'text-gray-400 cursor-not-allowed'
                  } ${selectedTools.length > 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  disabled={!isConnected || tools.length === 0}
                  aria-label="MCP Tools"
                  title={isConnected ? `${tools.length} tools available` : 'No MCP server connected'}
                >
                  <WrenchIcon className="size-5" />
                  {selectedTools.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                      {selectedTools.length}
                    </span>
                  )}
                </button>
                
                {/* Tools Dropdown */}
                {showToolsDropdown && isConnected && tools.length > 0 && (
                  <McpToolsDropdown
                    tools={tools}
                    selectedTools={selectedTools}
                    onToolSelect={handleToolSelect}
                    onClose={() => setShowToolsDropdown(false)}
                    serverName={activeServer?.config.name || 'Unknown'}
                  />
                )}
              </div>
            </div>

            {/* Textarea */}
            <div className="flex-1 px-2">
              <textarea
                id="chat-input"
                ref={textareaRef}
                className="w-full resize-none border-0 bg-transparent py-3 pr-8 text-sm outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
                placeholder={placeholder || '메시지를 입력하세요...'}
                value={message}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                rows={1}
                style={{
                  minHeight: '24px',
                  maxHeight: '200px',
                  height: 'auto'
                }}
              />
            </div>

            {/* Right side buttons */}
            <div className="flex items-center gap-1">
              <button
                id="voice-input-button"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                type="button"
                aria-label="음성 입력"
              >
                <MicrophoneIcon className="size-5" />
              </button>
              
              {/* Settings Button */}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="설정"
                  title="MCP 설정"
                >
                  <Cog6ToothIcon className="size-5" />
                </button>
              )}

              {isLoading ? (
                <button
                  className="rounded-lg bg-gray-900 p-2 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  onClick={onStopGeneration}
                  type="button"
                >
                  <StopIcon className="size-5" />
                </button>
              ) : (
                <button
                  id="send-message-button"
                  className={`rounded-lg p-2 transition-colors ${
                    canSend
                      ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200'
                      : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                  }`}
                  type="submit"
                  disabled={!canSend}
                  onClick={(e) => {
                    console.log('Submit button clicked');
                    e.preventDefault();
                    handleSubmit();
                  }}
                >
                  <PaperAirplaneIcon className="size-5 -rotate-90" />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}