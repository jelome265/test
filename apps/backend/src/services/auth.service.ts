/**
 * auth.service.ts — Authentication business logic.
 *
 * All authentication operations delegate to Supabase Auth for identity
 * management. This service owns the application-layer concerns:
 *   - Profile verification after registration
 *   - Audit trail for all auth events
 *   - FCM token management
 *   - Deactivated account enforcement
 *   - Error normalization from Supabase auth errors
 *
 * SECURITY CONTRACT:
 *   - This service NEVER logs passwords, tokens, or refresh tokens
 *   - This service NEVER returns raw Supabase error messages to callers
 *     (Supabase error messages may contain implementation details)
 *   - All external inputs are validated by the Zod middleware layer
 *     BEFORE any service method is called
 *   - The service role client is used for admin operations only
 *     (registration, profile verification, logout, FCM update)
 *   - The anon client with user credentials is used for login operations
 *
 * Failure modes handled:
 *   - Supabase auth service unavailable → 502 ExternalServiceError
 *   - Email already registered → 409 ConflictError
 *   - Wrong credentials → 401 AuthenticationError (same message as
 *     "email not found" to prevent account enumeration)
 *   - Expired refresh token → 401 AuthenticationError
 *   - Deactivated account → 403 AuthorizationError
 *   - Profile trigger failure → 500 InternalError + auth user cleanup
 */

import type { UserRole } from '@courier/shared-types';
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
} from '@courier/shared-validation';

import { supabaseServiceRole, supabaseAnon } from '../config/supabase.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  ExternalServiceError,
  NotFoundError,
} from '../errors/app-error.js';
import { auditService } from './audit.service.js';
import { logger } from '../utils/logger.js';

// ─── Response types ───────────────────────────────────────────────────────────

export interface AuthTokens {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;    // Seconds until access_token expires
  token_type:    'bearer';
}

export interface UserProfileResponse {
  id:           string;
  email:        string;
  full_name:    string;
  phone_number: string;
  role:         UserRole;
  is_active:    boolean;
  fcm_token:    string | null;
  created_at:   string;
  updated_at:   string;
}

export interface RegisterResult {
  user:   UserProfileResponse;
  tokens: AuthTokens;
}

export interface LoginResult {
  user:   UserProfileResponse;
  tokens: AuthTokens;
}

export interface RefreshResult {
  tokens: AuthTokens;
}

// ─── Supabase auth error classifier ──────────────────────────────────────────
// Supabase auth errors use message strings, not error codes.
// We map these to our error hierarchy without leaking the raw message.

function classifySupabaseAuthError(message: string): never {
  const lower = message.toLowerCase();

  // Duplicate registration
  if (
    lower.includes('user already registered') ||
    lower.includes('email address is already registered') ||
    lower.includes('already been registered')
  ) {
    throw new ConflictError('An account with this email address already exists');
  }

  // Invalid credentials — use generic message to prevent account enumeration
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('email not confirmed') ||
    lower.includes('invalid password') ||
    lower.includes('user not found')
  ) {
    throw new AuthenticationError(
      'Incorrect email or password. Please try again.',
    );
  }

  // Refresh token expired or invalid
  if (
    lower.includes('refresh token not found') ||
    lower.includes('token has expired') ||
    lower.includes('invalid refresh token') ||
    lower.includes('already used')
  ) {
    throw new AuthenticationError(
      'Your session has expired. Please log in again.',
    );
  }

  // Rate limited by Supabase Auth (separate from our rate limiter)
  if (lower.includes('for security purposes') || lower.includes('rate limit')) {
    throw new AuthenticationError(
      'Too many attempts. Please wait a moment before trying again.',
    );
  }

  // Password requirements not met (Supabase-side policy)
  if (lower.includes('password') && lower.includes('weak')) {
    throw new AuthenticationError(
      'Password does not meet security requirements.',
    );
  }

  // Fallthrough — external service issue
  logger.error({ supabaseMessage: message }, 'Unclassified Supabase auth error');
  throw new ExternalServiceError('auth', 'Authentication service error. Please try again.');
}

// ─── Profile loader ───────────────────────────────────────────────────────────
// Loads a user_profiles row and normalizes it to UserProfileResponse.
// Throws NotFoundError if the profile doesn't exist (data integrity issue).

async function loadProfile(userId: string): Promise<UserProfileResponse> {
  const { data: profile, error } = await supabaseServiceRole()
    .from('user_profiles')
    .select('id, email, full_name, phone_number, role, is_active, fcm_token, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    logger.error({ userId, error: error?.message }, 'Profile not found after auth operation');
    throw new NotFoundError('User profile');
  }

  return {
    id:           profile.id as string,
    email:        profile.email as string,
    full_name:    profile.full_name as string,
    phone_number: profile.phone_number as string,
    role:         profile.role as UserRole,
    is_active:    profile.is_active as boolean,
    fcm_token:    profile.fcm_token as string | null,
    created_at:   profile.created_at as string,
    updated_at:   profile.updated_at as string,
  };
}

// ─── Token builder ────────────────────────────────────────────────────────────

function buildTokens(session: {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
}): AuthTokens {
  return {
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
    expires_in:    session.expires_in,
    token_type:    'bearer',
  };
}

// ─── Auth Service class ───────────────────────────────────────────────────────

class AuthService {
  /**
   * register() — Create a new customer account.
   *
   * Flow:
   *   1. Call supabase.auth.signUp() with email + password + metadata
   *   2. Supabase creates auth.users row and triggers handle_new_auth_user()
   *      which creates the user_profiles row (migration 004)
   *   3. Verify the user_profiles row was created (trigger could have failed)
   *   4. If profile missing: delete the orphaned auth user + throw 500
   *   5. Write registration audit log entry
   *   6. Return profile + tokens
   *
   * Supabase email confirmation:
   *   config.toml sets enable_confirmations = false for mobile.
   *   signUp() immediately returns a session (no email verification required).
   *   Change this in production if email verification is required.
   *
   * @param input - Validated RegisterInput from the request body
   * @param actorIp - Request IP address for audit log
   * @param actorUa - User-Agent header for audit log
   */
  async register(
    input: RegisterInput,
    actorIp: string,
    actorUa: string,
  ): Promise<RegisterResult> {
    // ── Step 1: Create Supabase auth user ────────────────────────────────────
    const { data: signUpData, error: signUpError } = await supabaseAnon().auth.signUp({
      email:    input.email,
      password: input.password,
      options: {
        data: {
          // These are passed as raw_user_meta_data to the auth trigger
          full_name:    input.full_name,
          phone_number: input.phone_number,
        },
      },
    });

    if (signUpError) {
      classifySupabaseAuthError(signUpError.message);
    }

    if (!signUpData.user || !signUpData.session) {
      // This happens if email confirmation is required — but we disabled it.
      // If this fires, config.toml or Supabase dashboard has conflicting settings.
      logger.error(
        { email: input.email },
        'Registration returned no user/session — email confirmation may be enabled unexpectedly',
      );
      throw new InternalError(
        'Registration could not complete. Email confirmation may be required.',
      );
    }

    const authUser = signUpData.user;
    const session  = signUpData.session;

    // ── Step 2: Verify profile was created by the trigger ────────────────────
    // Give the trigger up to 3 attempts with a short delay.
    // In practice the trigger fires synchronously within the same transaction,
    // but this guard handles any eventual-consistency edge cases in Supabase's
    // hosted environment.
    let profile: UserProfileResponse | null = null;
    let profileError: string | null         = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, error } = await supabaseServiceRole()
        .from('user_profiles')
        .select('id, email, full_name, phone_number, role, is_active, fcm_token, created_at, updated_at')
        .eq('id', authUser.id)
        .single();

      if (data) {
        profile = {
          id:           data.id as string,
          email:        data.email as string,
          full_name:    data.full_name as string,
          phone_number: data.phone_number as string,
          role:         data.role as UserRole,
          is_active:    data.is_active as boolean,
          fcm_token:    data.fcm_token as string | null,
          created_at:   data.created_at as string,
          updated_at:   data.updated_at as string,
        };
        break;
      }

      profileError = error?.message ?? 'Profile not found';

      if (attempt < 3) {
        // Wait 100ms before retrying
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
    }

    // ── Step 3: Handle trigger failure — clean up orphaned auth user ─────────
    if (!profile) {
      logger.error(
        { userId: authUser.id, email: input.email, error: profileError },
        'user_profiles row not created after registration — cleaning up orphaned auth user',
      );

      // Best-effort cleanup: delete the orphaned Supabase auth user
      const { error: deleteError } = await supabaseServiceRole().auth.admin.deleteUser(
        authUser.id,
      );

      if (deleteError) {
        logger.error(
          { userId: authUser.id, error: deleteError.message },
          'Failed to clean up orphaned auth user — manual cleanup required',
        );
      }

      throw new InternalError(
        'Registration failed during profile creation. Please try again.',
      );
    }

    // ── Step 4: Audit log ─────────────────────────────────────────────────────
    await auditService.logRegistration(authUser.id, actorIp, actorUa);

    logger.info({ userId: authUser.id, email: input.email }, 'User registered');

    return {
      user:   profile,
      tokens: buildTokens(session),
    };
  }

  /**
   * login() — Authenticate with email + password, return tokens + profile.
   *
   * Uses the anon client (not service role) so Supabase applies its own
   * auth rate limiting and credential validation correctly.
   *
   * Deactivated accounts: we load the profile AFTER a successful Supabase
   * auth to check is_active. The Supabase auth succeeds (credentials are
   * correct) but we return a 403 before returning tokens. This means
   * deactivated users still count toward auth rate limits — intentional,
   * as it prevents brute-force discovery of account states.
   *
   * Account enumeration: Supabase returns "invalid login credentials" for both
   * wrong password AND non-existent email. We preserve this behaviour by
   * using classifySupabaseAuthError() which maps all invalid credential errors
   * to the same generic message.
   */
  async login(
    input: LoginInput,
    actorIp: string,
    actorUa: string,
  ): Promise<LoginResult> {
    // ── Step 1: Authenticate with Supabase ────────────────────────────────────
    const { data: signInData, error: signInError } = await supabaseAnon()
      .auth.signInWithPassword({
        email:    input.email,
        password: input.password,
      });

    if (signInError) {
      // Write failed login audit (no userId since auth failed)
      await auditService.log({
        event:    'user_login',
        actorIp,
        actorUa,
        success:  false,
        payload:  { email: input.email },
        errorMessage: 'invalid_credentials',
      });

      classifySupabaseAuthError(signInError.message);
    }

    if (!signInData.user || !signInData.session) {
      throw new InternalError('Login returned no session — this should not happen');
    }

    const authUser = signInData.user;
    const session  = signInData.session;

    // ── Step 2: Load profile and check is_active ──────────────────────────────
    const profile = await loadProfile(authUser.id);

    if (!profile.is_active) {
      // Audit the deactivated account attempt
      await auditService.log({
        event:       'user_login',
        actorId:     authUser.id,
        actorIp,
        actorUa,
        targetType:  'user',
        targetId:    authUser.id,
        success:     false,
        errorMessage: 'account_deactivated',
      });

      throw new AuthorizationError(
        'Your account has been deactivated. Please contact support.',
      );
    }

    // ── Step 3: Audit successful login ────────────────────────────────────────
    await auditService.logLogin(authUser.id, actorIp, actorUa);

    logger.info({ userId: authUser.id, email: input.email }, 'User logged in');

    return {
      user:   profile,
      tokens: buildTokens(session),
    };
  }

  /**
   * refreshTokens() — Exchange a refresh token for new access + refresh tokens.
   *
   * Supabase implements single-use refresh tokens: calling refreshSession()
   * immediately invalidates the provided refresh_token and returns a new pair.
   *
   * IMPORTANT: The mobile client MUST replace both tokens atomically.
   * If the network drops after the server returns new tokens but before
   * the client stores them, the user will need to re-authenticate.
   * This is a known trade-off of single-use refresh token schemes.
   *
   * The returned tokens SHOULD be persisted to expo-secure-store immediately
   * (documented in Phase 9 mobile implementation).
   */
  async refreshTokens(refreshToken: string): Promise<RefreshResult> {
    const { data, error } = await supabaseAnon().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      classifySupabaseAuthError(error.message);
    }

    if (!data.session) {
      throw new AuthenticationError('Session refresh failed. Please log in again.');
    }

    return {
      tokens: buildTokens(data.session),
    };
  }

  /**
   * logout() — Revoke all sessions for the authenticated user.
   *
   * Uses admin.signOut() with 'global' scope to revoke ALL active sessions,
   * not just the one associated with the current token. This is the secure
   * default — see ADR-017.
   *
   * The 'local' scope option (revoke only current session) is intentionally
   * not implemented in Phase 1. If per-device session management is needed,
   * add it in a later phase with proper session tracking.
   */
  async logout(userId: string, actorIp: string): Promise<void> {
    const { error } = await supabaseServiceRole().auth.admin.signOut(
      userId,
      'global', // Revoke all sessions, not just current token
    );

    if (error) {
      // Non-fatal: if session revocation fails, the token will still expire
      // in ≤1 hour. Log the failure but don't fail the request.
      logger.error(
        { userId, error: error.message },
        'Session revocation failed — token will expire naturally',
      );
    }

    await auditService.logLogout(userId, actorIp);
    logger.info({ userId }, 'User logged out — all sessions revoked');
  }

  /**
   * getProfile() — Return the authenticated user's profile.
   *
   * Uses the userId from req.user (already loaded by auth.middleware.ts).
   * Does a fresh DB fetch to get the most current data — auth middleware
   * caches nothing, but the profile loaded there may be milliseconds old.
   * For a GET /me endpoint, a fresh fetch is the right call.
   */
  async getProfile(userId: string): Promise<UserProfileResponse> {
    return loadProfile(userId);
  }

  /**
   * updateFcmToken() — Replace the user's FCM push notification token.
   *
   * This is a simple upsert — no history, no multi-device tracking in Phase 1.
   * If fcm_token is null, the field is cleared (user revoked push permissions).
   *
   * See ADR-018 for rationale on aggressive token refresh.
   */
  async updateFcmToken(userId: string, fcmToken: string | null): Promise<void> {
    const { error } = await supabaseServiceRole()
      .from('user_profiles')
      .update({ fcm_token: fcmToken })
      .eq('id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'FCM token update failed');
      throw new ExternalServiceError('database', 'Failed to update notification token');
    }

    logger.debug({ userId, hasToken: fcmToken !== null }, 'FCM token updated');
  }

  /**
   * changePassword() — Change password with current password re-verification.
   *
   * Flow:
   *   1. Re-authenticate with email + current_password to verify identity
   *   2. Call Supabase admin API to update the password
   *   3. Revoke ALL sessions (force re-login on all devices with new password)
   *   4. Audit log the change
   *
   * Step 3 (session revocation) is required security hygiene after a password
   * change. Any attacker who obtained the previous password and is holding
   * sessions will be logged out immediately.
   *
   * @param userId - The authenticated user's ID (from req.user)
   * @param email - The user's email (from req.user.email)
   * @param input - Validated ChangePasswordInput
   * @param actorIp - For audit log
   */
  async changePassword(
    userId:  string,
    email:   string,
    input:   ChangePasswordInput,
    actorIp: string,
  ): Promise<void> {
    // ── Step 1: Re-authenticate with current password ─────────────────────────
    // This is the critical check — ensures the caller knows the current password
    // and is not just replaying a stolen JWT.
    const { error: verifyError } = await supabaseAnon().auth.signInWithPassword({
      email,
      password: input.current_password,
    });

    if (verifyError) {
      // Do NOT use classifySupabaseAuthError here — we want a specific message
      // that tells the user their CURRENT password was wrong.
      throw new AuthenticationError(
        'Current password is incorrect. Password was not changed.',
      );
    }

    // ── Step 2: Update password via admin API ─────────────────────────────────
    const { error: updateError } = await supabaseServiceRole().auth.admin.updateUserById(
      userId,
      { password: input.new_password },
    );

    if (updateError) {
      logger.error({ userId, error: updateError.message }, 'Password update failed');
      throw new ExternalServiceError('auth', 'Password update failed. Please try again.');
    }

    // ── Step 3: Revoke all sessions ───────────────────────────────────────────
    // After a password change, all existing sessions should be invalid.
    // This includes the current session — the client MUST re-login.
    const { error: signOutError = null } = await supabaseServiceRole().auth.admin.signOut(
      userId,
      'global',
    );

    if (signOutError) {
      // Non-fatal: password was changed successfully, session revocation failed
      logger.warn(
        { userId, error: (signOutError as any).message },
        'Session revocation after password change failed',
      );
    }

    // ── Step 4: Audit log ─────────────────────────────────────────────────────
    await auditService.log({
      event:      'user_password_changed',
      actorId:    userId,
      actorIp,
      targetType: 'user',
      targetId:   userId,
    });

    logger.info({ userId }, 'Password changed — all sessions revoked');
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const authService = new AuthService();
