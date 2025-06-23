import React, { useEffect, useRef } from 'react';
import { CheckIcon, WrenchIcon } from '@heroicons/react/24/outline';
import { McpTool } from '../../types/mcp';

interface McpToolsDropdownProps {
  tools: McpTool[];
  selectedTools: McpTool[];
  onToolSelect: (tool: McpTool) => void;
  onClose: () => void;
  serverName: string;
}

const McpToolsDropdown: React.FC<McpToolsDropdownProps> = ({
  tools,
  selectedTools,
  onToolSelect,
  onClose,
  serverName,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const isSelected = (tool: McpTool) => {
    return selectedTools.some(t => t.name === tool.name);
  };

  return (
    <div 
      ref={dropdownRef}
      className="absolute bottom-full left-0 mb-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 z-50"
    >
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <WrenchIcon className="size-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            MCP Tools
          </h3>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          From: {serverName}
        </p>
      </div>

      {/* Tools List */}
      <div className="max-h-64 overflow-y-auto">
        {tools.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No tools available
          </div>
        ) : (
          <div className="py-2">
            {tools.map((tool) => (
              <button
                key={tool.name}
                onClick={() => onToolSelect(tool)}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {isSelected(tool) ? (
                      <div className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-white">
                        <CheckIcon className="size-3" />
                      </div>
                    ) : (
                      <div className="h-4 w-4 rounded border border-gray-300 dark:border-gray-600" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {tool.name}
                      </span>
                      {tool.inputSchema?.required && tool.inputSchema.required.length > 0 && (
                        <span className="text-xs text-orange-600 dark:text-orange-400">
                          *
                        </span>
                      )}
                    </div>
                    
                    {tool.description && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {tool.description}
                      </p>
                    )}
                    
                    {/* Parameters hint */}
                    {tool.inputSchema?.properties && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {Object.keys(tool.inputSchema.properties).slice(0, 3).map((param) => (
                          <span
                            key={param}
                            className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          >
                            {param}
                          </span>
                        ))}
                        {Object.keys(tool.inputSchema.properties).length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{Object.keys(tool.inputSchema.properties).length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {selectedTools.length > 0 && (
        <div className="border-t border-gray-200 px-4 py-2 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {selectedTools.length} tool{selectedTools.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  );
};

export default McpToolsDropdown;