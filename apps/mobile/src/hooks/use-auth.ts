// src/hooks/use-auth.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';

import { authApi } from '../api/auth';
import type { CourierApiError } from '../api/client';
import { useAuthStore } from '../stores/auth.store';
import { queryClient } from './query-client';

export function useLoginMutation() {
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: authApi.login,
    onSuccess: async (result) => {
      await login(result.user, result.tokens);
      router.replace('/(app)/shipments');
    },
    onError: (error: CourierApiError) => {
      Toast.show({
        type:  'error',
        text1: 'Login Failed',
        text2: error.message,
      });
    },
  });
}

export function useRegisterMutation() {
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: async (result) => {
      await login(result.user, result.tokens);
      router.replace('/(app)/shipments');
    },
    onError: (error: CourierApiError) => {
      Toast.show({
        type:  'error',
        text1: 'Registration Failed',
        text2: error.message,
      });
    },
  });
}

export function useLogoutMutation() {
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationFn: authApi.logout,
    onSettled: async () => {
      await logout();
      queryClient.clear();
      router.replace('/(auth)/login');
    },
  });
}

export function useChangePasswordMutation() {
  const { mutate: logout } = useLogoutMutation();

  return useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      Toast.show({
        type:  'success',
        text1: 'Password Changed',
        text2: 'Please log in with your new password.',
      });
      // Force re-login — backend invalidated all sessions
      logout();
    },
    onError: (error: CourierApiError) => {
      Toast.show({
        type:  'error',
        text1: 'Password Change Failed',
        text2: error.message,
      });
    },
  });
}

export function useMyProfile() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: ['auth', 'profile'],
    queryFn:  authApi.getProfile,
    enabled:  isAuthenticated,
    staleTime: 60_000,
  });
}
