// src/api/auth.ts
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
} from '@courier/shared-validation';
import type { UserProfile } from '@courier/shared-types';

import { apiClient } from './client';

export interface AuthTokens {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    'bearer';
}

export interface AuthResult {
  user:   UserProfile;
  tokens: AuthTokens;
}

export const authApi = {
  register: async (input: RegisterInput): Promise<AuthResult> => {
    const res = await apiClient.post<{ data: AuthResult }>('/v1/auth/register', input);
    return res.data.data;
  },

  login: async (input: LoginInput): Promise<AuthResult> => {
    const res = await apiClient.post<{ data: AuthResult }>('/v1/auth/login', input);
    return res.data.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/v1/auth/logout');
  },

  getProfile: async (): Promise<UserProfile> => {
    const res = await apiClient.get<{ data: { user: UserProfile } }>('/v1/auth/me');
    return res.data.data.user;
  },

  updateFcmToken: async (fcm_token: string | null): Promise<void> => {
    await apiClient.patch('/v1/auth/fcm-token', { fcm_token });
  },

  changePassword: async (input: ChangePasswordInput): Promise<void> => {
    await apiClient.post('/v1/auth/change-password', input);
  },

  // Internal helper for auth store refresh logic
  refreshViaRefreshToken: async (refreshToken: string): Promise<AuthResult> => {
    const res = await apiClient.post<{ data: AuthResult }>('/v1/auth/refresh', {
      refresh_token: refreshToken,
    });
    return res.data.data;
  },
} as const;
