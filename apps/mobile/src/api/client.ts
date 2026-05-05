// src/api/client.ts
/**
 * Axios singleton with:
 *   - JWT Bearer injection on every request
 *   - Automatic token refresh on 401 (single refresh, queued retries)
 *   - Standardized error normalization
 *
 * SECURITY:
 *   - Tokens read from SecureStore, never from memory globals
 *   - Authorization header stripped from error logs
 *   - No request body logging in production
 */

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';

import * as storage from '../lib/storage';

// ─── Error shape ──────────────────────────────────────────────────────────────

export interface ApiError {
  error:    string;
  message:  string;
  details?: Array<{ field: string; message: string }>;
  statusCode: number;
}

export class CourierApiError extends Error {
  readonly code:       string;
  readonly statusCode: number;
  readonly details:    Array<{ field: string; message: string }>;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name       = 'CourierApiError';
    this.code       = apiError.error;
    this.statusCode = apiError.statusCode;
    this.details    = apiError.details ?? [];
  }

  isValidation(): boolean { return this.statusCode === 400; }
  isUnauthorized(): boolean { return this.statusCode === 401; }
  isForbidden(): boolean { return this.statusCode === 403; }
  isNotFound(): boolean { return this.statusCode === 404; }
  isConflict(): boolean { return this.statusCode === 409; }
  isBusinessRule(): boolean { return this.statusCode === 422; }
  isServerError(): boolean { return this.statusCode >= 500; }
}

// ─── Refresh state ────────────────────────────────────────────────────────────

let isRefreshing = false;
let failedQueue:  Array<{
  resolve: (token: string) => void;
  reject:  (error: Error) => void;
}> = [];

function processQueue(error: Error | null, token: string | null = null): void {
  for (const promise of failedQueue) {
    if (error) {
      promise.reject(error);
    } else if (token) {
      promise.resolve(token);
    }
  }
  failedQueue = [];
}

// ─── Client factory ───────────────────────────────────────────────────────────

function createApiClient(): AxiosInstance {
  const apiUrl = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api';

  const client = axios.create({
    baseURL: apiUrl,
    timeout: 20_000,
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
  });

  // ── Request interceptor: inject JWT ──────────────────────────────────────
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const token = await storage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error: unknown) => Promise.reject(error),
  );

  // ── Response interceptor: handle 401 with token refresh ─────────────────
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiError>) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };

      // Normalize to CourierApiError
      if (error.response?.data) {
        const apiErr = error.response.data;
        throw new CourierApiError({
          ...apiErr,
          statusCode: error.response.status,
        });
      }

      // Handle 401: attempt refresh (skip if already retrying to prevent loop)
      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Queue this request until the refresh resolves
          return new Promise<string>((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then(async (newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return client(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = await storage.getItem('refresh_token');
          if (!refreshToken) throw new Error('No refresh token');

          const response = await axios.post<{
            data: { tokens: { access_token: string; refresh_token: string; expires_in: number } };
          }>(`${apiUrl}/v1/auth/refresh`, { refresh_token: refreshToken });

          const { access_token, refresh_token: newRefresh, expires_in } = response.data.data.tokens;

          // Persist new tokens atomically
          await Promise.all([
            storage.setItem('access_token',     access_token),
            storage.setItem('refresh_token',    newRefresh),
            storage.setItem('token_expires_at', new Date(Date.now() + expires_in * 1000).toISOString()),
          ]);

          processQueue(null, access_token);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError instanceof Error ? refreshError : new Error('Refresh failed'));
          // Clear all tokens — user must log in again
          await storage.clearAll();
          throw refreshError;
        } finally {
          isRefreshing = false;
        }
      }

      // Network error with no response
      if (!error.response) {
        throw new CourierApiError({
          error:      'NETWORK_ERROR',
          message:    'Unable to connect to the server. Check your internet connection.',
          statusCode: 0,
        });
      }

      throw error;
    },
  );

  return client;
}

export const apiClient = createApiClient();
