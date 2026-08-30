-- ─────────────────────────────────────────────────────────
-- 0042  Removing a rotation from the court board
--
-- 0038 added `add_rotation` for D62/A15's seventh round. This is its inverse,
-- added on direct client instruction: a night does not always run the number
-- of rounds it was planned for. People leave early, a court is handed back,
-- the hall closes. The coach could add a round and could not take one away.
--
-- ── Any round, not just the last one ──────────────────────
-- The instruction is "delete any round", so the index is a parameter. The
-- rounds above the deleted one close the gap, which keeps `rotation_index`
-- contiguous from 1 — the client's `rotationAt` looks a round up by its index,
-- and the chips are rendered from the indexes that exist.
--
-- The gap is closed one row at a time, in ascending order, rather than with a
-- single `SET rotation_index = rotation_index - 1`. `rotations` has a plain
-- (non-deferrable) UNIQUE (session_id, rotation_index), so a set-based update
-- is checked per row in whatever order the executor picks, and a descending
-- order would collide on the first row. Ascending never does: each row moves
-- into the slot the previous one has already left. The obvious alternative —
-- shifting everything out of the way and back — is not available, because
-- `rotation_index` also carries CHECK (BETWEEN 1 AND 10) and a CHECK cannot be
-- deferred.
--
-- ── What the rounds that remain keep ──────────────────────
-- Their pairings, and their `rule`. Renumbering does not re-derive the rule
-- from the new index: 13.2 alternates rule 1 and rule 2 by round number, but
-- the pairings on screen were made under the rule the round was generated
-- with, and relabelling them would describe them wrongly. The coach can
-- Regenerate if he wants the alternation to line up again.
--
-- `court_assignments` and `rotation_sitouts` reference `rotations(id)` with ON
-- DELETE CASCADE, so the deleted round takes its own board with it, and the
-- rounds that shift keep theirs. `locked_courts` is keyed on the session, not
-- the round, and is untouched.
--
-- ── has_manual_lineup ─────────────────────────────────────
-- Set, for 13.8's reason: this is the coach editing the board by hand, and
-- from here on a booking change must not quietly discard his work and
-- regenerate the full planned number of rounds — which would put back the
-- round he just deleted.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_rotation(p_session_id uuid, p_rotation_index integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
  v_row     record;
BEGIN
  -- Staff-only and locked-session checks, shared with every other lineup
  -- write in migration 0033.
  v_session := lineup_session_for_update(p_session_id);

  -- session_instances' own CHECK floors rotation_count at 1; raised here first
  -- for a message rather than a bare constraint violation, exactly as
  -- add_rotation does for the ceiling.
  IF v_session.rotation_count <= 1 THEN
    RAISE EXCEPTION 'rotation_count_at_minimum';
  END IF;

  IF p_rotation_index IS NULL
     OR p_rotation_index < 1
     OR p_rotation_index > v_session.rotation_count THEN
    RAISE EXCEPTION 'rotation_not_found';
  END IF;

  DELETE FROM rotations
  WHERE session_id = p_session_id
    AND rotation_index = p_rotation_index;

  -- Ascending, one at a time. See the note above.
  FOR v_row IN
    SELECT id, rotation_index
    FROM rotations
    WHERE session_id = p_session_id
      AND rotation_index > p_rotation_index
    ORDER BY rotation_index
  LOOP
    UPDATE rotations
    SET rotation_index = v_row.rotation_index - 1
    WHERE id = v_row.id;
  END LOOP;

  UPDATE session_instances
  SET rotation_count    = rotation_count - 1,
      has_manual_lineup = true
  WHERE id = p_session_id
  RETURNING rotation_count INTO v_session.rotation_count;

  RETURN v_session.rotation_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION remove_rotation(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION remove_rotation(uuid, integer) TO authenticated;
