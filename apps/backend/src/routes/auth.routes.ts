/**
 * auth.routes.ts — Authentication API routes.
 *
 * Route structure:
 *   POST   /api/v1/auth/register       → authService.register()
 *   POST   /api/v1/auth/login          → authService.login()
 *   POST   /api/v1/auth/refresh        → authService.refreshTokens()
 *   POST   /api/v1/auth/logout         → authService.logout()
 *   GET    /api/v1/auth/me             → authService.getProfile()
 *   PATCH  /api/v1/auth/fcm-token      → authService.updateFcmToken()
 *   POST   /api/v1/auth/change-password → authService.changePassword()
 *
 * Middleware chain per route:
 *   Public routes:    validate(schema) → asyncHandler(handler)
 *   Protected routes: requireAuth → validate(schema)? → asyncHandler(handler)
 *   Rate-limited:     authRateLimit → validate(schema) → asyncHandler(handler)
 *
 * Response envelope:
 *   All successful responses use { data: T } wrapper for consistency.
 *   Errors are handled by the global error handler (errorHandler in app.ts).
 *
 * IP extraction:
 *   req.ip is correct when 'trust proxy' = 1 is set (done in app.ts).
 *   Behind Railway/Fly.io/Nginx, X-Forwarded-For contains the real IP.
 *
 * Sensitive response fields:
 *   - Tokens are returned in the response body (not cookies) for mobile
 *     compatibility. The mobile client stores them in expo-secure-store.
 *   - Passwords are NEVER echoed in any response.
 *   - The refresh_token is returned only once per login/refresh cycle.
 */

import {
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  UpdateFCMTokenSchema,
  ChangePasswordSchema,
} from '@courier/shared-validation';
import { Router } from 'express';
import type { Request, Response } from 'express';


import { requireAuth } from '../middleware/auth.middleware.js';
import { authRateLimit } from '../middleware/rate-limit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { authService } from '../services/auth.service.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

// ─── POST /api/v1/auth/register ──────────────────────────────────────────────
/**
 * Register a new customer account.
 *
 * Rate-limited: 10 req / 15 min per IP (authRateLimit)
 *
 * Request body: RegisterInput
 *   { email, password, full_name, phone_number }
 *
 * Response 201:
 *   {
 *     data: {
 *       user: UserProfileResponse,
 *       tokens: { access_token, refresh_token, expires_in, token_type }
 *     }
 *   }
 *
 * Response 409: Email already registered
 * Response 400: Validation error (field-level details)
 * Response 429: Rate limit exceeded
 * Response 500: Profile creation failed (transient — retry safe)
 */
authRouter.post(
  '/register',
  authRateLimit,
  validate(RegisterSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(
      req.body,
      req.ip ?? 'unknown',
      (req.headers['user-agent'] as string) ?? 'unknown',
    );

    res.status(201).json({ data: result });
  }),
);

// ─── POST /api/v1/auth/login ─────────────────────────────────────────────────
/**
 * Authenticate with email + password.
 *
 * Rate-limited: 10 req / 15 min per IP (authRateLimit)
 *
 * Request body: LoginInput
 *   { email, password }
 *
 * Response 200:
 *   {
 *     data: {
 *       user: UserProfileResponse,
 *       tokens: { access_token, refresh_token, expires_in, token_type }
 *     }
 *   }
 *
 * Response 401: Invalid credentials (same message for wrong password AND
 *               non-existent email — prevents account enumeration)
 * Response 403: Account deactivated
 * Response 429: Rate limit exceeded
 */
authRouter.post(
  '/login',
  authRateLimit,
  validate(LoginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(
      req.body,
      req.ip ?? 'unknown',
      (req.headers['user-agent'] as string) ?? 'unknown',
    );

    res.status(200).json({ data: result });
  }),
);

// ─── POST /api/v1/auth/refresh ───────────────────────────────────────────────
/**
 * Rotate tokens using a refresh token.
 *
 * NOT rate-limited aggressively — mobile clients legitimately refresh
 * frequently (on app foreground). The global rate limiter (100/15min) applies.
 *
 * Request body:
 *   { refresh_token: string }
 *
 * Response 200:
 *   {
 *     data: {
 *       tokens: { access_token, refresh_token, expires_in, token_type }
 *     }
 *   }
 *
 * Response 401: Refresh token expired or already used
 *
 * IMPORTANT: The returned refresh_token is new and single-use.
 * The client MUST immediately replace the stored refresh_token with the
 * new one. The old refresh_token is now invalid.
 */
authRouter.post(
  '/refresh',
  validate(RefreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refresh_token } = req.body as { refresh_token: string };

    const result = await authService.refreshTokens(refresh_token);

    res.status(200).json({ data: result });
  }),
);

// ─── POST /api/v1/auth/logout ────────────────────────────────────────────────
/**
 * Revoke all sessions for the authenticated user.
 *
 * Requires: Authorization: Bearer <access_token>
 *
 * No request body required.
 *
 * Response 204: Sessions revoked (no body)
 *
 * After this call, all stored tokens (access AND refresh) are invalid.
 * The client must clear local storage and redirect to login.
 *
 * Note: Even if session revocation fails on the server side (Supabase
 * unavailability), the client should still clear local tokens and redirect.
 * The Supabase token will expire in ≤1 hour anyway.
 */
authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // req.user is guaranteed non-null after requireAuth
    await authService.logout(
      req.user!.id,
      req.ip ?? 'unknown',
    );

    // 204 No Content — no body, no tokens to return
    res.status(204).send();
  }),
);

// ─── GET /api/v1/auth/me ─────────────────────────────────────────────────────
/**
 * Return the authenticated user's current profile.
 *
 * Requires: Authorization: Bearer <access_token>
 *
 * Response 200:
 *   {
 *     data: {
 *       user: UserProfileResponse
 *     }
 *   }
 *
 * Note: Does a fresh DB fetch, not just what's in the JWT/req.user.
 * This ensures role changes and deactivations are reflected immediately.
 * Use this on app startup to verify the stored profile is current.
 */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await authService.getProfile(req.user!.id);

    res.status(200).json({ data: { user: profile } });
  }),
);

// ─── PATCH /api/v1/auth/fcm-token ────────────────────────────────────────────
/**
 * Update or clear the FCM push notification token for this device.
 *
 * Requires: Authorization: Bearer <access_token>
 *
 * Request body: { fcm_token: string | null }
 *   Pass null to clear the token (user revoked push permissions).
 *   Pass a string to update/replace the current token.
 *
 * Response 204: Token updated (no body)
 *
 * Mobile clients should call this:
 *   1. After successful login
 *   2. Every time the app comes to the foreground
 *   3. When Firebase fires onTokenRefresh()
 */
authRouter.patch(
  '/fcm-token',
  requireAuth,
  validate(UpdateFCMTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { fcm_token } = req.body as { fcm_token: string | null };

    await authService.updateFcmToken(req.user!.id, fcm_token);

    res.status(204).send();
  }),
);

// ─── POST /api/v1/auth/change-password ───────────────────────────────────────
/**
 * Change password with current password verification.
 *
 * Requires: Authorization: Bearer <access_token>
 *
 * Request body: ChangePasswordInput
 *   { current_password, new_password, confirm_password }
 *
 * Response 204: Password changed, all sessions revoked (no body)
 *
 * CRITICAL: After this call succeeds, ALL sessions (all devices) are
 * invalidated. The client that made this call is also logged out.
 * The user must log in again with the new password on all devices.
 *
 * Response 401: current_password is wrong
 * Response 400: Validation error (passwords don't match, weak new password)
 */
authRouter.post(
  '/change-password',
  requireAuth,
  validate(ChangePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await authService.changePassword(
      req.user!.id,
      req.user!.email,
      req.body,
      req.ip ?? 'unknown',
    );

    // 204: Password changed. Client must discard tokens and re-login.
    res.status(204).send();
  }),
);
