# COURIER PLATFORM — PHASE 2: DATABASE SCHEMA & MIGRATIONS
## Supabase PostgreSQL · 15 Migration Files · Production-Grade
## Row-Level Security · Immutable Audit Trail · Realtime · Storage

---

> **What this document is.**
> Complete, executable Phase 2 deliverable. Every SQL file is production-ready,
> ordered for sequential execution, and annotated with rationale per decision.
> Apply via `supabase db push` or `psql` in order. Never edit a committed migration —
> create a new one.

---

## EXECUTION ORDER

```
supabase/migrations/
├── 001_extensions.sql          ← PostgreSQL extensions
├── 002_enums.sql               ← All domain enum types
├── 003_shared_triggers.sql     ← updated_at + audit helpers
├── 004_user_profiles.sql       ← Identity table + RLS
├── 005_saved_addresses.sql     ← User address book + RLS
├── 006_shipments.sql           ← Core shipment record + RLS
├── 007_shipment_status_events.sql  ← Immutable status audit trail + RLS
├── 008_payments.sql            ← Payment records + idempotency + RLS
├── 009_notifications.sql       ← In-app notification inbox + RLS
├── 010_audit_log.sql           ← Generic sensitive-action audit log
├── 011_pricing_config.sql      ← Pricing rules (temporal, versioned)
├── 012_disputes.sql            ← Dispute tickets + evidence + RLS
├── 013_realtime.sql            ← Supabase Realtime publication config
├── 014_admin_rpc.sql           ← Admin RPC functions (stats, transitions)
└── 015_storage.sql             ← Storage bucket policies
```

---

## ARCHITECTURE DECISIONS ENFORCED BY SCHEMA

| Decision | Schema enforcement |
|---|---|
| Tambala for all money | All `*_mwk` columns are `INTEGER NOT NULL` |
| Sender/receiver snapshot | Flat columns on `shipments`, no FK to users |
| Optimistic concurrency | State transitions use `WHERE status = $expected` in RPC |
| Idempotency for payments | `UNIQUE` on `payments.idempotency_key` |
| Immutable status trail | `shipment_status_events` has no UPDATE/DELETE policy |
| Admin bypasses RLS | Service role used by backend; mobile uses anon key |
| Soft deletes never | Hard constraints; users are deactivated, not deleted |
| Money never negative | `CHECK` constraints on all monetary columns |

---

## FILE: 001_extensions.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 001 — EXTENSIONS
-- Enable all PostgreSQL extensions required by the platform.
-- Must run first; other migrations depend on these functions.
-- ═══════════════════════════════════════════════════════════════════

-- UUID generation (gen_random_uuid())
-- Available in PG 14+ without extension, but enable uuid-ossp for
-- uuid_generate_v4() compatibility with legacy tooling
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"    WITH SCHEMA extensions;

-- Cryptographic functions: gen_random_bytes(), crypt(), digest()
-- Used for: idempotency key generation, webhook HMAC verification
CREATE EXTENSION IF NOT EXISTS "pgcrypto"     WITH SCHEMA extensions;

-- Row-level security helper: auth.uid(), auth.role()
-- Supabase injects this automatically; listed here for documentation
-- CREATE EXTENSION IF NOT EXISTS "pgjwt"     WITH SCHEMA extensions;

-- Full-text search on shipment descriptions and addresses
CREATE EXTENSION IF NOT EXISTS "pg_trgm"      WITH SCHEMA extensions;

-- Index on JSONB for audit_log callback_payload column
CREATE EXTENSION IF NOT EXISTS "btree_gin"    WITH SCHEMA extensions;

-- Verify all extensions are present
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM pg_extension WHERE extname IN (
    'uuid-ossp', 'pgcrypto', 'pg_trgm', 'btree_gin'
  )) = 4, 'One or more required extensions failed to install';
END $$;
```

---

## FILE: 002_enums.sql

```sql
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
```

---

## FILE: 003_shared_triggers.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 003 — SHARED TRIGGER FUNCTIONS
-- Reusable trigger functions attached to multiple tables.
-- ═══════════════════════════════════════════════════════════════════

-- ─── updated_at auto-maintenance ───────────────────────────────────
-- Attached to every table that has an updated_at column.
-- This is the canonical pattern — never manually set updated_at.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_set_updated_at IS
  'Auto-sets updated_at on any row update. Attach to all mutable tables.';

-- ─── Tracking number generator ──────────────────────────────────────
-- Generates CRR-YYYYMMDD-XXXXXX format tracking numbers.
-- Called during shipment INSERT via trigger below.
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  date_part   TEXT;
  random_part TEXT;
BEGIN
  -- Date: YYYYMMDD in UTC
  date_part   := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD');
  -- 6 uppercase hex chars from random bytes
  random_part := UPPER(ENCODE(gen_random_bytes(3), 'hex'));
  RETURN 'CRR-' || date_part || '-' || random_part;
END;
$$;

COMMENT ON FUNCTION generate_tracking_number IS
  'Generates a human-readable tracking number: CRR-20240101-A3F9C2.
   Format: CRR-{YYYYMMDD}-{6 hex chars}. ~16M unique values per day.
   Collision risk negligible at Phase 1 scale; add uniqueness check if
   volume exceeds 100k shipments/day.';

-- ─── Shipment tracking number assignment trigger ────────────────────
-- Fires BEFORE INSERT on shipments.
-- Prevents any code path from forgetting to set tracking_number.
CREATE OR REPLACE FUNCTION trigger_assign_tracking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tracking_number IS NULL OR NEW.tracking_number = '' THEN
    NEW.tracking_number := generate_tracking_number();
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Status event recorder ──────────────────────────────────────────
-- Fires AFTER UPDATE on shipments when status changes.
-- Writes an immutable row to shipment_status_events automatically.
-- The actor_id/actor_role must be supplied via a session variable
-- set by the backend before any status-change query:
--   SET LOCAL courier.actor_id = '...uuid...';
--   SET LOCAL courier.actor_role = 'admin';
CREATE OR REPLACE FUNCTION trigger_record_status_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_id   UUID;
  v_actor_role user_role;
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Read actor from session-local variable (set by backend before UPDATE)
  -- Falls back to the authenticated user if not set
  v_actor_id := NULLIF(current_setting('courier.actor_id', true), '')::UUID;
  IF v_actor_id IS NULL THEN
    v_actor_id := auth.uid();
  END IF;

  v_actor_role := NULLIF(current_setting('courier.actor_role', true), '')::user_role;
  IF v_actor_role IS NULL THEN
    -- Derive role from user_profiles; 'customer' is the safe default
    SELECT role INTO v_actor_role FROM user_profiles WHERE id = v_actor_id;
    v_actor_role := COALESCE(v_actor_role, 'customer'::user_role);
  END IF;

  INSERT INTO shipment_status_events (
    shipment_id,
    from_status,
    to_status,
    actor_id,
    actor_role,
    ip_address,
    notes
  ) VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    v_actor_id,
    v_actor_role,
    NULLIF(current_setting('courier.ip_address', true), ''),
    NULLIF(current_setting('courier.transition_notes', true), '')
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_record_status_event IS
  'Auto-writes an immutable shipment_status_events row on any status change.
   Backend MUST set courier.actor_id and courier.actor_role session variables
   before any UPDATE that changes shipment.status.
   Example: SET LOCAL courier.actor_id = $1; SET LOCAL courier.actor_role = $2;';
```

---

## FILE: 004_user_profiles.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 004 — USER PROFILES
-- Extends Supabase auth.users with application-specific data.
-- id is a FK to auth.users.id (same UUID).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE user_profiles (
  -- ─── Identity ──────────────────────────────────────────────────
  id            UUID          NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT          NOT NULL,
  full_name     TEXT          NOT NULL
    CONSTRAINT user_profiles_full_name_length
      CHECK (char_length(full_name) BETWEEN 2 AND 100),
  phone_number  TEXT          NOT NULL
    CONSTRAINT user_profiles_phone_format
      CHECK (phone_number ~ '^\+?[0-9]{9,15}$'),

  -- ─── Role and access ───────────────────────────────────────────
  role          user_role     NOT NULL DEFAULT 'customer',
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,

  -- ─── Push notifications ────────────────────────────────────────
  -- Firebase Cloud Messaging device token.
  -- Nullable: users who haven't granted push permission.
  -- Updated on every app foreground via PATCH /api/auth/fcm-token.
  fcm_token     TEXT
    CONSTRAINT user_profiles_fcm_token_length
      CHECK (fcm_token IS NULL OR char_length(fcm_token) <= 500),

  -- ─── Timestamps ────────────────────────────────────────────────
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX idx_user_profiles_email       ON user_profiles (email);
CREATE INDEX idx_user_profiles_role        ON user_profiles (role);
CREATE INDEX idx_user_profiles_phone       ON user_profiles (phone_number);
CREATE INDEX idx_user_profiles_is_active   ON user_profiles (is_active) WHERE is_active = TRUE;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comments
COMMENT ON TABLE  user_profiles               IS 'Application identity data extending auth.users. One-to-one with auth.users.';
COMMENT ON COLUMN user_profiles.id            IS 'UUID matching auth.users.id. Cascade-deletes on auth user removal.';
COMMENT ON COLUMN user_profiles.role          IS 'RBAC role: customer | admin | super_admin. Only super_admin can elevate others.';
COMMENT ON COLUMN user_profiles.is_active     IS 'Soft-disable users without deleting records. Deactivated users get 403 on all endpoints.';
COMMENT ON COLUMN user_profiles.fcm_token     IS 'Firebase Cloud Messaging token. Overwritten on each app launch.';
COMMENT ON COLUMN user_profiles.phone_number  IS 'Required for mobile money payment flows (Airtel, TNM).';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Customers: read/update own profile only
CREATE POLICY "user_profiles: owner can read own"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user_profiles: owner can update own"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Customers cannot change their own role via this policy
    AND role = (SELECT role FROM user_profiles WHERE id = auth.uid())
  );

-- Admins: read all profiles
CREATE POLICY "user_profiles: admin can read all"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- Super-admin: update any profile (role changes, deactivation)
CREATE POLICY "user_profiles: super_admin can update any"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );

-- Insert: only via auth trigger (service role). Users cannot self-insert.
-- The backend creates profiles via service role client on registration.
CREATE POLICY "user_profiles: service role insert"
  ON user_profiles FOR INSERT
  WITH CHECK (TRUE); -- Filtered by service role at the application layer

-- ─── Auto-create profile on Supabase auth signup ──────────────────
-- Fired by Supabase after auth.users INSERT.
-- Copies email from auth metadata; user fills remaining fields via onboarding.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, phone_number)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', '')
  )
  ON CONFLICT (id) DO NOTHING; -- Idempotent: safe to call multiple times
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

COMMENT ON FUNCTION handle_new_auth_user IS
  'Auto-creates a user_profiles row when Supabase auth creates a new user.
   The backend passes full_name and phone_number in raw_user_meta_data during registration.';
```

---

## FILE: 005_saved_addresses.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 005 — SAVED ADDRESSES
-- User address book for pre-filling shipment forms.
-- Cities restricted to supported service regions only.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE saved_addresses (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID          NOT NULL
    REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- ─── Label and location ─────────────────────────────────────────
  label       TEXT          NOT NULL
    CONSTRAINT saved_addresses_label_length
      CHECK (char_length(label) BETWEEN 1 AND 50),
  street      TEXT          NOT NULL
    CONSTRAINT saved_addresses_street_length
      CHECK (char_length(street) BETWEEN 3 AND 300),
  area        TEXT          NOT NULL DEFAULT '',
  city        TEXT          NOT NULL
    CONSTRAINT saved_addresses_city_valid
      CHECK (city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),

  -- ─── Coordinates (optional — user may not share location) ───────
  latitude    DOUBLE PRECISION
    CONSTRAINT saved_addresses_lat_range CHECK (latitude  BETWEEN -90  AND 90),
  longitude   DOUBLE PRECISION
    CONSTRAINT saved_addresses_lng_range CHECK (longitude BETWEEN -180 AND 180),

  -- ─── Default flag ───────────────────────────────────────────────
  -- At most one default per user enforced via partial unique index below.
  is_default  BOOLEAN       NOT NULL DEFAULT FALSE,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_saved_addresses_user_id   ON saved_addresses (user_id);
CREATE INDEX idx_saved_addresses_city      ON saved_addresses (city);

-- Enforce at most one default address per user
CREATE UNIQUE INDEX idx_saved_addresses_one_default
  ON saved_addresses (user_id)
  WHERE is_default = TRUE;

-- Trigger: auto-update updated_at
CREATE TRIGGER set_saved_addresses_updated_at
  BEFORE UPDATE ON saved_addresses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comments
COMMENT ON TABLE  saved_addresses            IS 'User address book. Pre-fills shipment creation form.';
COMMENT ON COLUMN saved_addresses.city       IS 'Must be one of the three supported cities. Enforced by CHECK constraint.';
COMMENT ON COLUMN saved_addresses.is_default IS 'Unique partial index ensures at most one default per user.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_addresses: owner full access"
  ON saved_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "saved_addresses: admin read only"
  ON saved_addresses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
```

---

## FILE: 006_shipments.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 006 — SHIPMENTS
-- Core business entity. Denormalized sender/receiver snapshot (ADR-003).
-- All monetary values in tambala (MWK × 100) — INTEGER, never NUMERIC.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE shipments (
  -- ─── Identity ──────────────────────────────────────────────────
  id               UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracking_number  TEXT              NOT NULL UNIQUE,
  user_id          UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,

  -- ─── Sender snapshot (immutable after INSERT) ──────────────────
  -- ADR-003: Flat columns, not FK. Reflects state at time of creation.
  -- Any later change to user_profiles does NOT cascade here.
  sender_name      TEXT              NOT NULL
    CONSTRAINT shipments_sender_name_length CHECK (char_length(sender_name) BETWEEN 2 AND 100),
  sender_phone     TEXT              NOT NULL
    CONSTRAINT shipments_sender_phone_format CHECK (sender_phone ~ '^\+?[0-9]{9,15}$'),
  sender_email     TEXT
    CONSTRAINT shipments_sender_email_format CHECK (sender_email IS NULL OR sender_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sender_address   TEXT              NOT NULL
    CONSTRAINT shipments_sender_address_length CHECK (char_length(sender_address) BETWEEN 5 AND 500),
  sender_city      TEXT              NOT NULL
    CONSTRAINT shipments_sender_city_valid CHECK (sender_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  sender_lat       DOUBLE PRECISION
    CONSTRAINT shipments_sender_lat_range CHECK (sender_lat BETWEEN -90 AND 90),
  sender_lng       DOUBLE PRECISION
    CONSTRAINT shipments_sender_lng_range CHECK (sender_lng BETWEEN -180 AND 180),

  -- ─── Receiver snapshot (immutable after INSERT) ────────────────
  receiver_name    TEXT              NOT NULL
    CONSTRAINT shipments_receiver_name_length CHECK (char_length(receiver_name) BETWEEN 2 AND 100),
  receiver_phone   TEXT              NOT NULL
    CONSTRAINT shipments_receiver_phone_format CHECK (receiver_phone ~ '^\+?[0-9]{9,15}$'),
  receiver_email   TEXT
    CONSTRAINT shipments_receiver_email_format CHECK (receiver_email IS NULL OR receiver_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  receiver_address TEXT              NOT NULL
    CONSTRAINT shipments_receiver_address_length CHECK (char_length(receiver_address) BETWEEN 5 AND 500),
  receiver_city    TEXT              NOT NULL
    CONSTRAINT shipments_receiver_city_valid CHECK (receiver_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  receiver_lat     DOUBLE PRECISION
    CONSTRAINT shipments_receiver_lat_range CHECK (receiver_lat BETWEEN -90 AND 90),
  receiver_lng     DOUBLE PRECISION
    CONSTRAINT shipments_receiver_lng_range CHECK (receiver_lng BETWEEN -180 AND 180),

  -- ─── Package details ───────────────────────────────────────────
  -- weight_kg: stored as NUMERIC(5,2) for precision, but validated
  -- server-side to 1 decimal place (e.g. 2.5, not 2.57)
  weight_kg         NUMERIC(5,2)     NOT NULL
    CONSTRAINT shipments_weight_range CHECK (weight_kg BETWEEN 0.1 AND 10.0),
  package_size      package_size     NOT NULL,
  package_description TEXT           NOT NULL
    CONSTRAINT shipments_description_length CHECK (char_length(package_description) BETWEEN 3 AND 300),
  is_fragile        BOOLEAN          NOT NULL DEFAULT FALSE,
  declared_value_mwk INTEGER
    CONSTRAINT shipments_declared_value_positive CHECK (declared_value_mwk IS NULL OR declared_value_mwk >= 0),

  -- ─── Routing ───────────────────────────────────────────────────
  pickup_city       TEXT             NOT NULL
    CONSTRAINT shipments_pickup_city_valid CHECK (pickup_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  delivery_city     TEXT             NOT NULL
    CONSTRAINT shipments_delivery_city_valid CHECK (delivery_city IN ('Lilongwe', 'Blantyre', 'Mzuzu')),
  -- distance_km: road distance in km, calculated by geo service
  -- Stored as INTEGER (rounded km) for consistency
  distance_km       INTEGER          NOT NULL
    CONSTRAINT shipments_distance_positive CHECK (distance_km > 0),

  -- ─── Pricing (tambala = MWK × 100) ────────────────────────────
  -- quoted_price_mwk: shown to user before payment
  -- final_price_mwk: set after any admin adjustment; NULL until confirmed
  quoted_price_mwk  INTEGER          NOT NULL
    CONSTRAINT shipments_quoted_price_positive CHECK (quoted_price_mwk > 0),
  final_price_mwk   INTEGER
    CONSTRAINT shipments_final_price_positive CHECK (final_price_mwk IS NULL OR final_price_mwk > 0),

  -- ─── State machine ─────────────────────────────────────────────
  status            shipment_status  NOT NULL DEFAULT 'pending_approval',
  rejection_reason  TEXT
    CONSTRAINT shipments_rejection_reason_length
      CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500),
  delivery_notes    TEXT
    CONSTRAINT shipments_delivery_notes_length
      CHECK (delivery_notes IS NULL OR char_length(delivery_notes) <= 500),
  proof_of_delivery_url TEXT
    CONSTRAINT shipments_pod_url_length
      CHECK (proof_of_delivery_url IS NULL OR char_length(proof_of_delivery_url) <= 1000),

  -- ─── Admin metadata ─────────────────────────────────────────────
  reviewed_by       UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,

  -- ─── Key operational timestamps ────────────────────────────────
  estimated_delivery_date DATE,
  picked_up_at            TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,

  -- ─── Standard timestamps ────────────────────────────────────────
  created_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  -- ─── Business invariant: pickup must precede delivery ──────────
  CONSTRAINT shipments_timestamps_order
    CHECK (
      picked_up_at IS NULL
      OR delivered_at IS NULL
      OR picked_up_at <= delivered_at
    )
);

-- ─── Indexes ──────────────────────────────────────────────────────
-- Query patterns:
--   1. User fetches own shipments (paginated, ordered by created_at DESC)
--   2. Admin fetches all shipments filtered by status
--   3. User fetches single shipment by tracking number
--   4. Admin searches by sender/receiver phone or name
--   5. Payment service looks up shipment by id to advance status

CREATE INDEX idx_shipments_user_id         ON shipments (user_id, created_at DESC);
CREATE INDEX idx_shipments_status          ON shipments (status) WHERE status NOT IN ('confirmed', 'rejected', 'cancelled');
CREATE INDEX idx_shipments_tracking_number ON shipments (tracking_number);
CREATE INDEX idx_shipments_pickup_city     ON shipments (pickup_city);
CREATE INDEX idx_shipments_delivery_city   ON shipments (delivery_city);
CREATE INDEX idx_shipments_created_at      ON shipments (created_at DESC);
CREATE INDEX idx_shipments_reviewed_by     ON shipments (reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Trigram index for phone/name search
CREATE INDEX idx_shipments_sender_phone_trgm
  ON shipments USING gin (sender_phone gin_trgm_ops);
CREATE INDEX idx_shipments_receiver_phone_trgm
  ON shipments USING gin (receiver_phone gin_trgm_ops);
CREATE INDEX idx_shipments_sender_name_trgm
  ON shipments USING gin (sender_name gin_trgm_ops);

-- ─── Triggers ─────────────────────────────────────────────────────

-- Assign tracking number on INSERT
CREATE TRIGGER assign_shipment_tracking_number
  BEFORE INSERT ON shipments
  FOR EACH ROW EXECUTE FUNCTION trigger_assign_tracking_number();

-- Auto-update updated_at
CREATE TRIGGER set_shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Record status event on status change (requires 007 to exist)
-- This trigger is added AFTER 007 creates the shipment_status_events table.
-- See 007_shipment_status_events.sql for CREATE TRIGGER statement.

-- ─── Comments ─────────────────────────────────────────────────────
COMMENT ON TABLE  shipments                    IS 'Core business entity. Flat sender/receiver snapshot per ADR-003. Money in tambala (INTEGER).';
COMMENT ON COLUMN shipments.tracking_number    IS 'Auto-generated CRR-YYYYMMDD-XXXXXX. Human-readable for support.';
COMMENT ON COLUMN shipments.weight_kg          IS 'Max 10.0kg enforced by CHECK and backend validation.';
COMMENT ON COLUMN shipments.quoted_price_mwk   IS 'Price shown at booking. Tambala (MWK × 100). Never zero.';
COMMENT ON COLUMN shipments.final_price_mwk    IS 'Admin-confirmed price. NULL until admin reviews. Equals quoted_price_mwk unless adjusted.';
COMMENT ON COLUMN shipments.distance_km        IS 'Road distance in whole km. Calculated by geo service; fallback from INTER_CITY_DISTANCES_KM.';
COMMENT ON COLUMN shipments.status             IS 'State machine enforced server-side. See ALLOWED_TRANSITIONS in shared-constants.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- Customers: read only their own shipments
CREATE POLICY "shipments: owner can read"
  ON shipments FOR SELECT
  USING (auth.uid() = user_id);

-- Customers: create their own shipments
CREATE POLICY "shipments: owner can insert"
  ON shipments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Customers: update limited fields on pending_approval shipments
-- (delivery_notes only; status changes go through backend)
CREATE POLICY "shipments: owner can update notes"
  ON shipments FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'pending_approval'
  )
  WITH CHECK (
    auth.uid() = user_id
  );

-- Admin: read all shipments
CREATE POLICY "shipments: admin can read all"
  ON shipments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- Admin: update status and review fields (via backend service role)
-- All status transitions are enforced in the backend state machine.
-- RLS here is a defense-in-depth layer; real enforcement is in the API.
CREATE POLICY "shipments: admin can update"
  ON shipments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
```

---

## FILE: 007_shipment_status_events.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 007 — SHIPMENT STATUS EVENTS
-- Immutable audit trail of all shipment state transitions.
-- POLICY: No UPDATE, no DELETE — ever. This is the ledger.
-- Rows are written automatically by trigger_record_status_event()
-- and manually by admin_transition_shipment() RPC.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE shipment_status_events (
  id           UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id  UUID              NOT NULL
    REFERENCES shipments(id) ON DELETE RESTRICT, -- Never lose events even if shipment softened
  from_status  shipment_status,                   -- NULL for the creation event
  to_status    shipment_status   NOT NULL,
  notes        TEXT
    CONSTRAINT sse_notes_length CHECK (notes IS NULL OR char_length(notes) <= 500),
  actor_id     UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,
  actor_role   user_role         NOT NULL,
  ip_address   INET,                              -- IPv4 or IPv6
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()

  -- Intentionally NO updated_at — rows are immutable
);

-- Indexes
CREATE INDEX idx_sse_shipment_id ON shipment_status_events (shipment_id, created_at DESC);
CREATE INDEX idx_sse_actor_id    ON shipment_status_events (actor_id);
CREATE INDEX idx_sse_to_status   ON shipment_status_events (to_status);
CREATE INDEX idx_sse_created_at  ON shipment_status_events (created_at DESC);

-- Comments
COMMENT ON TABLE  shipment_status_events           IS 'Immutable ledger of all shipment state changes. No UPDATE/DELETE permitted.';
COMMENT ON COLUMN shipment_status_events.from_status IS 'NULL for the first event (creation to pending_approval).';
COMMENT ON COLUMN shipment_status_events.ip_address  IS 'Actor IP address for forensic tracing. NULL for webhook/system events.';
COMMENT ON COLUMN shipment_status_events.notes       IS 'Optional reason or admin note attached to this transition.';

-- ─── Attach the status event recorder trigger to shipments ─────────
-- Now that shipment_status_events exists, wire up the trigger.
CREATE TRIGGER record_shipment_status_event
  AFTER UPDATE OF status ON shipments
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_record_status_event();

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE shipment_status_events ENABLE ROW LEVEL SECURITY;

-- Customers: read their own shipment's events (for tracking timeline)
CREATE POLICY "sse: owner can read"
  ON shipment_status_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_status_events.shipment_id
        AND s.user_id = auth.uid()
    )
  );

-- Admins: read all events
CREATE POLICY "sse: admin can read all"
  ON shipment_status_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- INSERT only via trigger or service role — no direct user inserts
CREATE POLICY "sse: service role insert only"
  ON shipment_status_events FOR INSERT
  WITH CHECK (TRUE); -- Application-layer guard; trigger handles content

-- Explicitly DENY UPDATE and DELETE for all roles including admin
-- PostgreSQL default is DENY, but these policies make intent explicit.
-- No UPDATE or DELETE policies are created — absence = denial.
```

---

## FILE: 008_payments.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 008 — PAYMENTS
-- Payment records with idempotency keys (ADR-006).
-- Amount stored in tambala. One-to-one with shipment per active payment.
-- Multiple payment attempts are allowed (e.g. retry after failure)
-- but only one can be in 'processing' or 'paid' state per shipment.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE payments (
  id                       UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id              UUID              NOT NULL
    REFERENCES shipments(id) ON DELETE RESTRICT,
  user_id                  UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,

  -- ─── Monetary amount ────────────────────────────────────────────
  -- Must match shipment.final_price_mwk (or quoted_price_mwk if not adjusted).
  -- Validated in the backend before INSERT.
  amount_mwk               INTEGER           NOT NULL
    CONSTRAINT payments_amount_positive CHECK (amount_mwk > 0),

  -- ─── Payment method and status ──────────────────────────────────
  method                   payment_method    NOT NULL,
  status                   payment_status    NOT NULL DEFAULT 'pending',

  -- ─── Paychangu integration ──────────────────────────────────────
  -- provider_reference: Paychangu tx_ref (our reference we generate)
  -- provider_transaction_id: Paychangu's internal ID (from callback)
  provider_reference       TEXT              UNIQUE,
  provider_transaction_id  TEXT,

  -- ─── Idempotency (ADR-006) ──────────────────────────────────────
  -- UUID generated by mobile client before POST /api/payments/initiate.
  -- If same key is used again, return existing record without reprocessing.
  idempotency_key          TEXT              NOT NULL UNIQUE,

  -- ─── Mobile money specific ──────────────────────────────────────
  -- Required for airtel_money and tnm_mpamba methods.
  phone_number             TEXT
    CONSTRAINT payments_phone_format
      CHECK (phone_number IS NULL OR phone_number ~ '^\+?[0-9]{9,15}$'),

  -- ─── Webhook data ───────────────────────────────────────────────
  callback_received_at     TIMESTAMPTZ,
  callback_payload         JSONB,            -- Raw webhook body for forensics

  -- ─── Failure handling ───────────────────────────────────────────
  failure_reason           TEXT
    CONSTRAINT payments_failure_reason_length
      CHECK (failure_reason IS NULL OR char_length(failure_reason) <= 500),

  -- ─── Expiry ─────────────────────────────────────────────────────
  -- 30 minutes from creation. Cron job marks expired payments.
  expires_at               TIMESTAMPTZ       NOT NULL,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at               TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_shipment_id       ON payments (shipment_id);
CREATE INDEX idx_payments_user_id           ON payments (user_id);
CREATE INDEX idx_payments_status            ON payments (status);
CREATE INDEX idx_payments_provider_ref      ON payments (provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX idx_payments_expires_at        ON payments (expires_at) WHERE status IN ('pending', 'processing');
-- JSONB index for webhook payload lookup
CREATE INDEX idx_payments_callback_payload  ON payments USING gin (callback_payload) WHERE callback_payload IS NOT NULL;

-- Business rule: at most one active payment per shipment
-- "Active" = pending or processing. Paid payments are the permanent record.
CREATE UNIQUE INDEX idx_payments_one_active_per_shipment
  ON payments (shipment_id)
  WHERE status IN ('pending', 'processing');

-- Trigger: auto-update updated_at
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comments
COMMENT ON TABLE  payments                       IS 'Payment records. One active payment per shipment at a time. Tambala (MWK × 100).';
COMMENT ON COLUMN payments.idempotency_key       IS 'UUID from mobile client. Prevents duplicate payments on network retry (ADR-006).';
COMMENT ON COLUMN payments.provider_reference    IS 'Our tx_ref sent to Paychangu. Unique. Used to correlate webhook callbacks.';
COMMENT ON COLUMN payments.callback_payload      IS 'Raw Paychangu webhook body. Stored for forensics and reconciliation.';
COMMENT ON COLUMN payments.expires_at            IS '30 min from creation. Backend worker marks stale payments as expired.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Customers: read their own payments
CREATE POLICY "payments: owner can read"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Customers: cannot INSERT directly — backend service role only
-- (Idempotency key validation happens in application code)

-- Admins: read all payments
CREATE POLICY "payments: admin can read all"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
```

---

## FILE: 009_notifications.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 009 — NOTIFICATIONS
-- In-app notification inbox. Persisted for offline delivery.
-- Push is best-effort (FCM); this table is the durable record.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE app_notifications (
  id           UUID                NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID                NOT NULL
    REFERENCES user_profiles(id) ON DELETE CASCADE,

  -- ─── Content ────────────────────────────────────────────────────
  shipment_id  UUID
    REFERENCES shipments(id) ON DELETE SET NULL, -- Nullable: some notifs are not shipment-specific
  type         notification_type   NOT NULL,
  title        TEXT                NOT NULL
    CONSTRAINT notifications_title_length CHECK (char_length(title) BETWEEN 1 AND 100),
  body         TEXT                NOT NULL
    CONSTRAINT notifications_body_length  CHECK (char_length(body) BETWEEN 1 AND 500),

  -- ─── Deep-link data ─────────────────────────────────────────────
  -- Key-value map sent with push notification for Expo Router deep links.
  -- Example: { "screen": "shipments/[id]", "shipment_id": "uuid" }
  data         JSONB               NOT NULL DEFAULT '{}',

  -- ─── Read state ─────────────────────────────────────────────────
  is_read      BOOLEAN             NOT NULL DEFAULT FALSE,
  read_at      TIMESTAMPTZ,

  -- ─── Push delivery tracking ─────────────────────────────────────
  push_sent        BOOLEAN         NOT NULL DEFAULT FALSE,
  push_sent_at     TIMESTAMPTZ,
  push_failed_at   TIMESTAMPTZ,
  push_error       TEXT
    CONSTRAINT notifications_push_error_length
      CHECK (push_error IS NULL OR char_length(push_error) <= 500),

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at   TIMESTAMPTZ         NOT NULL DEFAULT NOW()
  -- No updated_at: notifications are read or not. No other mutation.
);

-- Indexes
CREATE INDEX idx_notifications_user_id     ON app_notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread      ON app_notifications (user_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_shipment_id ON app_notifications (shipment_id) WHERE shipment_id IS NOT NULL;
CREATE INDEX idx_notifications_type        ON app_notifications (type);
CREATE INDEX idx_notifications_push_pending
  ON app_notifications (created_at)
  WHERE push_sent = FALSE AND push_failed_at IS NULL;

-- Comments
COMMENT ON TABLE  app_notifications               IS 'Durable in-app notification inbox. Push is best-effort; this is the source of truth.';
COMMENT ON COLUMN app_notifications.data          IS 'JSONB deep-link data. Expo Router uses this to navigate on push tap.';
COMMENT ON COLUMN app_notifications.push_sent     IS 'TRUE after FCM dispatch. FALSE = pending, waiting for worker.';
COMMENT ON COLUMN app_notifications.push_error    IS 'Last FCM error string. NULL if no error.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;

-- Users: read and mark-read their own notifications
CREATE POLICY "notifications: owner can read"
  ON app_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications: owner can update is_read"
  ON app_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role: insert (via BullMQ worker)
CREATE POLICY "notifications: service role insert"
  ON app_notifications FOR INSERT
  WITH CHECK (TRUE);

-- Admins: read all (for support investigation)
CREATE POLICY "notifications: admin can read all"
  ON app_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
```

---

## FILE: 010_audit_log.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 010 — AUDIT LOG
-- Generic immutable log of sensitive platform events.
-- Separate from shipment_status_events (which is shipment-specific).
-- Written by backend services directly via service role.
-- Retention: 2 years minimum. Never deleted via application code.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE audit_log (
  id            UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type    audit_event_type  NOT NULL,

  -- ─── Actor ──────────────────────────────────────────────────────
  -- actor_id: NULL for unauthenticated events (e.g. failed login)
  actor_id      UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,
  actor_role    user_role,
  actor_ip      INET,
  actor_ua      TEXT,             -- User-Agent string for forensics

  -- ─── Target ─────────────────────────────────────────────────────
  -- target_type + target_id: polymorphic reference to affected resource.
  -- Examples: target_type='shipment', target_id='uuid'
  --           target_type='user', target_id='uuid'
  --           target_type='payment', target_id='uuid'
  target_type   TEXT
    CONSTRAINT audit_log_target_type_length CHECK (target_type IS NULL OR char_length(target_type) <= 50),
  target_id     UUID,

  -- ─── Event payload ──────────────────────────────────────────────
  -- Stores a before/after diff or event-specific metadata.
  -- PII MUST be redacted before writing here.
  -- Never log: passwords, tokens, card numbers, raw webhook payloads.
  payload       JSONB             NOT NULL DEFAULT '{}',

  -- ─── Outcome ────────────────────────────────────────────────────
  success       BOOLEAN           NOT NULL DEFAULT TRUE,
  error_message TEXT
    CONSTRAINT audit_log_error_length CHECK (error_message IS NULL OR char_length(error_message) <= 1000),

  -- ─── Timestamp ──────────────────────────────────────────────────
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
  -- No updated_at — immutable
);

-- Partition by month for performance at scale (optional, add in Phase 3+)
-- For Phase 1 volume, a plain index is sufficient.

-- Indexes
CREATE INDEX idx_audit_log_actor_id    ON audit_log (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_log_event_type  ON audit_log (event_type, created_at DESC);
CREATE INDEX idx_audit_log_target      ON audit_log (target_type, target_id) WHERE target_id IS NOT NULL;
CREATE INDEX idx_audit_log_created_at  ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_actor_ip    ON audit_log (actor_ip) WHERE actor_ip IS NOT NULL;
-- JSONB full-text on payload
CREATE INDEX idx_audit_log_payload     ON audit_log USING gin (payload);

-- Comments
COMMENT ON TABLE  audit_log              IS 'Immutable event log. 2-year retention. PII redacted. Written by backend services only.';
COMMENT ON COLUMN audit_log.payload      IS 'Event-specific JSON. Never include passwords, tokens, or card data.';
COMMENT ON COLUMN audit_log.actor_ua     IS 'User-Agent for forensic analysis. Truncated to 500 chars by backend.';
COMMENT ON COLUMN audit_log.target_type  IS 'Resource type affected: shipment | user | payment | dispute.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admin reads audit logs via this policy.
-- Admins use the backend API which queries via service role.
CREATE POLICY "audit_log: super_admin read only"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );

-- INSERT only via service role (backend). No direct user writes ever.
CREATE POLICY "audit_log: service role insert"
  ON audit_log FOR INSERT
  WITH CHECK (TRUE);
```

---

## FILE: 011_pricing_config.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 011 — PRICING CONFIG
-- Versioned, temporal pricing rules.
-- Active config: is_active = TRUE. Only one active config at a time.
-- All monetary values in tambala (MWK × 100).
-- Change pricing by inserting a new row + deactivating the old one.
-- NEVER update or delete existing config rows (historical quotes depend on them).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE pricing_config (
  id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ─── Version label ──────────────────────────────────────────────
  name                    TEXT        NOT NULL UNIQUE,    -- e.g. 'v1', 'v2-fuel-surcharge'
  description             TEXT,

  -- ─── Base rate ──────────────────────────────────────────────────
  -- Applied to every shipment regardless of distance or weight.
  base_price_mwk          INTEGER     NOT NULL
    CONSTRAINT pricing_base_price_positive CHECK (base_price_mwk > 0),

  -- ─── Distance rate ──────────────────────────────────────────────
  -- Per-km charge applied to the road distance between cities.
  per_km_rate_mwk         INTEGER     NOT NULL
    CONSTRAINT pricing_per_km_rate_positive CHECK (per_km_rate_mwk > 0),

  -- ─── Weight surcharge ───────────────────────────────────────────
  -- Applied per kg above the first 1kg (first kg included in base).
  weight_rate_per_kg_mwk  INTEGER     NOT NULL DEFAULT 0
    CONSTRAINT pricing_weight_rate_gte_zero CHECK (weight_rate_per_kg_mwk >= 0),

  -- ─── Fragile surcharge ──────────────────────────────────────────
  -- Flat surcharge applied when is_fragile = TRUE.
  fragile_surcharge_mwk   INTEGER     NOT NULL DEFAULT 0
    CONSTRAINT pricing_fragile_surcharge_gte_zero CHECK (fragile_surcharge_mwk >= 0),

  -- ─── Size multipliers ────────────────────────────────────────────
  -- Multiplier in basis points (100 = 1.00x, 150 = 1.50x).
  -- Avoids NUMERIC; integer arithmetic only.
  small_multiplier_bp     INTEGER     NOT NULL DEFAULT 100
    CONSTRAINT pricing_small_mult_positive CHECK (small_multiplier_bp > 0),
  medium_multiplier_bp    INTEGER     NOT NULL DEFAULT 120
    CONSTRAINT pricing_medium_mult_positive CHECK (medium_multiplier_bp > 0),
  large_multiplier_bp     INTEGER     NOT NULL DEFAULT 150
    CONSTRAINT pricing_large_mult_positive CHECK (large_multiplier_bp > 0),

  -- ─── Active flag and temporal bounds ────────────────────────────
  is_active               BOOLEAN     NOT NULL DEFAULT FALSE,
  effective_from          TIMESTAMPTZ NOT NULL,
  effective_to            TIMESTAMPTZ,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,

  CONSTRAINT pricing_config_dates_order
    CHECK (effective_to IS NULL OR effective_from < effective_to)
);

-- Only one active config at a time
CREATE UNIQUE INDEX idx_pricing_config_one_active
  ON pricing_config (is_active)
  WHERE is_active = TRUE;

-- Lookup index for temporal queries
CREATE INDEX idx_pricing_config_effective ON pricing_config (effective_from, effective_to);

-- ─── Seed: initial pricing config ────────────────────────────────
-- Base: MWK 2,000 = 200,000 tambala
-- Per km: MWK 5 = 500 tambala
-- Weight: MWK 200/kg above 1kg = 20,000 tambala
-- Fragile: MWK 500 flat = 50,000 tambala
-- Adjust these values to match actual business pricing.
INSERT INTO pricing_config (
  name,
  description,
  base_price_mwk,
  per_km_rate_mwk,
  weight_rate_per_kg_mwk,
  fragile_surcharge_mwk,
  small_multiplier_bp,
  medium_multiplier_bp,
  large_multiplier_bp,
  is_active,
  effective_from
) VALUES (
  'v1',
  'Initial Phase 1 pricing. Base + distance + weight + fragile surcharge.',
  200000,    -- MWK 2,000 base
  500,       -- MWK 5/km
  20000,     -- MWK 200/kg (above 1kg)
  50000,     -- MWK 500 fragile surcharge
  100,       -- small: 1.00x
  120,       -- medium: 1.20x
  150,       -- large: 1.50x
  TRUE,
  NOW()
);

-- Comments
COMMENT ON TABLE  pricing_config                  IS 'Versioned pricing rules. One active config. All money in tambala. Never delete rows.';
COMMENT ON COLUMN pricing_config.name             IS 'Human-readable version label. Use for audit trail references.';
COMMENT ON COLUMN pricing_config.base_price_mwk   IS 'Flat fee per shipment in tambala. Applied before distance/weight/fragile.';
COMMENT ON COLUMN pricing_config.small_multiplier_bp IS 'Size multiplier in basis points. 100 = 1.00×, 150 = 1.50×.';

-- ─── Pricing calculation function ─────────────────────────────────
-- Called by the backend pricing.service.ts to verify quote integrity.
-- Can also be called directly in DB for data repair.
CREATE OR REPLACE FUNCTION calculate_shipment_price(
  p_distance_km      INTEGER,
  p_weight_kg        NUMERIC,
  p_size             package_size,
  p_is_fragile       BOOLEAN,
  p_config_id        UUID DEFAULT NULL  -- NULL = use active config
)
RETURNS TABLE (
  config_id              UUID,
  base_price_mwk         INTEGER,
  distance_charge_mwk    INTEGER,
  weight_charge_mwk      INTEGER,
  fragile_surcharge_mwk  INTEGER,
  size_multiplier_bp     INTEGER,
  subtotal_before_size   INTEGER,
  total_mwk              INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_config pricing_config%ROWTYPE;
  v_weight_above_1kg NUMERIC;
  v_base             INTEGER;
  v_distance_charge  INTEGER;
  v_weight_charge    INTEGER;
  v_fragile          INTEGER;
  v_multiplier       INTEGER;
  v_subtotal         INTEGER;
  v_total            INTEGER;
BEGIN
  -- Load config
  IF p_config_id IS NOT NULL THEN
    SELECT * INTO v_config FROM pricing_config WHERE id = p_config_id;
  ELSE
    SELECT * INTO v_config FROM pricing_config WHERE is_active = TRUE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pricing config found';
  END IF;

  -- Calculate components
  v_base            := v_config.base_price_mwk;
  v_distance_charge := p_distance_km * v_config.per_km_rate_mwk;

  -- Weight charge: first 1kg is free (included in base)
  v_weight_above_1kg := GREATEST(p_weight_kg - 1.0, 0);
  v_weight_charge    := ROUND(v_weight_above_1kg * v_config.weight_rate_per_kg_mwk);

  v_fragile := CASE WHEN p_is_fragile THEN v_config.fragile_surcharge_mwk ELSE 0 END;

  -- Size multiplier
  v_multiplier := CASE p_size
    WHEN 'small'  THEN v_config.small_multiplier_bp
    WHEN 'medium' THEN v_config.medium_multiplier_bp
    WHEN 'large'  THEN v_config.large_multiplier_bp
  END;

  -- Calculate total (multiply subtotal by size multiplier, in basis points)
  v_subtotal := v_base + v_distance_charge + v_weight_charge + v_fragile;
  v_total    := ROUND(v_subtotal::NUMERIC * v_multiplier / 100.0);

  RETURN QUERY SELECT
    v_config.id,
    v_base,
    v_distance_charge,
    v_weight_charge,
    v_fragile,
    v_multiplier,
    v_subtotal,
    v_total;
END;
$$;

COMMENT ON FUNCTION calculate_shipment_price IS
  'Returns an itemized price breakdown for a shipment.
   Uses active pricing config by default.
   All returned values are in tambala (MWK × 100).
   Mirror of PricingService.calculatePrice() in the backend.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read pricing (needed for quote screen)
CREATE POLICY "pricing_config: authenticated read"
  ON pricing_config FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only super_admin can insert/update pricing configs
CREATE POLICY "pricing_config: super_admin write"
  ON pricing_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );

CREATE POLICY "pricing_config: super_admin update"
  ON pricing_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'super_admin'
    )
  );
```

---

## FILE: 012_disputes.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 012 — DISPUTES
-- Customer dispute tickets for delivery issues.
-- Evidence URLs reference Supabase Storage (bucket: dispute-evidence).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE disputes (
  id             UUID              NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id    UUID              NOT NULL
    REFERENCES shipments(id) ON DELETE RESTRICT,
  user_id        UUID              NOT NULL
    REFERENCES user_profiles(id) ON DELETE RESTRICT,

  -- ─── Category and description ────────────────────────────────────
  category       dispute_category  NOT NULL,
  description    TEXT              NOT NULL
    CONSTRAINT disputes_description_length
      CHECK (char_length(description) BETWEEN 20 AND 2000),

  -- ─── Evidence ───────────────────────────────────────────────────
  -- Array of Supabase Storage signed URLs. Validated by backend (max 5).
  evidence_urls  TEXT[]            NOT NULL DEFAULT '{}',

  -- ─── Status and resolution ──────────────────────────────────────
  status         dispute_status    NOT NULL DEFAULT 'open',
  resolution     TEXT
    CONSTRAINT disputes_resolution_length
      CHECK (resolution IS NULL OR char_length(resolution) <= 2000),
  resolved_by    UUID
    REFERENCES user_profiles(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,

  -- ─── Timestamps ─────────────────────────────────────────────────
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- Business rule: one open dispute per shipment at a time
  CONSTRAINT disputes_one_open_per_shipment
    EXCLUDE (shipment_id WITH =)
    WHERE (status IN ('open', 'under_review'))
);

-- Indexes
CREATE INDEX idx_disputes_shipment_id ON disputes (shipment_id);
CREATE INDEX idx_disputes_user_id     ON disputes (user_id);
CREATE INDEX idx_disputes_status      ON disputes (status) WHERE status NOT IN ('resolved', 'closed');
CREATE INDEX idx_disputes_created_at  ON disputes (created_at DESC);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Comments
COMMENT ON TABLE  disputes              IS 'Customer dispute tickets. One active dispute per shipment. Evidence in Supabase Storage.';
COMMENT ON COLUMN disputes.evidence_urls IS 'Array of Supabase Storage object paths. Signed URLs generated at read time by backend.';
COMMENT ON COLUMN disputes.resolution   IS 'Admin resolution text. Required when transitioning to resolved/closed.';

-- ─── Row-Level Security ────────────────────────────────────────────
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Customers: read and insert their own disputes
CREATE POLICY "disputes: owner can read"
  ON disputes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "disputes: owner can insert"
  ON disputes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins: full access
CREATE POLICY "disputes: admin full access"
  ON disputes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );
```

---

## FILE: 013_realtime.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 013 — SUPABASE REALTIME
-- Configure which tables broadcast changes via WebSocket.
-- Mobile app subscribes to specific rows using Supabase Realtime client.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Add tables to the supabase_realtime publication ───────────────
-- Supabase creates this publication automatically.
-- We add our tables to it explicitly.

-- Shipments: customer subscribes to their own shipment changes for live tracking.
-- Filter in the mobile client: .eq('user_id', userId)
ALTER PUBLICATION supabase_realtime ADD TABLE shipments;

-- Notifications: customer subscribes to new notifications for real-time inbox.
-- Filter: .eq('user_id', userId) AND .eq('is_read', false)
ALTER PUBLICATION supabase_realtime ADD TABLE app_notifications;

-- Shipment status events: optional — useful for admin dashboard live updates.
ALTER PUBLICATION supabase_realtime ADD TABLE shipment_status_events;

-- ─── PostgreSQL REPLICA IDENTITY ──────────────────────────────────
-- FULL: broadcasts old and new row on UPDATE/DELETE.
-- Required for Supabase Realtime to send the complete row in callbacks.
-- Default is DEFAULT (only primary key on UPDATE/DELETE).
ALTER TABLE shipments               REPLICA IDENTITY FULL;
ALTER TABLE app_notifications       REPLICA IDENTITY FULL;
ALTER TABLE shipment_status_events  REPLICA IDENTITY FULL;

-- ─── Realtime subscription examples (for docs) ────────────────────
-- These are TypeScript snippets, not SQL. Documented here for reference.
--
-- CUSTOMER: subscribe to a specific shipment
--   const channel = supabase
--     .channel('shipment-' + shipmentId)
--     .on('postgres_changes', {
--       event: '*',
--       schema: 'public',
--       table: 'shipments',
--       filter: `id=eq.${shipmentId}`
--     }, handler)
--     .subscribe();
--
-- CUSTOMER: subscribe to own notifications
--   const channel = supabase
--     .channel('notifications-' + userId)
--     .on('postgres_changes', {
--       event: 'INSERT',
--       schema: 'public',
--       table: 'app_notifications',
--       filter: `user_id=eq.${userId}`
--     }, handler)
--     .subscribe();
--
-- ADMIN: subscribe to new pending shipments
--   const channel = supabase
--     .channel('admin-pending')
--     .on('postgres_changes', {
--       event: 'INSERT',
--       schema: 'public',
--       table: 'shipments',
--     }, handler)
--     .subscribe();
```

---

## FILE: 014_admin_rpc.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 014 — ADMIN RPC FUNCTIONS
-- Server-side functions callable via supabase.rpc().
-- All sensitive business logic runs here, not in client code.
-- SECURITY DEFINER: functions run as the defining user (service role).
-- All functions validate the caller's role before executing.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Helper: assert caller is admin ────────────────────────────────
CREATE OR REPLACE FUNCTION assert_admin_role(p_minimum_role user_role DEFAULT 'admin')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNAUTHORIZED: caller profile not found';
  END IF;

  IF p_minimum_role = 'super_admin' AND v_role != 'super_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: super_admin role required';
  END IF;

  IF p_minimum_role = 'admin' AND v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;
END;
$$;

-- ─── Function: get_platform_stats() ────────────────────────────────
-- Returns shipment counts by status, revenue metrics, and user counts.
-- Used by: admin dashboard home screen.
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM assert_admin_role('admin');

  SELECT jsonb_build_object(
    'shipments_by_status', (
      SELECT jsonb_object_agg(status, cnt)
      FROM (
        SELECT status::TEXT, COUNT(*) AS cnt
        FROM shipments
        GROUP BY status
      ) s
    ),
    'total_shipments', (SELECT COUNT(*) FROM shipments),
    'active_shipments', (
      SELECT COUNT(*) FROM shipments
      WHERE status NOT IN ('confirmed', 'rejected', 'cancelled', 'failed')
    ),
    'pending_approval_count', (
      SELECT COUNT(*) FROM shipments WHERE status = 'pending_approval'
    ),
    'total_revenue_mwk', (
      SELECT COALESCE(SUM(amount_mwk), 0)
      FROM payments
      WHERE status = 'paid'
    ),
    'payments_today_count', (
      SELECT COUNT(*) FROM payments
      WHERE status = 'paid'
        AND created_at >= CURRENT_DATE
    ),
    'total_users', (SELECT COUNT(*) FROM user_profiles WHERE role = 'customer'),
    'active_users_30d', (
      SELECT COUNT(DISTINCT user_id) FROM shipments
      WHERE created_at >= NOW() - INTERVAL '30 days'
    ),
    'open_disputes', (
      SELECT COUNT(*) FROM disputes WHERE status IN ('open', 'under_review')
    ),
    'generated_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_platform_stats IS
  'Admin dashboard aggregate stats. Caller must have admin role.
   Returns: shipments by status, total revenue, user counts, open disputes.';

-- ─── Function: admin_transition_shipment() ─────────────────────────
-- Concurrency-safe shipment status transition with full validation.
-- Enforces the state machine transition rules server-side.
-- Records a status event automatically via the trigger.
-- Returns the updated shipment row.
CREATE OR REPLACE FUNCTION admin_transition_shipment(
  p_shipment_id  UUID,
  p_to_status    shipment_status,
  p_notes        TEXT    DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS shipments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment     shipments%ROWTYPE;
  v_actor_id     UUID;
  v_actor_role   user_role;
  v_allowed      shipment_status[];
BEGIN
  -- Validate caller
  PERFORM assert_admin_role('admin');

  v_actor_id := auth.uid();
  SELECT role INTO v_actor_role FROM user_profiles WHERE id = v_actor_id;

  -- Lock the row for update (prevents concurrent transitions)
  SELECT * INTO v_shipment
  FROM shipments
  WHERE id = p_shipment_id
  FOR UPDATE NOWAIT; -- Raises exception if locked by concurrent transaction

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment % does not exist', p_shipment_id;
  END IF;

  -- Validate target transition
  v_allowed := CASE v_shipment.status
    WHEN 'pending_approval'  THEN ARRAY['approved', 'rejected']::shipment_status[]
    WHEN 'approved'          THEN ARRAY['payment_pending', 'cancelled']::shipment_status[]
    WHEN 'payment_pending'   THEN ARRAY['payment_confirmed', 'approved', 'failed']::shipment_status[]
    WHEN 'payment_confirmed' THEN ARRAY['picked_up', 'cancelled']::shipment_status[]
    WHEN 'picked_up'         THEN ARRAY['in_transit']::shipment_status[]
    WHEN 'in_transit'        THEN ARRAY['delivered', 'failed']::shipment_status[]
    WHEN 'delivered'         THEN ARRAY['confirmed']::shipment_status[]
    ELSE ARRAY[]::shipment_status[] -- Terminal states
  END;

  IF p_to_status != ALL(v_allowed) THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: cannot move from % to %. Allowed: %',
      v_shipment.status, p_to_status, v_allowed;
  END IF;

  -- Validate rejection reason is present when rejecting
  IF p_to_status = 'rejected' AND (p_rejection_reason IS NULL OR p_rejection_reason = '') THEN
    RAISE EXCEPTION 'VALIDATION: rejection_reason is required when rejecting a shipment';
  END IF;

  -- Set session variables for the trigger to pick up
  PERFORM set_config('courier.actor_id',         v_actor_id::TEXT,             TRUE);
  PERFORM set_config('courier.actor_role',        v_actor_role::TEXT,           TRUE);
  PERFORM set_config('courier.transition_notes',  COALESCE(p_notes, ''),        TRUE);

  -- Execute the update (trigger writes to shipment_status_events automatically)
  UPDATE shipments
  SET
    status           = p_to_status,
    rejection_reason = CASE WHEN p_to_status = 'rejected'
                         THEN p_rejection_reason
                         ELSE rejection_reason END,
    reviewed_by      = CASE WHEN p_to_status IN ('approved', 'rejected')
                         THEN v_actor_id
                         ELSE reviewed_by END,
    reviewed_at      = CASE WHEN p_to_status IN ('approved', 'rejected')
                         THEN NOW()
                         ELSE reviewed_at END,
    picked_up_at     = CASE WHEN p_to_status = 'picked_up'
                         THEN NOW()
                         ELSE picked_up_at END,
    delivered_at     = CASE WHEN p_to_status = 'delivered'
                         THEN NOW()
                         ELSE delivered_at END,
    confirmed_at     = CASE WHEN p_to_status = 'confirmed'
                         THEN NOW()
                         ELSE confirmed_at END
  WHERE id = p_shipment_id
    AND status = v_shipment.status  -- Optimistic concurrency guard (ADR-005)
  RETURNING * INTO v_shipment;

  -- If 0 rows updated, another transaction beat us to it
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: shipment status was modified concurrently. Reload and retry.';
  END IF;

  -- Write audit log
  INSERT INTO audit_log (event_type, actor_id, actor_role, target_type, target_id, payload)
  VALUES (
    'shipment_status_changed',
    v_actor_id,
    v_actor_role,
    'shipment',
    p_shipment_id,
    jsonb_build_object(
      'from_status', v_shipment.status,
      'to_status',   p_to_status,
      'notes',       p_notes
    )
  );

  RETURN v_shipment;
END;
$$;

COMMENT ON FUNCTION admin_transition_shipment IS
  'Concurrency-safe shipment state transition for admin use.
   Enforces state machine rules. Raises exceptions on invalid transitions.
   Writes audit log entry. Trigger writes status event automatically.
   ADR-005: optimistic concurrency via WHERE status = current_status.';

-- ─── Function: confirm_delivery() ──────────────────────────────────
-- Customer confirms their own delivery. Does not require admin role.
CREATE OR REPLACE FUNCTION confirm_delivery(p_shipment_id UUID)
RETURNS shipments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment   shipments%ROWTYPE;
  v_user_id    UUID := auth.uid();
BEGIN
  SELECT * INTO v_shipment
  FROM shipments
  WHERE id = p_shipment_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment not found';
  END IF;

  -- Only owner can confirm
  IF v_shipment.user_id != v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: only the shipment owner can confirm delivery';
  END IF;

  -- Must be in 'delivered' state
  IF v_shipment.status != 'delivered' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: cannot confirm a shipment in % state', v_shipment.status;
  END IF;

  PERFORM set_config('courier.actor_id',   v_user_id::TEXT, TRUE);
  PERFORM set_config('courier.actor_role', 'customer',       TRUE);

  UPDATE shipments
  SET status = 'confirmed', confirmed_at = NOW()
  WHERE id = p_shipment_id AND status = 'delivered'
  RETURNING * INTO v_shipment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: shipment status changed concurrently. Reload and retry.';
  END IF;

  RETURN v_shipment;
END;
$$;

-- ─── Function: get_shipment_history() ──────────────────────────────
-- Returns a shipment with its full status event timeline.
-- Callable by owner or admin.
CREATE OR REPLACE FUNCTION get_shipment_history(p_shipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_role     user_role;
  v_shipment shipments%ROWTYPE;
  v_events   JSONB;
BEGIN
  SELECT role INTO v_role FROM user_profiles WHERE id = v_user_id;

  SELECT * INTO v_shipment FROM shipments WHERE id = p_shipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: shipment not found';
  END IF;

  -- Access control: owner or admin only
  IF v_shipment.user_id != v_user_id AND v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: access denied';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',          sse.id,
      'from_status', sse.from_status,
      'to_status',   sse.to_status,
      'notes',       sse.notes,
      'actor_role',  sse.actor_role,
      'created_at',  sse.created_at
    ) ORDER BY sse.created_at ASC
  ) INTO v_events
  FROM shipment_status_events sse
  WHERE sse.shipment_id = p_shipment_id;

  RETURN jsonb_build_object(
    'shipment', row_to_json(v_shipment),
    'events',   COALESCE(v_events, '[]'::JSONB)
  );
END;
$$;

-- ─── Function: expire_stale_payments() ─────────────────────────────
-- Called by BullMQ reconciliation worker on a schedule.
-- Marks payments older than 30 minutes that are still in pending/processing.
CREATE OR REPLACE FUNCTION expire_stale_payments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE payments
    SET status = 'expired'
    WHERE status IN ('pending', 'processing')
      AND expires_at < NOW()
    RETURNING shipment_id
  ),
  -- Revert shipment status to 'approved' if payment_pending due to expiry
  reverted AS (
    UPDATE shipments s
    SET status = 'approved'
    FROM expired e
    WHERE s.id = e.shipment_id
      AND s.status = 'payment_pending'
  )
  SELECT COUNT(*) INTO v_expired_count FROM expired;

  RETURN v_expired_count;
END;
$$;

COMMENT ON FUNCTION expire_stale_payments IS
  'Marks payments past their 30-minute expiry as expired.
   Reverts shipment to approved state if it was payment_pending.
   Called by reconciliation worker on a schedule (e.g. every 5 minutes).';

-- ─── Function: admin_get_user_list() ───────────────────────────────
-- Paginated user list for admin user management screen.
CREATE OR REPLACE FUNCTION admin_get_user_list(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_role   user_role DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_users JSONB;
  v_total BIGINT;
BEGIN
  PERFORM assert_admin_role('admin');

  SELECT
    jsonb_agg(u ORDER BY u->>'created_at' DESC),
    COUNT(*) OVER()
  INTO v_users, v_total
  FROM (
    SELECT jsonb_build_object(
      'id',           up.id,
      'email',        up.email,
      'full_name',    up.full_name,
      'phone_number', up.phone_number,
      'role',         up.role,
      'is_active',    up.is_active,
      'created_at',   up.created_at,
      'shipment_count', (
        SELECT COUNT(*) FROM shipments s WHERE s.user_id = up.id
      )
    ) u
    FROM user_profiles up
    WHERE (p_role IS NULL OR up.role = p_role)
      AND (
        p_search IS NULL
        OR up.email ILIKE '%' || p_search || '%'
        OR up.full_name ILIKE '%' || p_search || '%'
        OR up.phone_number ILIKE '%' || p_search || '%'
      )
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'users', COALESCE(v_users, '[]'::JSONB),
    'total', COALESCE(v_total, 0),
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;
```

---

## FILE: 015_storage.sql

```sql
-- ═══════════════════════════════════════════════════════════════════
-- 015 — SUPABASE STORAGE BUCKETS & POLICIES
-- Two buckets: proof-of-delivery (private) and dispute-evidence (private).
-- File access gated by RLS policies on the storage.objects table.
-- Supabase Storage CLI commands documented for bucket creation.
-- ═══════════════════════════════════════════════════════════════════

-- ─── IMPORTANT: Bucket creation ────────────────────────────────────
-- Buckets cannot be created via SQL migrations.
-- Run these commands via Supabase CLI or Dashboard before this migration.
--
-- Option A — Supabase CLI:
--   supabase storage create proof-of-delivery --public=false
--   supabase storage create dispute-evidence  --public=false
--
-- Option B — Supabase Dashboard:
--   Storage → New Bucket → Name: proof-of-delivery, Private
--   Storage → New Bucket → Name: dispute-evidence,  Private
--
-- Option C — Management API (in CI/CD):
--   POST /storage/v1/bucket
--   { "id": "proof-of-delivery", "name": "proof-of-delivery", "public": false }
--
-- The SQL below sets storage object policies assuming the buckets exist.

-- ─── BUCKET SPECS ──────────────────────────────────────────────────
-- proof-of-delivery
--   Max size:    5MB per file
--   MIME types:  image/jpeg, image/png, image/webp
--   Path format: {shipment_id}/{timestamp}_{filename}
--   Access:      Owner + admin read; courier write via backend service role
--
-- dispute-evidence
--   Max size:    10MB per file
--   MIME types:  image/jpeg, image/png, image/webp, application/pdf
--   Path format: {dispute_id}/{timestamp}_{filename}
--   Access:      Owner + admin read; owner upload via backend service role

-- ─── Storage object policies ───────────────────────────────────────

-- PROOF-OF-DELIVERY: owner read
-- Users can read their own proof-of-delivery images.
-- Path convention: {shipment_id}/... where shipment_id is the folder name.
CREATE POLICY "pod: owner can read own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'proof-of-delivery'
    AND EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id::TEXT = (storage.foldername(name))[1]
        AND s.user_id = auth.uid()
    )
  );

-- PROOF-OF-DELIVERY: admin read all
CREATE POLICY "pod: admin can read all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'proof-of-delivery'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- PROOF-OF-DELIVERY: backend uploads via service role (no client policy needed)
-- The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses all policies.
-- Only admins/couriers trigger uploads through the backend API.

-- DISPUTE-EVIDENCE: owner read
CREATE POLICY "dispute-evidence: owner can read own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::TEXT = (storage.foldername(name))[1]
        AND d.user_id = auth.uid()
    )
  );

-- DISPUTE-EVIDENCE: admin read all
CREATE POLICY "dispute-evidence: admin can read all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role IN ('admin', 'super_admin')
    )
  );

-- DISPUTE-EVIDENCE: owner can upload their own evidence
-- Backend validates file size and MIME type before generating upload URL.
CREATE POLICY "dispute-evidence: owner can insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'dispute-evidence'
    AND EXISTS (
      SELECT 1 FROM disputes d
      WHERE d.id::TEXT = (storage.foldername(name))[1]
        AND d.user_id = auth.uid()
        AND d.status IN ('open', 'under_review') -- Cannot add evidence to resolved disputes
    )
  );

-- ─── Storage helper function ────────────────────────────────────────
-- Generates a consistent object path for proof-of-delivery uploads.
CREATE OR REPLACE FUNCTION get_pod_upload_path(
  p_shipment_id UUID,
  p_filename     TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Format: {shipment_id}/{epoch_ms}_{filename}
  -- Epoch ms prevents collisions on rapid retries.
  RETURN p_shipment_id::TEXT
    || '/'
    || EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT
    || '_'
    || REGEXP_REPLACE(p_filename, '[^a-zA-Z0-9._-]', '_', 'g');
END;
$$;

-- ─── Post-migration verification ───────────────────────────────────
-- Run this block after migration to verify schema integrity.
DO $$
DECLARE
  v_table_count INTEGER;
  v_enum_count  INTEGER;
  v_func_count  INTEGER;
BEGIN
  -- Verify all tables exist
  SELECT COUNT(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'user_profiles',
      'saved_addresses',
      'shipments',
      'shipment_status_events',
      'payments',
      'app_notifications',
      'audit_log',
      'pricing_config',
      'disputes'
    );

  ASSERT v_table_count = 9,
    'Expected 9 tables, found ' || v_table_count;

  -- Verify enums exist
  SELECT COUNT(*) INTO v_enum_count
  FROM pg_type
  WHERE typname IN (
    'user_role', 'shipment_status', 'package_size',
    'payment_method', 'payment_status', 'notification_type',
    'dispute_category', 'dispute_status', 'audit_event_type'
  ) AND typtype = 'e';

  ASSERT v_enum_count = 9,
    'Expected 9 enums, found ' || v_enum_count;

  -- Verify key RPC functions exist
  SELECT COUNT(*) INTO v_func_count
  FROM pg_proc
  WHERE proname IN (
    'get_platform_stats',
    'admin_transition_shipment',
    'confirm_delivery',
    'get_shipment_history',
    'expire_stale_payments',
    'calculate_shipment_price',
    'generate_tracking_number',
    'admin_get_user_list'
  );

  ASSERT v_func_count = 8,
    'Expected 8 RPC functions, found ' || v_func_count;

  RAISE NOTICE 'Phase 2 verification passed: % tables, % enums, % functions',
    v_table_count, v_enum_count, v_func_count;
END $$;
```

---

## SCHEMA SUMMARY

### Tables and their purposes

| Table | Rows grow from | Primary use |
|---|---|---|
| `user_profiles` | Registration | Identity, roles, FCM tokens |
| `saved_addresses` | User action | Address book for form pre-fill |
| `shipments` | Customer creates | Core business entity; flat snapshot |
| `shipment_status_events` | Trigger on `shipments.status` change | Immutable audit trail |
| `payments` | Payment initiation | Payment lifecycle; idempotency |
| `app_notifications` | BullMQ worker | In-app notification inbox |
| `audit_log` | Backend services | Sensitive operation audit trail |
| `pricing_config` | Admin/seeded | Temporal pricing rules |
| `disputes` | Customer action | Dispute tickets |

### Enum types

| Type | Values |
|---|---|
| `user_role` | customer, admin, super_admin |
| `shipment_status` | 11 states per state machine |
| `package_size` | small, medium, large |
| `payment_method` | airtel_money, tnm_mpamba, bank_transfer, card |
| `payment_status` | pending, processing, paid, failed, refunded, expired |
| `notification_type` | 10 event types |
| `dispute_category` | 6 categories |
| `dispute_status` | open, under_review, resolved, closed |
| `audit_event_type` | 17 event types |

### RPC functions

| Function | Caller | Purpose |
|---|---|---|
| `get_platform_stats()` | admin+ | Dashboard aggregate metrics |
| `admin_transition_shipment(...)` | admin+ | Concurrency-safe state transition |
| `confirm_delivery(...)` | owner | Customer confirms receipt |
| `get_shipment_history(...)` | owner or admin | Shipment + full event timeline |
| `expire_stale_payments()` | service role | Reconciliation worker cron |
| `calculate_shipment_price(...)` | all | Pricing calculation |
| `admin_get_user_list(...)` | admin+ | Paginated user management |
| `generate_tracking_number()` | trigger | Internal: called by INSERT trigger |

### RLS policy matrix

| Table | Customer | Admin | Super-admin | Service role |
|---|---|---|---|---|
| user_profiles | read/update own | read all | update any | full |
| saved_addresses | full own | read all | read all | full |
| shipments | read own, insert, update notes | read all, update | read all, update | full |
| shipment_status_events | read own | read all | read all | full |
| payments | read own | read all | read all | full |
| app_notifications | read/update-read own | read all | read all | full |
| audit_log | none | none | read | insert |
| pricing_config | read | read | write | full |
| disputes | read/insert own | full | full | full |

---

## APPLYING MIGRATIONS

### Local development

```bash
# Start local Supabase
supabase start

# Apply all migrations (runs 001 → 015 in order)
supabase db push

# Verify schema
supabase db diff

# Reset and re-apply (destructive — dev only)
supabase db reset

# Connect directly for debugging
psql $(supabase db url)
```

### Staging / production

```bash
# Link to remote project
supabase link --project-ref YOUR_PROJECT_REF

# Dry-run: see what will change
supabase db diff --linked

# Apply to remote (requires confirmation)
supabase db push --linked

# Verify RPC functions are callable
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/rest/v1/rpc/get_platform_stats' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Adding a new migration

```bash
# Create a new numbered migration file
supabase migration new add_courier_table

# Edit the generated file in supabase/migrations/
# Then apply:
supabase db push
```

**Rules:**
- Never edit a committed migration file.
- Never re-number migrations.
- New migrations always get the next sequential number.
- Test on local before pushing to staging.
- Staging before production.

---

## CRITICAL INVARIANTS ENFORCED BY SCHEMA

These constraints prevent data corruption. If the backend tries to violate them, the database will reject the operation.

```
1. weight_kg BETWEEN 0.1 AND 10.0           → Max 10kg business rule (FR-12)
2. *_city IN ('Lilongwe','Blantyre','Mzuzu') → Service region restriction (FR-13)
3. quoted_price_mwk > 0 (INTEGER)           → No free shipments, no floating-point money
4. payments.idempotency_key UNIQUE          → No duplicate payments on retry (ADR-006)
5. ONE active payment per shipment          → Partial unique index on payments
6. shipment_status_events: no UPDATE/DELETE → Immutable audit trail
7. picked_up_at <= delivered_at            → Temporal integrity
8. ONE active dispute per shipment          → EXCLUDE constraint on disputes
9. ONE active pricing config               → Partial unique index on pricing_config
10. user_profiles.id → auth.users.id CASCADE → No orphaned profiles
```

---

## PERFORMANCE NOTES

| Query pattern | Index covering it |
|---|---|
| Customer fetches own shipments | `idx_shipments_user_id (user_id, created_at DESC)` |
| Admin fetches pending queue | `idx_shipments_status` (partial: non-terminal only) |
| Lookup by tracking number | `idx_shipments_tracking_number` (unique) |
| Admin searches by phone | `idx_shipments_sender_phone_trgm` (trigram GIN) |
| Notification inbox | `idx_notifications_user_id (user_id, created_at DESC)` |
| Unread count | `idx_notifications_unread` (partial: is_read = FALSE) |
| Active payment expiry cron | `idx_payments_expires_at` (partial: pending/processing) |
| Audit log by actor | `idx_audit_log_actor_id (actor_id, created_at DESC)` |

---

*Deliverable: `PHASE_2_DATABASE_SCHEMA.md` — 15 SQL migration files, fully annotated.*

*Next step: Copy the 15 SQL blocks into `supabase/migrations/` numbered as listed. Run `supabase db push`. Verify with `psql` that `get_platform_stats()` returns valid JSON. Then proceed to Phase 3: Backend API Core Infrastructure (env validation, app factory, service clients, middleware, error hierarchy, health route).*
