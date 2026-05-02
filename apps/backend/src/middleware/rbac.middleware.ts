/**
 * rbac.middleware.ts — Role-Based Access Control middleware factory.
 *
 * Usage:
 *   router.patch('/admin/shipments/:id',
 *     requireAuth,
 *     requireRole('admin', 'super_admin'),
 *     asyncHandler(async (req, res) => { ... })
 *   );
 *
 * Design: requireRole() returns a middleware function — it is a factory.
 * This enables composable role guards without code duplication.
 *
 * INVARIANT: requireRole MUST be placed AFTER requireAuth in the middleware
 * chain. requireRole assumes req.user is populated.
 *
 * Hierarchy (permissive superset):
 *   super_admin → can do everything admin can do, plus user management
 *   admin       → can approve/reject shipments, view all data
 *   customer    → can only access own data
 *
 * DO NOT implement hierarchy here. Keep it explicit:
 *   requireRole('admin', 'super_admin') — both can approve
 *   requireRole('super_admin')          — only super_admin can promote users
 *
 * Implicit hierarchy hides privilege escalation bugs. Explicit is safer.
 */

import type { UserRole } from '@courier/shared-types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AuthenticationError, AuthorizationError } from '../errors/app-error.js';

/**
 * Returns a middleware that enforces the caller has one of the specified roles.
 * At least one role must be provided.
 *
 * @param allowedRoles - One or more roles that are permitted to access the route.
 */
export function requireRole(...allowedRoles: [UserRole, ...UserRole[]]): RequestHandler {
  if (allowedRoles.length === 0) {
    throw new Error('requireRole() requires at least one role argument');
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    // Guard: requireAuth must have run before this middleware
    if (!req.user) {
      next(new AuthenticationError('requireRole used without requireAuth in chain'));
      return;
    }

    const userRole = req.user.role;
    const hasRole  = allowedRoles.includes(userRole);

    if (!hasRole) {
      next(
        new AuthorizationError(
          `This action requires one of the following roles: ${allowedRoles.join(', ')}. ` +
          `Your role is: ${userRole}`,
        ),
      );
      return;
    }

    next();
  };
}

// ─── Convenience exports ──────────────────────────────────────────────────────
// Pre-composed guards for the most common patterns.

/** Allow any authenticated user (customers, admins, super_admin). */
export const requireAnyRole = requireRole('customer', 'admin', 'super_admin');

/** Allow admin and super_admin. Used for most admin operations. */
export const requireAdminRole = requireRole('admin', 'super_admin');

/** Allow only super_admin. Used for: user role changes, pricing config. */
export const requireSuperAdminRole = requireRole('super_admin');
