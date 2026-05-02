/**
 * auth.middleware.ts — JWT authentication middleware.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT with Supabase (validates signature + expiry)
 *   3. Load user_profiles row (for role + is_active)
 *   4. Reject deactivated accounts (even with valid JWT)
 *   5. Attach AuthenticatedUser to req.user
 *
 * Design: Two middleware exports:
 *   requireAuth     → request MUST be authenticated (throws 401 if not)
 *   optionalAuth    → attaches user if token present, continues if not
 *
 * Extend Express Request type via module augmentation below so TypeScript
 * knows about req.user throughout the application.
 */

import type { UserRole } from '@courier/shared-types';
import type { NextFunction, Request, Response } from 'express';

import { supabaseServiceRole } from '../config/supabase.js';
import {
  AuthenticationError,
  AuthorizationError,
  mapSupabaseError,
} from '../errors/app-error.js';
import { logger } from '../utils/logger.js';

// ─── Augment Express Request ──────────────────────────────────────────────────
// This declaration merges into the Express namespace globally.
// All route handlers can access req.user after requireAuth runs.

export interface AuthenticatedUser {
  id:           string;
  email:        string;
  role:         UserRole;
  full_name:    string;
  phone_number: string;
  is_active:    boolean;
  fcm_token:    string | null;
  // The raw access token — passed downstream for Supabase user-scoped operations
  accessToken:  string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ─── Token extractor ─────────────────────────────────────────────────────────

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ─── Core auth logic ─────────────────────────────────────────────────────────

async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  // Step 1: Verify JWT with Supabase Auth
  const { data: authData, error: authError } = await supabaseServiceRole()
    .auth.getUser(token);

  if (authError || !authData.user) {
    logger.debug({ error: authError?.message }, 'JWT verification failed');
    return null;
  }

  const supabaseUser = authData.user;

  // Step 2: Load the application user profile (role, is_active, etc.)
  const { data: profile, error: profileError } = await supabaseServiceRole()
    .from('user_profiles')
    .select('id, email, full_name, phone_number, role, is_active, fcm_token')
    .eq('id', supabaseUser.id)
    .single();

  if (profileError) {
    logger.error(
      { userId: supabaseUser.id, error: profileError.message },
      'Failed to load user profile during authentication',
    );
    throw mapSupabaseError(profileError);
  }

  if (!profile) {
    // Profile missing for authenticated user — data integrity issue
    logger.error(
      { userId: supabaseUser.id },
      'User authenticated but profile not found in user_profiles',
    );
    return null;
  }

  return {
    id:           profile.id as string,
    email:        profile.email as string,
    role:         profile.role as UserRole,
    full_name:    profile.full_name as string,
    phone_number: profile.phone_number as string,
    is_active:    profile.is_active as boolean,
    fcm_token:    profile.fcm_token as string | null,
    accessToken:  token,
  };
}

// ─── requireAuth middleware ───────────────────────────────────────────────────
// Routes MUST be authenticated. Throws 401 if no valid token, 403 if deactivated.

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await authenticateRequest(req);

    if (!user) {
      throw new AuthenticationError('Valid authentication token required');
    }

    if (!user.is_active) {
      throw new AuthorizationError('Your account has been deactivated. Contact support.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── optionalAuth middleware ──────────────────────────────────────────────────
// Attaches user to req if a valid token is present. Never throws on missing token.
// Used for: public endpoints that show different data to authenticated users.

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await authenticateRequest(req);

    if (user?.is_active) {
      req.user = user;
    }

    next();
  } catch (err) {
    // On optional auth, swallow auth errors and continue unauthenticated
    logger.debug({ err }, 'Optional auth failed — continuing unauthenticated');
    next();
  }
}
