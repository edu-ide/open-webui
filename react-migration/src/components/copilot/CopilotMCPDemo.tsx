import React, { useState, useEffect } from 'react';
import { CopilotKit, useCopilotReadable, useCopilotAction, useCopilotChat } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { useMcp } from '../../hooks/useMcp';
import { MCPMonitorComponent } from '../mcp/MCPMonitorComponent';
import { MCPServerConfigPanel } from './MCPServerConfig';

// Inner component that uses CopilotKit hooks
const CopilotMCPContent: React.FC<{
  tools: any[];
  isConnected: boolean;
  activeServer: any;
  executeToolCall: (toolName: string, args: any) => Promise<any>;
  ragEnabled: boolean;
}> = ({ tools, isConnected, activeServer, executeToolCall, ragEnabled }) => {
  // MCP 상태를 CopilotKit에 제공
  useCopilotReadable({
    description: "MCP connection status and available tools",
    value: {
      isConnected,
      serverName: activeServer?.config.name || 'No server connected',
      toolCount: tools.length,
      availableTools: tools.map(t => ({
        name: t.name,
        description: t.description
      }))
    }
  });

  // 통합 MCP 도구 실행 액션
  useCopilotAction({
    name: "execute_mcp_tool",
    description: "Execute any available MCP tool",
    parameters: [
      {
        name: "toolName",
        type: "string",
        description: "Name of the MCP tool to execute",
        required: true
      },
      {
        name: "arguments",
        type: "object", 
        description: "Arguments for the tool",
        required: false
      }
    ],
    handler: async ({ toolName, arguments: args }) => {
      console.log(`Executing MCP tool: ${toolName}`, args);
      try {
        const result = await executeToolCall(toolName, args || {});
        return {
          success: true,
          result: result
        };
      } catch (error) {
        console.error(`Failed to execute ${toolName}:`, error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  return (
    <>
      {/* CopilotKit Sidebar */}
      <CopilotSidebar
        defaultOpen={true}
        labels={{
          title: "AI Assistant with MCP",
          initial: "Hello! I can help you with various tasks using MCP tools. What would you like to do today?"
        }}
        instructions={`
          You are an AI assistant integrated with Model Context Protocol (MCP) tools.
          
          Available MCP tools:
          ${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}
          
          To use a tool, call the execute_mcp_tool action with the tool name and arguments.
          Example: execute_mcp_tool(toolName: "get_weather", arguments: { location: "Seoul" })
          
          ${ragEnabled ? 'RAG is enabled, so you can search through documents for context.' : 'RAG is disabled.'}
          
          Always explain which tool you're using and why.
        `}
      />
      
      {/* Demo Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Try These Examples:</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ExampleCard
            title="Document Search"
            description="Search through documents using RAG"
            prompt="Search for information about Spring AI configuration"
          />
          <ExampleCard
            title="Code Analysis"
            description="Analyze code using MCP tools"
            prompt="Analyze the security of this authentication code"
          />
          <ExampleCard
            title="Weather Info"
            description="Get weather using MCP weather tool"
            prompt="What's the weather in Seoul?"
          />
          <ExampleCard
            title="Data Processing"
            description="Process data using available tools"
            prompt="Calculate the average of [23, 45, 67, 89, 12]"
          />
        </div>
        
        {/* MCP Tools Display */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-2">Available MCP Tools:</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {tools.map((tool) => (
              <div key={tool.name} className="bg-gray-100 dark:bg-gray-700 p-3 rounded">
                <div className="font-medium">{tool.name}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {tool.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export const CopilotMCPDemo: React.FC = () => {
  const [showMCPMonitor, setShowMCPMonitor] = useState(false);
  const [showMCPConfig, setShowMCPConfig] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [ragEnabled, setRagEnabled] = useState(true);
  
  // MCP 연결 상태
  const { 
    servers, 
    activeServer, 
    tools, 
    isConnected,
    connectToServer,
    executeToolCall 
  } = useMcp();

  // CopilotKit Runtime URL - Spring AI 서버
  const runtimeUrl = import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api/v2/copilot`
    : "/api/v2/copilot";

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            CopilotKit + MCP Integration Demo
          </h1>
          <div className="flex items-center gap-4">
            {/* Model Selector */}
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="claude-3">Claude 3</option>
            </select>
            
            {/* RAG Toggle */}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ragEnabled}
                onChange={(e) => setRagEnabled(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Enable RAG</span>
            </label>
            
            {/* MCP Config Toggle */}
            <button
              onClick={() => setShowMCPConfig(!showMCPConfig)}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            >
              {showMCPConfig ? 'Hide' : 'Show'} MCP Config
            </button>
            
            {/* MCP Monitor Toggle */}
            <button
              onClick={() => setShowMCPMonitor(!showMCPMonitor)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              {showMCPMonitor ? 'Hide' : 'Show'} MCP Monitor
            </button>
          </div>
        </div>
        
        {/* MCP Connection Status */}
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-600 dark:text-gray-400">
            MCP: {isConnected ? `Connected to ${activeServer?.name}` : 'Disconnected'}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-600 dark:text-gray-400">
            Tools: {tools.length} available
          </span>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* MCP Config Panel */}
        {showMCPConfig && (
          <div className="w-96 border-r dark:border-gray-700 overflow-y-auto p-4">
            <MCPServerConfigPanel />
          </div>
        )}
        
        {/* Main Content Area */}
        <div className="flex-1 p-4">
          <CopilotKit
            runtimeUrl={runtimeUrl}
            headers={{
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
              'X-Model': selectedModel,
              'X-Enable-RAG': ragEnabled.toString()
            }}
          >
            <CopilotMCPContent
              tools={tools}
              isConnected={isConnected}
              activeServer={activeServer}
              executeToolCall={executeToolCall}
              ragEnabled={ragEnabled}
            />
          </CopilotKit>
        </div>
        
        {/* MCP Monitor Panel */}
        {showMCPMonitor && (
          <div className="w-96 border-l dark:border-gray-700 overflow-y-auto">
            <MCPMonitorComponent />
          </div>
        )}
      </div>
    </div>
  );
};

// Example Card Component
const ExampleCard: React.FC<{
  title: string;
  description: string;
  prompt: string;
}> = ({ title, description, prompt }) => {
  const chat = useCopilotChat();
  
  return (
    <div className="border dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
         onClick={() => {
           if (chat && chat.append) {
             chat.append({ role: 'user', content: prompt });
           }
         }}>
      <h4 className="font-semibold">{title}</h4>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{description}</p>
      <p className="text-xs text-blue-500 mt-2">Click to try</p>
    </div>
  );
};