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
