/**
 * admin.routes.ts — Admin-only management routes.
 *
 * Mounted at: /api/v1/admin
 *
 * Endpoints:
 *   GET /stats → Platform statistics (admin only)
 *
 * Note: Shipment admin routes are in shipment.routes.ts (adminShipmentRouter).
 * This file handles non-shipment admin operations.
 */

import { Router }      from 'express';
import type { Request, Response } from 'express';

import { supabaseServiceRole } from '../config/supabase.js';
import { mapSupabaseError }  from '../errors/app-error.js';
import { requireAuth }      from '../middleware/auth.middleware.js';
import { requireAdminRole } from '../middleware/rbac.middleware.js';
import { asyncHandler }     from '../utils/async-handler.js';
import { logger }           from '../utils/logger.js';

export const adminRouter = Router();

// ─── GET /api/v1/admin/stats ──────────────────────────────────────────────────
/**
 * Returns aggregate platform stats from get_platform_stats() RPC.
 *
 * Response 200:
 *   { data: PlatformStats }
 *
 * Cache hint: results are STABLE — same within same second.
 * Consider a 60-second Cache-Control header for repeated polling.
 */
adminRouter.get(
  '/stats',
  requireAuth,
  requireAdminRole,
  asyncHandler(async (req: Request, res: Response) => {
    const { data, error } = await supabaseServiceRole().rpc('get_platform_stats');

    if (error) {
      logger.error({ error: error.message }, 'get_platform_stats RPC failed');
      throw mapSupabaseError(error);
    }

    const { error: auditError } = await supabaseServiceRole()
      .from('audit_log')
      .insert({
        event_type:  'admin_rpc_called',
        actor_id:    req.user!.id,
        actor_role:  req.user!.role,
        actor_ip:    req.ip ?? null,
        target_type: 'platform',
        payload:     { rpc: 'get_platform_stats' },
      });

    if (auditError) {
      logger.error({ error: auditError.message }, 'admin stats audit log write failed');
    }

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).json({ data });
  }),
);
