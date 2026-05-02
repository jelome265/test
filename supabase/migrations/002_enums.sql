-- ═══════════════════════════════════════════════════════════════════
-- 002 — DOMAIN ENUM TYPES
-- All enum types used across the schema.
-- CRITICAL: Never remove a value from an enum — add new values only.
-- Removing enum values is a breaking schema change in PostgreSQL.
-- ═══════════════════════════════════════════════════════════════════

-- ─── User roles ────────────────────────────────────────────────────
-- Determines what a user can see and do via RLS and RBAC middleware.
CREATE TYPE user_role AS ENUM (
  'customer',      -- Standard user: create shipments, pay, confirm delivery
  'admin',         -- Staff: approve/reject shipments, manage couriers
  'super_admin'    -- Owner: manage admins, access all data, override anything
);

-- ─── Shipment lifecycle states ─────────────────────────────────────
-- Maps exactly to ShipmentStatus in packages/shared-types.
-- Transition rules enforced in: services/shipment-state-machine.ts
-- and in admin_transition_shipment() RPC below.
CREATE TYPE shipment_status AS ENUM (
  'pending_approval',   -- Initial state on creation
  'approved',           -- Admin approved; customer must now pay
  'payment_pending',    -- Payment initiated with Paychangu
  'payment_confirmed',  -- Payment verified via signed webhook
  'picked_up',          -- Courier collected; REQUIRES payment_confirmed first
  'in_transit',         -- Package en route
  'delivered',          -- Courier marked delivered; receiver must confirm
  'confirmed',          -- Receiver confirmed — TERMINAL
  'rejected',           -- Admin rejected — TERMINAL
  'cancelled',          -- User or admin cancelled — TERMINAL
  'failed'              -- Delivery failed; user may re-submit
);

-- ─── Package sizes ─────────────────────────────────────────────────
-- Used for pricing tier selection and operational logistics.
CREATE TYPE package_size AS ENUM (
  'small',    -- ≤ 1kg, fits in a backpack
  'medium',   -- 1–5kg, box-sized
  'large'     -- 5–10kg, max allowed by business rules
);

-- ─── Payment methods ───────────────────────────────────────────────
-- Represents the rail used for a specific payment transaction.
-- All are abstracted via Paychangu.
CREATE TYPE payment_method AS ENUM (
  'airtel_money',   -- Airtel Money mobile wallet
  'tnm_mpamba',     -- TNM Mpamba mobile wallet
  'bank_transfer',  -- Direct bank transfer
  'card'            -- Debit/credit card (Paychangu card gateway)
);

-- ─── Payment lifecycle states ──────────────────────────────────────
-- Independent from shipment_status. A shipment advances to
-- payment_confirmed ONLY when payment.status = 'paid'.
CREATE TYPE payment_status AS ENUM (
  'pending',     -- Record created; not yet sent to provider
  'processing',  -- Sent to Paychangu; awaiting callback
  'paid',        -- Webhook confirmed success — triggers shipment advance
  'failed',      -- Webhook confirmed failure — resets shipment to approved
  'refunded',    -- Refund processed (future capability)
  'expired'      -- 30-minute window elapsed without resolution
);

-- ─── Notification types ────────────────────────────────────────────
-- Each type maps to a specific notification template in the backend.
CREATE TYPE notification_type AS ENUM (
  'shipment_created',
  'shipment_approved',
  'shipment_rejected',
  'payment_confirmed',
  'payment_failed',
  'shipment_picked_up',
  'shipment_in_transit',
  'shipment_delivered',
  'shipment_confirmed',
  'admin_new_request'
);

-- ─── Dispute categories ─────────────────────────────────────────────
CREATE TYPE dispute_category AS ENUM (
  'package_damaged',
  'package_lost',
  'not_delivered',
  'wrong_delivery',
  'payment_issue',
  'other'
);

-- ─── Dispute status ─────────────────────────────────────────────────
CREATE TYPE dispute_status AS ENUM (
  'open',
  'under_review',
  'resolved',
  'closed'
);

-- ─── Audit event types ─────────────────────────────────────────────
-- Extensible list of auditable actions across the system.
CREATE TYPE audit_event_type AS ENUM (
  'user_login',
  'user_logout',
  'user_registered',
  'user_password_changed',
  'user_role_changed',
  'user_deactivated',
  'user_reactivated',
  'shipment_created',
  'shipment_status_changed',
  'shipment_reviewed',
  'payment_initiated',
  'payment_webhook_received',
  'payment_refunded',
  'dispute_opened',
  'dispute_resolved',
  'admin_rpc_called'
);
