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
