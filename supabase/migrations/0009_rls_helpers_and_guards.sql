-- ─────────────────────────────────────────────────────────
-- 0009  RLS helper functions, the attendee reader, the profile guard
-- BUILD-SPEC sections 7.1 and 7.2
--
-- Every function here is SECURITY DEFINER so that it reads profiles without
-- re-entering the policies that call it. search_path is pinned on each one so
-- that a caller cannot shadow a table name it depends on.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT COALESCE(auth_role() IN ('admin','coach'), false);
$$;

CREATE OR REPLACE FUNCTION is_coach() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT COALESCE(auth_role() = 'coach', false);
$$;

CREATE OR REPLACE FUNCTION auth_visibility() RETURNS visibility_level
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT visibility FROM profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────
-- The visibility problem, solved properly.
--
-- Row filtering alone cannot express "you may see this row but only two of its
-- columns", so players never select from bookings directly. They call this,
-- and it returns exactly what their level permits and nothing more.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_session_attendees(p_session_id uuid)
RETURNS TABLE (
  booking_id uuid,
  display_name text,
  tier tier,
  is_self boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_level visibility_level;
  v_staff boolean;
BEGIN
  SELECT auth_visibility(), is_staff() INTO v_level, v_staff;

  IF v_staff THEN
    RETURN QUERY
      SELECT b.id,
             COALESCE(p.first_name||' '||p.last_name, b.guest_name),
             COALESCE(b.tier_snapshot, b.guest_tier),
             (b.player_id = auth.uid())
      FROM bookings b
      LEFT JOIN profiles p ON p.id = b.player_id
      WHERE b.session_id = p_session_id AND b.status = 'confirmed'
      ORDER BY b.booked_at;
    RETURN;
  END IF;

  IF v_level = 'level_2' THEN
    RETURN QUERY
      SELECT b.id,
             COALESCE(p.first_name||' '||p.last_name, b.guest_name),
             COALESCE(b.tier_snapshot, b.guest_tier),
             (b.player_id = auth.uid())
      FROM bookings b
      LEFT JOIN profiles p ON p.id = b.player_id
      WHERE b.session_id = p_session_id AND b.status = 'confirmed'
      ORDER BY b.booked_at;

  ELSIF v_level = 'level_1' THEN
    RETURN QUERY
      SELECT b.id,
             NULL::text,
             COALESCE(b.tier_snapshot, b.guest_tier),
             (b.player_id = auth.uid())
      FROM bookings b
      WHERE b.session_id = p_session_id AND b.status = 'confirmed'
      ORDER BY b.booked_at;

  ELSE
    -- level_0, and any caller with no profile at all: nothing but his own row
    RETURN QUERY
      SELECT b.id, NULL::text, NULL::tier, true
      FROM bookings b
      WHERE b.session_id = p_session_id
        AND b.status = 'confirmed'
        AND b.player_id = auth.uid();
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- A player updating his own profile must not be able to change role,
-- visibility, tier, or either custom rate. A WITH CHECK cannot compare to the
-- old row, so this is a trigger.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION guard_profile_privileged_fields()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_staff() THEN
    IF NEW.role <> OLD.role
       OR NEW.visibility <> OLD.visibility
       OR NEW.tier IS DISTINCT FROM OLD.tier
       OR NEW.custom_rate_standard_fils IS DISTINCT FROM OLD.custom_rate_standard_fils
       OR NEW.custom_rate_extended_fils IS DISTINCT FROM OLD.custom_rate_extended_fils
    THEN
      RAISE EXCEPTION 'not_authorized_to_change_privileged_fields';
    END IF;
  END IF;
  IF NEW.role = 'coach' AND OLD.role <> 'coach' AND NOT is_coach() THEN
    RAISE EXCEPTION 'only_coach_can_create_coach';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_profile BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_fields();

-- Nothing here is callable by an unauthenticated caller.
REVOKE EXECUTE ON FUNCTION auth_role()            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_staff()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_coach()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auth_visibility()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_session_attendees(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION auth_role()            TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff()             TO authenticated;
GRANT EXECUTE ON FUNCTION is_coach()             TO authenticated;
GRANT EXECUTE ON FUNCTION auth_visibility()      TO authenticated;
GRANT EXECUTE ON FUNCTION get_session_attendees(uuid) TO authenticated;
