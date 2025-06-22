import React from 'react';
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

interface CopilotMCPProviderProps {
  children: React.ReactNode;
  runtimeUrl?: string;
  publicApiKey?: string;
}

/**
 * CopilotKit Provider with MCP support
 * Based on CopilotKit's open-mcp-client approach
 */
export const CopilotMCPProvider: React.FC<CopilotMCPProviderProps> = ({ 
  children,
  runtimeUrl = "/api/v2/copilot",
  publicApiKey
}) => {
  // CopilotKit configuration with MCP support
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add auth token if available
  const authToken = localStorage.getItem('authToken');
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return (
    <CopilotKit 
      runtimeUrl={runtimeUrl}
      publicApiKey={publicApiKey}
      headers={headers}
    >
      {children}
      <CopilotPopup
        instructions="You are a helpful AI assistant with access to various tools through Model Context Protocol (MCP). You can help with tasks like searching documents, performing calculations, getting weather information, and more."
        defaultOpen={false}
        labels={{
          title: "AI Assistant",
          initial: "Hi! I'm your AI assistant. I have access to various tools through MCP. How can I help you today?"
        }}
      />
    </CopilotKit>
  );
};