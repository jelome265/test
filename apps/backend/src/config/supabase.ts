/**
 * supabase.ts — Two Supabase client singletons.
 *
 * CRITICAL SECURITY RULE:
 *   supabaseServiceRole → bypasses ALL Row-Level Security policies.
 *     Use for: webhook processing, admin RPCs, notification dispatch,
 *              any operation that must cross user ownership boundaries.
 *
 *   supabaseAnon → respects ALL Row-Level Security policies.
 *     Use for: user-scoped reads where the DB should enforce ownership.
 *
 * NEVER pass supabaseServiceRole to a function that will execute
 * user-supplied query parameters. That would be an RLS bypass vulnerability.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from './env.js';

// ─── Service-role client ──────────────────────────────────────────────────────
// Bypasses RLS. Used exclusively by backend services.
// The service role key MUST NEVER be exposed to clients or logged.
let _serviceRoleClient: SupabaseClient | null = null;

export function supabaseServiceRole(): SupabaseClient {
  if (!_serviceRoleClient) {
    _serviceRoleClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        // Do not persist sessions — this is a server-side client
        persistSession: false,
        // Auto-refresh is meaningless for service role (no expiry)
        autoRefreshToken: false,
        // Never detect session in headers/cookies
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          // Identify backend requests in Supabase logs
          'x-client-info': 'courier-backend/1.0.0',
        },
      },
    });
  }
  return _serviceRoleClient;
}

// ─── Anon client ─────────────────────────────────────────────────────────────
// Respects RLS. Used for operations where the DB should enforce ownership.
// In practice, most backend operations use the service role — the anon client
// is kept for specific RLS-enforced reads used in auth flows.
let _anonClient: SupabaseClient | null = null;

export function supabaseAnon(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return _anonClient;
}

// ─── User-scoped client factory ───────────────────────────────────────────────
// Creates a temporary Supabase client scoped to a specific user JWT.
// Used when you need RLS to apply as a specific authenticated user.
// Do NOT cache these — create and discard per request.
export function supabaseAsUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        // Inject the user's JWT — Supabase RLS reads auth.uid() from this
        Authorization: `Bearer ${accessToken}`,
      },
    },
  }) as SupabaseClient;
}

// ─── Health check ─────────────────────────────────────────────────────────────
// Verifies database connectivity. Used by /api/health/detailed endpoint.
export async function checkSupabaseHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const { error } = await supabaseServiceRole()
      .from('user_profiles')
      .select('id')
      .limit(1)
      .single();

    // PGRST116 = no rows found — that is fine, connectivity is confirmed
    const ok = !error || error.code === 'PGRST116';
    return { ok, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}
