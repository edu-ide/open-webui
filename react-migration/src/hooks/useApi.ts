// This file is deprecated in favor of the new auth context system
// All auth-related functionality has been moved to AuthContext

import { useQuery, useMutation } from '@tanstack/react-query';

// Placeholder implementations to prevent build errors
// These will be removed once all components migrate to the new auth system

export const useSignIn = () => {
  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      console.warn('useSignIn is deprecated, use AuthContext instead');
      console.log('Attempted credentials:', credentials.email);
      throw new Error('Use AuthContext.signIn instead');
    }
  });
};

export const useSignUp = () => {
  return useMutation({
    mutationFn: async (userData: { 
      name: string; 
      email: string; 
      password: string; 
      profile_image_url: string;
    }) => {
      console.warn('useSignUp is deprecated, use AuthContext instead');
      console.log('Attempted signup for:', userData.email);
      throw new Error('Use AuthContext.signUp instead');
    }
  });
};

export const useSignOut = () => {
  return useMutation({
    mutationFn: async () => {
      console.warn('useSignOut is deprecated, use AuthContext instead');
      throw new Error('Use AuthContext.signOut instead');
    }
  });
};

export const useSessionUser = () => {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      console.warn('useSessionUser is deprecated, use AuthContext instead');
      return null;
    },
    enabled: false,
    retry: false
  });
};

// Other API hooks that are still valid
export const useUpdateUserProfile = () => {
  return useMutation({
    mutationFn: async (userData: any) => {
      console.log('updateUserProfile:', userData);
      // TODO: Implement actual API call
    }
  });
};

export const useUpdateUserPassword = () => {
  return useMutation({
    mutationFn: async (passwordData: { password: string; new_password: string }) => {
      console.log('updateUserPassword for user');
      console.log('Password update requested for length:', passwordData.new_password.length);
      // TODO: Implement actual API call
    }
  });
};

export const useGetSignUpEnabledStatus = () => {
  return useQuery({
    queryKey: ['signup-enabled'],
    queryFn: async () => ({ enabled: true }),
    staleTime: 5 * 60 * 1000,
  });
};

export const useTokenAuth = () => {
  return useMutation({
    mutationFn: async (token: string) => {
      console.log('tokenAuth:', token);
      // TODO: Implement actual API call
      return { token, user: null };
    }
  });
};

// Backend configuration hook
export const useBackendConfig = () => {
  return useQuery({
    queryKey: ['backend-config'],
    queryFn: async () => {
      console.log('useBackendConfig: returning default config');
      return {
        name: 'Open WebUI',
        version: '0.1.0',
        status: true,
        features: { auth: true },
        default_models: [],
        default_prompt_suggestions: []
      };
    },
    staleTime: 5 * 60 * 1000,
  });
};

// Models hook
export const useModels = () => {
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      console.log('useModels: returning default models');
      return [];
    },
    staleTime: 2 * 60 * 1000,
  });
};