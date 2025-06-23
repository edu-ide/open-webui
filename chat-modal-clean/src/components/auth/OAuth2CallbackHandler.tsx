import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { mcpAuthService } from '../../services/mcpAuth';
import { useMcpServers } from '../../hooks/useMcp';

const OAuth2CallbackHandler: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateServerAuth } = useMcpServers();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          throw new Error(`OAuth2 Error: ${error} - ${errorDescription || 'Unknown error'}`);
        }

        if (!code || !state) {
          throw new Error('Missing authorization code or state parameter');
        }

        // Get OAuth2 config from localStorage or other storage
        const authConfig = localStorage.getItem(`oauth2_config_${state}`);
        if (!authConfig) {
          throw new Error('OAuth2 configuration not found');
        }

        const config = JSON.parse(authConfig);
        
        // Exchange code for tokens
        const tokenResponse = await mcpAuthService.handleCallback(code, state, config);

        // Update server configuration with tokens
        await updateServerAuth({
          serverId: config.serverId,
          authType: 'oauth2',
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenType: tokenResponse.token_type,
          expiresIn: tokenResponse.expires_in,
          scope: tokenResponse.scope
        });

        // Clean up stored config
        localStorage.removeItem(`oauth2_config_${state}`);

        setStatus('success');
        
        // Redirect to chat page after short delay
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 2000);

      } catch (error) {
        console.error('OAuth2 callback error:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
        setStatus('error');
        
        // Redirect to chat page after delay even on error
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 5000);
      }
    };

    handleCallback();
  }, [searchParams, navigate, updateServerAuth]);

  const renderContent = () => {
    switch (status) {
      case 'processing':
        return (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Processing Authorization
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Please wait while we complete the authentication process...
            </p>
          </div>
        );
      
      case 'success':
        return (
          <div className="text-center">
            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-green-100 rounded-full mb-4 dark:bg-green-900">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Authorization Successful
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Your MCP server has been successfully authenticated. Redirecting you back to the chat...
            </p>
          </div>
        );
      
      case 'error':
        return (
          <div className="text-center">
            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full mb-4 dark:bg-red-900">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Authorization Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {errorMessage}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You will be redirected back to the chat shortly. Please try connecting your MCP server again.
            </p>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default OAuth2CallbackHandler;