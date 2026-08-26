-- ─────────────────────────────────────────────────────────
-- 0016  Amman's today, and the schedule window that hangs off it
-- BUILD-SPEC sections 5.1 and 5.2
--
-- Section 5.1: "All display and all business comparisons convert to
-- Asia/Amman first." `current_date` does not. It reads the database session's
-- timezone, which on Supabase is UTC, and Amman is UTC+3 with no daylight
-- saving. So for the three hours between 00:00 and 03:00 Amman, `current_date`
-- is still yesterday.
--
-- Phase 1 wrote the player's 5 day window against `current_date`. During those
-- three hours it showed him a day that finished last night and hid the fifth
-- day, which is not "exactly 5 days". Every date comparison that means "today
-- in Amman" now goes through amman_today() instead.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION amman_today() RETURNS date
LANGUAGE sql STABLE
SET search_path = public, pg_temp AS $$
  SELECT (now() AT TIME ZONE 'Asia/Amman')::date;
$$;

REVOKE EXECUTE ON FUNCTION amman_today() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION amman_today() TO authenticated;

-- Recreated verbatim from 0012 apart from the two date comparisons. The A20
-- disjunct — a player can always read a session he himself has a booking on —
-- is unchanged.
DROP POLICY session_instances_select_window ON session_instances;

CREATE POLICY session_instances_select_window ON session_instances FOR SELECT TO authenticated
  USING (
    (status <> 'cancelled'
     AND session_date >= amman_today()
     AND session_date <= amman_today() + 4)
    OR EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.session_id = session_instances.id
        AND b.player_id = auth.uid()
    )
  );
