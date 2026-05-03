/**
 * shipment.routes.ts — Shipment API routes.
 *
 * Deliveries 11 endpoints for customer and admin shipment management.
 *
 * Endpoints:
 *   GET    /quote                   → Public price estimate
 *   POST   /                        → Create shipment (Customer)
 *   GET    /                        → List own shipments (Customer)
 *   GET    /:id                     → Get detail (Owner/Admin)
 *   GET    /:id/history             → Get timeline (Owner/Admin)
 *   POST   /:id/confirm             → Confirm delivery (Owner)
 *   PATCH  /:id/cancel              → Cancel shipment (Owner)
 *   GET    /tracking/:trackingNumber → Public tracking
 *
 * Admin Endpoints (exported as adminShipmentRouter):
 *   GET    /shipments               → List all (Admin)
 *   GET    /shipments/:id           → Full detail (Admin)
 *   POST   /shipments/:id/transition → State transition (Admin)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import {
  CreateShipmentSchema,
  QuoteSchema,
  AdminStatusUpdateSchema,
} from '@courier/shared-validation';
import type { ShipmentStatus } from '@courier/shared-types';

import { requireAuth } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import { shipmentService } from '../services/shipment.service.js';

// ─── Customer Router ─────────────────────────────────────────────────────────
export const shipmentRouter = Router();

/**
 * GET /api/v1/shipments/quote
 * Public endpoint to get a price estimate.
 */
shipmentRouter.get(
  '/quote',
  validate(QuoteSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.getQuote(req.query as any);
    res.status(200).json({ data: result });
  }),
);

/**
 * GET /api/v1/shipments/tracking/:trackingNumber
 * Public tracking lookup. Redacted information (no PII).
 */
shipmentRouter.get(
  '/tracking/:trackingNumber',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.trackShipment(req.params.trackingNumber!);
    res.status(200).json({ data: result });
  }),
);

/**
 * POST /api/v1/shipments
 * Create a new shipment.
 */
shipmentRouter.post(
  '/',
  requireAuth,
  requireRole('customer'),
  validate(CreateShipmentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.createShipment(
      req.body,
      req.user!.id,
      req.ip ?? 'unknown',
    );
    res.status(201).json({ data: result });
  }),
);

/**
 * GET /api/v1/shipments
 * List own shipments (paginated).
 */
shipmentRouter.get(
  '/',
  requireAuth,
  requireRole('customer'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.listShipments(
      {
        cursor: req.query.cursor as string,
        limit:  req.query.limit ? parseInt(req.query.limit as string) : 20,
        status: req.query.status as ShipmentStatus,
      },
      req.user!.id,
      false,
    );
    res.status(200).json(result);
  }),
);

/**
 * GET /api/v1/shipments/:id
 * Get single shipment detail.
 */
shipmentRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
    const result = await shipmentService.getShipment(req.params.id!!, req.user!.id, isAdmin);
    res.status(200).json({ data: result });
  }),
);

/**
 * GET /api/v1/shipments/:id/history
 * Get shipment history timeline.
 */
shipmentRouter.get(
  '/:id/history',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.getShipmentHistory(
      req.params.id!,
      req.user!.id,
      req.user!.role,
    );
    res.status(200).json({ data: result });
  }),
);

/**
 * POST /api/v1/shipments/:id/confirm
 * Customer confirms delivery receipt.
 */
shipmentRouter.post(
  '/:id/confirm',
  requireAuth,
  requireRole('customer'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.confirmDelivery(
      req.params.id!,
      req.user!.id,
      req.ip ?? 'unknown',
    );
    res.status(200).json({ data: result });
  }),
);

/**
 * PATCH /api/v1/shipments/:id/cancel
 * Customer cancels shipment (pre-pickup only).
 */
shipmentRouter.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('customer'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.cancelShipment(
      req.params.id!,
      req.user!.id,
      req.ip ?? 'unknown',
      req.body.reason,
    );
    res.status(200).json({ data: result });
  }),
);

// ─── Admin Shipment Router ───────────────────────────────────────────────────
export const adminShipmentRouter = Router();

/**
 * GET /api/v1/admin/shipments
 * List all shipments (Admin).
 */
adminShipmentRouter.get(
  '/',
  requireAuth,
  requireRole('admin', 'super_admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.listShipments(
      {
        cursor:  req.query.cursor as string,
        limit:   req.query.limit ? parseInt(req.query.limit as string) : 20,
        status:  req.query.status as ShipmentStatus,
        user_id: req.query.user_id as string,
        search:  req.query.search as string,
      },
      req.user!.id,
      true,
    );
    res.status(200).json(result);
  }),
);

/**
 * GET /api/v1/admin/shipments/:id
 * Admin detail view.
 */
adminShipmentRouter.get(
  '/:id',
  requireAuth,
  requireRole('admin', 'super_admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shipmentService.getShipment(req.params.id!, req.user!.id, true);
    res.status(200).json({ data: result });
  }),
);

/**
 * POST /api/v1/admin/shipments/:id/transition
 * Admin state transition.
 */
adminShipmentRouter.post(
  '/:id/transition',
  requireAuth,
  requireRole('admin', 'super_admin'),
  validate(AdminStatusUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { status, notes, rejection_reason } = req.body;
    const result = await shipmentService.adminTransitionShipment(
      req.params.id!,
      status,
      req.user!.id,
      req.user!.role,
      req.ip ?? 'unknown',
      { notes, rejection_reason },
    );
    res.status(200).json({ data: result });
  }),
);
