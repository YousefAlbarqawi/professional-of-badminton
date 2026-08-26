-- ─────────────────────────────────────────────────────────
-- 0014  A profile for every new auth user, and a profile that
--       survives that auth user being deleted
-- BUILD-SPEC sections 14.2, 14.14, assumption A1
-- ─────────────────────────────────────────────────────────

-- ── The profile row is created by the database, not the client ──────────
--
-- Section 14.2: "create the auth.users row and a profiles row in a trigger".
-- Doing it client side would mean a second round trip that can fail after the
-- account exists, leaving an auth user with no profile and therefore no role,
-- which every RLS helper reads. The trigger makes the pair atomic.
--
-- The four fields come from the sign-up metadata. Phone is the discriminator:
-- the app always sends it, and supabase/seed.sql inserts auth.users rows
-- directly and then writes its own profiles rows with roles, tiers and custom
-- rates the trigger knows nothing about. No phone in the metadata means the
-- caller is doing its own insert, so the trigger stands aside.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_first  text := trim(COALESCE(NEW.raw_user_meta_data->>'first_name', ''));
  v_last   text := trim(COALESCE(NEW.raw_user_meta_data->>'last_name', ''));
  v_phone  text := trim(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  v_locale text := COALESCE(NEW.raw_user_meta_data->>'preferred_locale', 'ar');
BEGIN
  IF v_phone = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO profiles (id, first_name, last_name, phone, preferred_locale)
  VALUES (
    NEW.id,
    v_first,
    v_last,
    v_phone,
    CASE WHEN v_locale IN ('ar', 'en') THEN v_locale ELSE 'ar' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Deletion must anonymise, not erase ──────────────────────────────────
--
-- Section 14.14 step 4 deletes the auth.users row. Assumption A1 requires the
-- profile, and the bookings, balance entries and credit history hanging off
-- it, to survive that deletion anonymised, "so the coach's historical reports
-- do not develop holes".
--
-- Section 6.2 declared profiles.id as a cascading reference to auth.users,
-- which does the opposite: deleting the auth user deletes the profile, and the
-- cascades on balance_entries, player_subscriptions and credit_transactions
-- then destroy exactly the history A1 preserves. The two cannot both hold, so
-- the reference is dropped. profiles.id still carries the same uuid as
-- auth.uid(), so every policy and helper written against it is untouched; what
-- changes is that a profile may now outlive its auth user, which is precisely
-- the state a deleted account is meant to be in.
ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;

-- A1 nulls the phone on deletion. Section 6.2 declared it NOT NULL with a
-- 9-to-15 digit check, which leaves only a fabricated number as the
-- alternative — worse than absent, since it could collide with a real one.
ALTER TABLE profiles ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN profiles.phone IS
  'Null only on a deleted account. Every live profile has one (BUILD-SPEC 14.2).';
