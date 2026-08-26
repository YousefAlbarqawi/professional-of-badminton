-- ─────────────────────────────────────────────────────────
-- 0002  Profiles
-- BUILD-SPEC section 6.2
-- ─────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name            text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 50),
  last_name             text NOT NULL CHECK (length(trim(last_name))  BETWEEN 1 AND 50),
  phone                 text NOT NULL CHECK (phone ~ '^\+?[0-9]{9,15}$'),
  role                  user_role        NOT NULL DEFAULT 'player',
  visibility            visibility_level NOT NULL DEFAULT 'level_0',
  tier                  tier,                      -- null until the coach rates him
  custom_rate_standard_fils integer CHECK (custom_rate_standard_fils >= 0),
  custom_rate_extended_fils integer CHECK (custom_rate_extended_fils >= 0),
  preferred_locale      text NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar','en')),
  is_active             boolean NOT NULL DEFAULT true,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role      ON profiles(role) WHERE deleted_at IS NULL;
CREATE INDEX idx_profiles_name_trgm ON profiles
  USING gin ((first_name||' '||last_name) extensions.gin_trgm_ops);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
