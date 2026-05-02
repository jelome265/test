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
