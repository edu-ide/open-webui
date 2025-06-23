import type { User, AuthResponse } from '../../types/auth';

// API base configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Global token storage
let authToken: string | null = null;

// Set auth token for API requests
export function setAuthToken(token: string) {
  authToken = token;
}

// Remove auth token
export function removeAuthToken() {
  authToken = null;
}

// Get auth headers
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  return headers;
}

// API request wrapper with auth
async function apiRequest<T>(
  url: string, 
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // If can't parse JSON, use default error message
    }
    
    throw new Error(errorMessage);
  }

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return {} as T;
  }

  return response.json();
}

// Auth API functions
export async function userSignIn(email: string, password: string): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/api/v1/auths/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  
  return response;
}

export async function userSignUp(
  name: string, 
  email: string, 
  password: string, 
  profile_image_url: string = ''
): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/api/v1/auths/signup', {
    method: 'POST',
    body: JSON.stringify({ 
      name, 
      email, 
      password,
      profile_image_url 
    }),
  });
  
  return response;
}

export async function userSignOut(): Promise<void> {
  await apiRequest<void>('/api/v1/auths/signout', {
    method: 'POST',
  });
}

export async function getSessionUser(): Promise<User> {
  const response = await apiRequest<User>('/api/v1/auths/user');
  return response;
}

export async function updateUserProfile(userData: Partial<User>): Promise<User> {
  const response = await apiRequest<User>('/api/v1/auths/update/profile', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  
  return response;
}

export async function updateUserPassword(
  password: string, 
  new_password: string
): Promise<void> {
  await apiRequest<void>('/api/v1/auths/update/password', {
    method: 'POST',
    body: JSON.stringify({ password, new_password }),
  });
}

export async function refreshAuthToken(): Promise<{ token: string; user?: User }> {
  const response = await apiRequest<{ token: string; user?: User }>('/api/v1/auths/refresh', {
    method: 'POST',
  });
  
  return response;
}

// Admin functions
export async function getAllUsers(): Promise<User[]> {
  const response = await apiRequest<User[]>('/api/v1/auths/users');
  return response;
}

export async function getUserById(userId: string): Promise<User> {
  const response = await apiRequest<User>(`/api/v1/auths/users/${userId}`);
  return response;
}

export async function updateUserById(userId: string, userData: Partial<User>): Promise<User> {
  const response = await apiRequest<User>(`/api/v1/auths/users/${userId}/update`, {
    method: 'POST',
    body: JSON.stringify(userData),
  });
  
  return response;
}

export async function deleteUserById(userId: string): Promise<void> {
  await apiRequest<void>(`/api/v1/auths/users/${userId}/delete`, {
    method: 'DELETE',
  });
}

// OAuth functions
export async function getOAuthConfig(): Promise<Record<string, any>> {
  const response = await apiRequest<Record<string, any>>('/api/v1/auths/oauth/config');
  return response;
}

export async function initiateOAuth(provider: string): Promise<{ url: string }> {
  const response = await apiRequest<{ url: string }>(`/api/v1/auths/oauth/${provider}/login`);
  return response;
}

export async function handleOAuthCallback(
  provider: string, 
  code: string, 
  state?: string
): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>(`/api/v1/auths/oauth/${provider}/callback`, {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });
  
  return response;
}

// Session management
export async function validateSession(): Promise<{ valid: boolean; user?: User }> {
  try {
    const user = await getSessionUser();
    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}

// Password reset
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest<void>('/api/v1/auths/password/reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(
  token: string, 
  new_password: string
): Promise<void> {
  await apiRequest<void>('/api/v1/auths/password/reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, new_password }),
  });
}

// Account verification
export async function sendVerificationEmail(email: string): Promise<void> {
  await apiRequest<void>('/api/v1/auths/verification/send', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyAccount(token: string): Promise<void> {
  await apiRequest<void>('/api/v1/auths/verification/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

// Additional legacy functions for compatibility
export async function getSignUpEnabledStatus(): Promise<{ enabled: boolean }> {
  try {
    const response = await apiRequest<{ enabled: boolean }>('/api/v1/auths/signup/enabled');
    return response;
  } catch {
    return { enabled: true }; // Default to enabled
  }
}

export async function tokenAuth(token: string): Promise<AuthResponse> {
  const response = await apiRequest<AuthResponse>('/api/v1/auths/token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  
  return response;
}