import React, { useState, useEffect } from 'react';
import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";
import { CopilotTask } from "@copilotkit/react-core";
import { useMcp } from '../../hooks/useMcp';

/**
 * CopilotKit MCP Client Component
 * Integrates MCP tools with CopilotKit actions
 * Based on CopilotKit's open-mcp-client pattern
 */
export const CopilotMCPClient: React.FC = () => {
  const { tools, isConnected, executeToolCall, activeServer } = useMcp();
  const [mcpState, setMcpState] = useState({
    connected: false,
    serverName: '',
    availableTools: []
  });

  // Provide MCP state to CopilotKit
  useCopilotReadable({
    description: "MCP connection status and available tools",
    value: {
      isConnected,
      serverName: activeServer?.config.name || 'No server connected',
      toolCount: tools.length,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description
      }))
    }
  });

  // Register MCP tools as CopilotKit actions
  useEffect(() => {
    tools.forEach(tool => {
      // Each MCP tool becomes a CopilotKit action
      useCopilotAction({
        name: tool.name,
        description: tool.description,
        parameters: Object.entries(tool.inputSchema?.properties || {}).map(([key, schema]: [string, any]) => ({
          name: key,
          type: schema.type,
          description: schema.description || key,
          required: tool.inputSchema?.required?.includes(key) || false
        })),
        handler: async (args) => {
          console.log(`Executing MCP tool via CopilotKit: ${tool.name}`, args);
          try {
            const result = await executeToolCall(tool.name, args);
            return result;
          } catch (error) {
            console.error(`Failed to execute ${tool.name}:`, error);
            throw error;
          }
        },
        render: (args) => {
          // Optional: Render UI for this action
          return (
            <div className="p-2 border rounded">
              <h4 className="font-semibold">{tool.name}</h4>
              <p className="text-sm text-gray-600">{tool.description}</p>
              <pre className="text-xs mt-2">{JSON.stringify(args, null, 2)}</pre>
            </div>
          );
        }
      });
    });
  }, [tools, executeToolCall]);

  // CopilotKit Task for complex MCP operations
  const mcpTask = new CopilotTask({
    instructions: `
      You have access to MCP (Model Context Protocol) tools. 
      Available tools: ${tools.map(t => `${t.name}: ${t.description}`).join(', ')}.
      
      When users ask for something that requires a tool, identify the appropriate tool and use it.
      Always explain what tool you're using and why.
    `
  });

  return (
    <div className="hidden">
      {/* This component is headless - it only registers actions and state */}
      {/* Visual UI is handled by CopilotKit components */}
    </div>
  );
};