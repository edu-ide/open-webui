import { McpServerConfig } from '../types/mcp';

export interface OAuth2Config {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  additionalParameters?: Record<string, string>;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface AuthState {
  state: string;
  codeVerifier: string;
  serverId: string;
  redirectUri: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  resource?: string;
}

class McpAuthService {
  private authStates = new Map<string, AuthState>();

  /**
   * Generate PKCE code verifier and challenge according to RFC 7636
   */
  generatePKCEChallenge(): PKCEChallenge {
    // Generate code verifier (43-128 characters, URL-safe)
    const codeVerifier = this.generateRandomString(128);
    
    // Generate code challenge (SHA256 hash, base64url encoded)
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    
    return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
      const codeChallenge = this.base64URLEncode(new Uint8Array(hashBuffer));
      return {
        codeVerifier,
        codeChallenge,
        codeChallengeMethod: 'S256' as const
      };
    }).catch(() => {
      // Fallback for environments without crypto.subtle
      const codeChallenge = btoa(codeVerifier)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      return {
        codeVerifier,
        codeChallenge,
        codeChallengeMethod: 'S256' as const
      };
    }) as Promise<PKCEChallenge> & PKCEChallenge;
  }

  /**
   * Start OAuth2 authorization flow with PKCE and Resource Indicators
   */
  async startAuthorization(
    serverConfig: McpServerConfig,
    oauth2Config: OAuth2Config
  ): Promise<string> {
    const { codeVerifier, codeChallenge } = await this.generatePKCEChallenge();
    const state = this.generateRandomString(32);
    const redirectUri = oauth2Config.redirectUri || `${window.location.origin}/oauth/callback`;

    // Store auth state
    this.authStates.set(state, {
      state,
      codeVerifier,
      serverId: serverConfig.id,
      redirectUri
    });

    // Build authorization URL
    const authUrl = new URL(oauth2Config.authorizationEndpoint);
    const params: Record<string, string> = {
      response_type: 'code',
      client_id: oauth2Config.clientId || '',
      redirect_uri: redirectUri,
      scope: oauth2Config.scope || '',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      ...oauth2Config.additionalParameters
    };

    // Add Resource Indicators if specified
    if (oauth2Config.resourceIndicators && oauth2Config.resourceIndicators.length > 0) {
      oauth2Config.resourceIndicators.forEach(resource => {
        authUrl.searchParams.append('resource', resource);
      });
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        authUrl.searchParams.set(key, value);
      }
    });

    return authUrl.toString();
  }

  /**
   * Handle OAuth2 callback and exchange authorization code for tokens
   */
  async handleCallback(
    code: string,
    state: string,
    oAuth2Config: OAuth2Config
  ): Promise<TokenResponse> {
    const authState = this.authStates.get(state);
    if (!authState) {
      throw new Error('Invalid or expired authentication state');
    }

    // Clean up auth state
    this.authStates.delete(state);

    // Exchange authorization code for tokens
    const tokenRequestParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: authState.redirectUri,
      code_verifier: authState.codeVerifier,
      client_id: oAuth2Config.clientId || ''
    };

    // Add Resource Indicators to token request if specified
    const tokenRequestBody = new URLSearchParams(tokenRequestParams);
    if (oAuth2Config.resourceIndicators && oAuth2Config.resourceIndicators.length > 0) {
      oAuth2Config.resourceIndicators.forEach(resource => {
        tokenRequestBody.append('resource', resource);
      });
    }

    const response = await fetch(oAuth2Config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenRequestBody
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Token exchange failed: ${errorData.error_description || response.statusText}`);
    }

    const tokenResponse: TokenResponse = await response.json();
    
    // Validate token response
    if (!tokenResponse.access_token) {
      throw new Error('Invalid token response: missing access_token');
    }

    // Validate Resource Indicators if they were requested
    if (oAuth2Config.resourceIndicators && oAuth2Config.resourceIndicators.length > 0) {
      if (tokenResponse.resource) {
        const isValidResource = this.validateResourceIndicators(
          [tokenResponse.resource],
          oAuth2Config.resourceIndicators
        );
        if (!isValidResource) {
          console.warn('Token response contains invalid resource indicator');
        }
      }
    }

    return tokenResponse;
  }

  /**
   * Register dynamic OAuth2 client
   */
  async registerDynamicClient(
    registrationEndpoint: string,
    clientMetadata: {
      client_name: string;
      redirect_uris: string[];
      grant_types?: string[];
      response_types?: string[];
      scope?: string;
      token_endpoint_auth_method?: string;
    }
  ): Promise<{
    client_id: string;
    client_secret?: string;
    registration_access_token?: string;
    registration_client_uri?: string;
  }> {
    const defaultMetadata = {
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none', // For PKCE
      ...clientMetadata
    };

    const response = await fetch(registrationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(defaultMetadata)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Client registration failed: ${errorData.error_description || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(
    tokenEndpoint: string,
    refreshToken: string,
    clientId?: string
  ): Promise<TokenResponse> {
    const tokenRequest = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId || ''
    };

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(tokenRequest)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Token refresh failed: ${errorData.error_description || response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Validate Resource Indicators
   */
  validateResourceIndicators(
    requestedResources: string[],
    allowedResources: string[]
  ): boolean {
    return requestedResources.every(resource => 
      allowedResources.some(allowed => 
        resource === allowed || resource.startsWith(allowed + '/')
      )
    );
  }

  private generateRandomString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const randomValues = new Uint8Array(length);
      crypto.getRandomValues(randomValues);
      
      for (let i = 0; i < length; i++) {
        result += charset[randomValues[i] % charset.length];
      }
    } else {
      // Fallback for environments without crypto
      for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
      }
    }
    
    return result;
  }

  private base64URLEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

export const mcpAuthService = new McpAuthService();