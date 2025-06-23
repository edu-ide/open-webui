export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  profile_image_url?: string;
  created_at: string;
  updated_at: string;
  last_active_at?: string;
  settings?: Record<string, any>;
  is_active?: boolean;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
  profile_image_url?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthContextType extends AuthState {
  signIn: (credentials: SignInRequest) => Promise<void>;
  signUp: (userData: SignUpRequest) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

// JWT Token payload structure
export interface JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

// OAuth provider types
export type OAuthProvider = 'google' | 'github' | 'discord' | 'microsoft';

export interface OAuthConfig {
  enabled: boolean;
  client_id?: string;
  authorize_url?: string;
  callback_url?: string;
}

// Session configuration
export interface SessionConfig {
  timeout: number; // in minutes
  remember_me_duration: number; // in days
  auto_refresh: boolean;
  refresh_threshold: number; // minutes before expiry to refresh
}