/**
 * shipment.integration.test.ts — Shipment HTTP layer integration tests.
 *
 * Tests routing, validation, auth, and response shape for shipment endpoints.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// ─── Hoist mocks ─────────────────────────────────────────────────────────────
const {
  mockGetQuote,
  mockCreateShipment,
  mockListShipments,
  mockGetShipment,
  mockGetShipmentHistory,
  mockConfirmDelivery,
  mockCancelShipment,
  mockAdminTransition,
  mockTrackShipment,
} = vi.hoisted(() => ({
  mockGetQuote:       vi.fn(),
  mockCreateShipment: vi.fn(),
  mockListShipments:  vi.fn(),
  mockGetShipment:    vi.fn(),
  mockGetShipmentHistory: vi.fn(),
  mockConfirmDelivery: vi.fn(),
  mockCancelShipment: vi.fn(),
  mockAdminTransition: vi.fn(),
  mockTrackShipment:  vi.fn(),
}));

// ─── Mock dependencies ───────────────────────────────────────────────────────
vi.mock('../../src/config/supabase.js', () => ({
  supabaseServiceRole: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data:  { user: { id: 'user-123', role: 'customer' } },
        error: null,
      }),
    },
  }),
  supabaseAnon: () => ({}),
  checkSupabaseHealth: vi.fn(),
}));

vi.mock('../../src/services/shipment.service.js', () => ({
  shipmentService: {
    getQuote:       mockGetQuote,
    createShipment: mockCreateShipment,
    listShipments:  mockListShipments,
    getShipment:    mockGetShipment,
    getShipmentHistory: mockGetShipmentHistory,
    confirmDelivery: mockConfirmDelivery,
    cancelShipment:  mockCancelShipment,
    adminTransitionShipment: mockAdminTransition,
    trackShipment:   mockTrackShipment,
  },
}));

vi.mock('../../src/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.user = { id: 'user-123', role: req.headers['x-role'] || 'customer' };
    next();
  },
}));

import { createApp } from '../../src/app.js';

describe('Shipment Routes Integration', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/shipments/quote', () => {
    it('returns 200 with quote data', async () => {
      mockGetQuote.mockResolvedValue({ total_mwk: 500000 });

      const res = await request(app)
        .get('/api/v1/shipments/quote')
        .query({
          pickup_city:   'Lilongwe',
          delivery_city: 'Blantyre',
          weight_kg:     2.5,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.total_mwk).toBe(500000);
    });

    it('returns 400 for missing parameters', async () => {
      const res = await request(app).get('/api/v1/shipments/quote');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/shipments', () => {
    const VALID_BODY = {
      sender: {
        full_name: 'John Doe',
        phone_number: '+265991234567',
        address: '123 Main St',
        city: 'Lilongwe',
      },
      receiver: {
        full_name: 'Jane Smith',
        phone_number: '+265881234567',
        address: '456 Second St',
        city: 'Blantyre',
      },
      package: {
        weight_kg: 2.0,
        size: 'medium',
        description: 'Books',
        is_fragile: false,
      },
    };

    it('returns 201 with created shipment', async () => {
      mockCreateShipment.mockResolvedValue({ shipment: { id: 'ship-123' } });

      const res = await request(app)
        .post('/api/v1/shipments')
        .send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(res.body.data.shipment.id).toBe('ship-123');
    });

    it('returns 400 for invalid weight', async () => {
      const res = await request(app)
        .post('/api/v1/shipments')
        .send({ ...VALID_BODY, package: { ...VALID_BODY.package, weight_kg: 15 } });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/shipments/tracking/:trackingNumber', () => {
    it('returns 200 with redacted shipment', async () => {
      mockTrackShipment.mockResolvedValue({ tracking_number: 'SHIP-ABC-123', status: 'in_transit' });

      const res = await request(app).get('/api/v1/shipments/tracking/SHIP-ABC-123');

      expect(res.status).toBe(200);
      expect(res.body.data.tracking_number).toBe('SHIP-ABC-123');
      expect(res.body.data.sender_name).toBeUndefined(); // Redacted
    });
  });

  describe('Admin Routes', () => {
    it('returns 403 for customer trying to access admin list', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipments')
        .set('x-role', 'customer');

      expect(res.status).toBe(403);
    });

    it('returns 200 for admin accessing list', async () => {
      mockListShipments.mockResolvedValue({ data: [], next_cursor: null });

      const res = await request(app)
        .get('/api/v1/admin/shipments')
        .set('x-role', 'admin');

      expect(res.status).toBe(200);
    });
  });
});
