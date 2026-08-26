-- ─────────────────────────────────────────────────────────
-- 0038  A seventh rotation, added by hand
-- BUILD-SPEC D62 and A15: "a seventh rotation, if played, uses rule 1" —
-- ruleForRotation(7) already returns rule 1 on the client — "and the coach
-- adds it by hand from the court board."
--
-- add_rotation raises session_instances.rotation_count by one and hands back
-- the new value. It does not touch the lineup itself: the client regenerates
-- from the returned count, the same full rebuild the Regenerate button already
-- confirms and performs (13.8), so this function's only job is the number and
-- its ceiling.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_rotation(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  -- Staff-only and locked-session checks, shared with every other lineup
  -- write in migration 0033.
  v_session := lineup_session_for_update(p_session_id);

  -- session_instances' own CHECK caps rotation_count at 10; raised here first
  -- for a message rather than a bare constraint violation.
  IF v_session.rotation_count >= 10 THEN RAISE EXCEPTION 'rotation_count_at_maximum'; END IF;

  UPDATE session_instances
  SET rotation_count = rotation_count + 1
  WHERE id = p_session_id
  RETURNING rotation_count INTO v_session.rotation_count;

  RETURN v_session.rotation_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_rotation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION add_rotation(uuid) TO authenticated;
