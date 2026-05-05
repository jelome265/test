/**
 * notification.routes.ts — Authenticated notification management API.
 *
 * Mounted at: /api/v1/notifications
 *
 * All routes require authentication. Ownership is enforced by
 * notificationService (userId always comes from req.user.id, never from body).
 *
 * Endpoints:
 *   GET    /                  → List notifications (cursor-paged, optional unread filter)
 *   GET    /unread-count      → Badge count (must be before /:id to avoid ambiguity)
 *   PATCH  /read-all          → Mark all as read (must be before /:id to avoid ambiguity)
 *   PATCH  /:id/read          → Mark single notification as read
 *
 * Route ordering is critical in Express. Static segments (`/unread-count`,
 * `/read-all`) must be registered before parameterized segments (`/:id`) or
 * Express will match the parameter first and pass 'unread-count' as req.params.id.
 *
 * Response envelopes:
 *   GET / → { data: AppNotification[], next_cursor: string|null, unread_count: number }
 *   GET /unread-count → { data: { count: number } }
 *   PATCH /read-all → { data: { marked_count: number } }
 *   PATCH /:id/read → 204 No Content
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import { requireAuth } from '../middleware/auth.middleware.js';
import { notificationService } from '../services/notification.service.js';
import { asyncHandler } from '../utils/async-handler.js';

export const notificationRouter = Router();

// ─── GET /api/v1/notifications ────────────────────────────────────────────────
/**
 * List the authenticated user's notifications.
 *
 * Query parameters:
 *   limit       - number of results (1–50, default 20)
 *   cursor      - base64url cursor from previous response's next_cursor
 *   unread_only - 'true' to filter to unread only
 *
 * Response 200:
 *   {
 *     data:         AppNotification[],
 *     next_cursor:  string | null,    ← null when no more pages
 *     unread_count: number            ← always current unread count (for badge sync)
 *   }
 */
notificationRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const limit      = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
    const cursor     = req.query['cursor'] as string | undefined;
    const unreadOnly = req.query['unread_only'] === 'true';

    const result = await notificationService.listNotifications(req.user!.id, {
      limit:       isNaN(limit) ? 20 : limit,
      cursor:      cursor ?? undefined,
      unread_only: unreadOnly,
    });

    res.status(200).json(result);
  }),
);

// ─── GET /api/v1/notifications/unread-count ───────────────────────────────────
/**
 * Return the current unread notification count for the authenticated user.
 * Used by the mobile tab bar badge. Called on app foreground.
 *
 * Response 200:
 *   { data: { count: number } }
 */
notificationRouter.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const count = await notificationService.getUnreadCount(req.user!.id);
    res.status(200).json({ data: { count } });
  }),
);

// ─── PATCH /api/v1/notifications/read-all ────────────────────────────────────
/**
 * Mark all unread notifications as read for the authenticated user.
 *
 * Response 200:
 *   { data: { marked_count: number } }   ← number of notifications marked read
 */
notificationRouter.patch(
  '/read-all',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const markedCount = await notificationService.markAllAsRead(req.user!.id);
    res.status(200).json({ data: { marked_count: markedCount } });
  }),
);

// ─── PATCH /api/v1/notifications/:id/read ────────────────────────────────────
/**
 * Mark a single notification as read.
 *
 * Response 204: Marked as read (no body)
 * Response 404: Notification not found (or belongs to a different user)
 */
notificationRouter.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    await notificationService.markAsRead(req.params['id']!, req.user!.id);
    res.status(204).send();
  }),
);
