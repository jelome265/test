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
