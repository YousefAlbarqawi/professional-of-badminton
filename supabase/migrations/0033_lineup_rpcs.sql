-- ─────────────────────────────────────────────────────────
-- 0033  The court board's writes
-- BUILD-SPEC 13.8 (regeneration), 13.9 (manual editing), D65, D68
--
-- ── Why these are functions and not table writes ──────────
-- 0012 gives staff `FOR ALL` on rotations, court_assignments, rotation_sitouts
-- and locked_courts, so a client could in principle write them directly. It
-- must not. Saving a lineup replaces four tables' worth of rows at once, and a
-- board that is half of the old lineup and half of the new one is worse than
-- no board at all — the coach reads it aloud and would put five people on one
-- court. Every function here is one transaction.
--
-- ── has_manual_lineup is the whole of 13.8 ────────────────
-- "While false: any booking change discards and regenerates the whole lineup
-- automatically. The moment the coach drags, swaps, or locks anything, set it
-- to true. While true: booking changes do not touch the lineup."
--
-- 0020's mark_lineup_stale is the discarding half, and it already refuses to
-- touch a session whose flag is true. This migration is the other half: every
-- function that represents a manual edit sets the flag, and save_lineup — which
-- is only ever the engine's output — clears it.
--
-- ── D68: the court board is coach and admin only ──────────
-- is_staff() on every one, and D18 keeps players out of the tables underneath
-- regardless.
-- ─────────────────────────────────────────────────────────

-- The session a rotation belongs to, guarded. Every function below starts
-- here, so the staff check and the locked-session check are written once.
CREATE OR REPLACE FUNCTION lineup_session_for_update(p_session_id uuid)
RETURNS session_instances
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- D39: after seven days the session locks permanently and every mutation
  -- stops, the lineup included.
  IF v_session.status = 'locked' THEN RAISE EXCEPTION 'session_locked'; END IF;

  RETURN v_session;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- save_lineup
-- BUILD-SPEC 13.8
--
-- The engine's output, written whole. The payload is the `Lineup` from 13.2,
-- one array element per rotation:
--
--   [{ "index": 1,
--      "rule": "rule_1_similar",
--      "courts": [{ "court_number": 1,
--                   "team1": ["<booking uuid>", "<booking uuid>"],
--                   "team2": ["<booking uuid>", "<booking uuid>"] }],
--      "sit_outs": ["<booking uuid>"] }]
--
-- A team holds one or two ids: 13.7's singles court has one a side, and on
-- exactly three attendees one side has two and the other one.
--
-- Clearing has_manual_lineup is not a side effect, it is the point. This
-- function only ever carries generated work, so after it runs the lineup is
-- once again something a booking change may discard (13.8), and 0020's
-- mark_lineup_stale starts working again.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_lineup(p_session_id uuid, p_lineup jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session     session_instances;
  v_rotation    jsonb;
  v_court       jsonb;
  v_rotation_id uuid;
  v_booking     uuid;
BEGIN
  v_session := lineup_session_for_update(p_session_id);

  IF jsonb_typeof(p_lineup) <> 'array' THEN RAISE EXCEPTION 'invalid_lineup'; END IF;

  -- ON DELETE CASCADE from rotations clears court_assignments and
  -- rotation_sitouts with it. locked_courts and pairing_rules are inputs to
  -- generation, not results of it, and 13.8 says they survive.
  DELETE FROM rotations WHERE session_id = p_session_id;

  FOR v_rotation IN SELECT * FROM jsonb_array_elements(p_lineup) LOOP
    INSERT INTO rotations (session_id, rotation_index, rule)
    VALUES (
      p_session_id,
      (v_rotation->>'index')::integer,
      (v_rotation->>'rule')::rotation_rule
    )
    RETURNING id INTO v_rotation_id;

    FOR v_court IN SELECT * FROM jsonb_array_elements(v_rotation->'courts') LOOP
      FOR v_booking IN
        SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(v_court->'team1')
      LOOP
        INSERT INTO court_assignments (rotation_id, court_number, booking_id, team)
        VALUES (v_rotation_id, (v_court->>'court_number')::integer, v_booking, 1);
      END LOOP;

      FOR v_booking IN
        SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(v_court->'team2')
      LOOP
        INSERT INTO court_assignments (rotation_id, court_number, booking_id, team)
        VALUES (v_rotation_id, (v_court->>'court_number')::integer, v_booking, 2);
      END LOOP;
    END LOOP;

    FOR v_booking IN
      SELECT (value #>> '{}')::uuid FROM jsonb_array_elements(COALESCE(v_rotation->'sit_outs', '[]'::jsonb))
    LOOP
      INSERT INTO rotation_sitouts (rotation_id, booking_id) VALUES (v_rotation_id, v_booking);
    END LOOP;
  END LOOP;

  UPDATE session_instances
  SET has_manual_lineup = false, updated_at = now()
  WHERE id = p_session_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- swap_lineup_players
-- BUILD-SPEC 13.9
--
-- "Drag a player tile onto another player tile to swap them. Cross-court and
-- same-court both work." A resting player's tile is a player tile too, so the
-- two ends of a swap can be any pair of: a slot on a court, or a place in the
-- Resting list.
--
-- "Swapping into or out of a locked court is blocked with a toast explaining
-- why." The board refuses first so the coach gets the toast; this refuses
-- again, because a locked court that a client could edit is not locked.
--
-- 13.9: "Every edit writes immediately to court_assignments. There is no save
-- button." So this is called per swap, and it is what sets has_manual_lineup.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION swap_lineup_players(
  p_rotation_id uuid,
  p_booking_a   uuid,
  p_booking_b   uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_a          court_assignments;
  v_b          court_assignments;
  v_a_resting  boolean;
  v_b_resting  boolean;
BEGIN
  IF p_booking_a = p_booking_b THEN RAISE EXCEPTION 'same_player'; END IF;

  SELECT session_id INTO v_session_id FROM rotations WHERE id = p_rotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rotation_not_found'; END IF;

  PERFORM lineup_session_for_update(v_session_id);

  SELECT * INTO v_a FROM court_assignments
   WHERE rotation_id = p_rotation_id AND booking_id = p_booking_a;
  v_a_resting := NOT FOUND;

  SELECT * INTO v_b FROM court_assignments
   WHERE rotation_id = p_rotation_id AND booking_id = p_booking_b;
  v_b_resting := NOT FOUND;

  IF v_a_resting AND v_b_resting THEN RAISE EXCEPTION 'assignment_not_found'; END IF;

  IF EXISTS (
    SELECT 1 FROM locked_courts lc
     WHERE lc.session_id = v_session_id
       AND lc.court_number IN (
         COALESCE(v_a.court_number, -1), COALESCE(v_b.court_number, -1)
       )
  ) THEN
    RAISE EXCEPTION 'court_locked';
  END IF;

  IF v_a_resting OR v_b_resting THEN
    -- One of the two is in the Resting list. They trade places: the rested
    -- player takes the court slot, the other joins the list.
    DECLARE
      v_on_court   court_assignments := CASE WHEN v_a_resting THEN v_b ELSE v_a END;
      v_resting_id uuid := CASE WHEN v_a_resting THEN p_booking_a ELSE p_booking_b END;
    BEGIN
      DELETE FROM rotation_sitouts
       WHERE rotation_id = p_rotation_id AND booking_id = v_resting_id;

      UPDATE court_assignments
         SET booking_id = v_resting_id
       WHERE id = v_on_court.id;

      INSERT INTO rotation_sitouts (rotation_id, booking_id)
      VALUES (p_rotation_id, v_on_court.booking_id);
    END;
  ELSE
    -- Both are on court. The unique index on (rotation_id, booking_id) means
    -- the two rows cannot hold the same booking even for an instant, so the
    -- court and team move rather than the booking id.
    UPDATE court_assignments
       SET court_number = v_b.court_number, team = v_b.team
     WHERE id = v_a.id;
    UPDATE court_assignments
       SET court_number = v_a.court_number, team = v_a.team
     WHERE id = v_b.id;
  END IF;

  UPDATE session_instances
  SET has_manual_lineup = true, updated_at = now()
  WHERE id = v_session_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- lock_court / unlock_court
-- BUILD-SPEC 13.9, 13.4 rule 3
--
-- "Long press a court to lock it. A locked court shows a padlock and is
-- excluded from all future generation."
--
-- Future generation, and not this one. Locking takes the four players who are
-- on that court in the rotation the coach is looking at and records them as an
-- input; the rotations already on screen are left exactly as they are. A lock
-- that silently rewrote the other five rotations would be a regeneration
-- wearing a padlock, and 13.8 is clear that only the Regenerate button may
-- destroy his work.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lock_court(p_rotation_id uuid, p_court_number integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session_id uuid;
  v_bookings   uuid[];
BEGIN
  SELECT session_id INTO v_session_id FROM rotations WHERE id = p_rotation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rotation_not_found'; END IF;

  PERFORM lineup_session_for_update(v_session_id);

  SELECT array_agg(booking_id ORDER BY team, booking_id) INTO v_bookings
    FROM court_assignments
   WHERE rotation_id = p_rotation_id AND court_number = p_court_number;

  -- 13.4 rule 3 says a locked court keeps exactly four players. A singles
  -- court cannot be one, so the board does not offer the gesture there and
  -- this refuses it if it arrives anyway.
  IF v_bookings IS NULL OR array_length(v_bookings, 1) <> 4 THEN
    RAISE EXCEPTION 'court_not_full';
  END IF;

  INSERT INTO locked_courts (session_id, court_number, booking_ids)
  VALUES (v_session_id, p_court_number, v_bookings)
  ON CONFLICT (session_id, court_number)
  DO UPDATE SET booking_ids = EXCLUDED.booking_ids;

  UPDATE session_instances
  SET has_manual_lineup = true, updated_at = now()
  WHERE id = v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION unlock_court(p_session_id uuid, p_court_number integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM lineup_session_for_update(p_session_id);

  DELETE FROM locked_courts
   WHERE session_id = p_session_id AND court_number = p_court_number;

  UPDATE session_instances
  SET has_manual_lineup = true, updated_at = now()
  WHERE id = p_session_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- Pairing rules. D65.
--
-- These are per player and not per session, which is what the table in 0007
-- says and what the coach means: two brothers who should never be on the same
-- team are never on the same team, on any night. They survive regeneration
-- (13.8) because they are inputs.
--
-- Guests have no profile row (D44, D46), so they cannot carry a rule. The
-- board only offers registered players.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_pairing_rule(
  p_kind      pairing_rule_kind,
  p_player_a  uuid,
  p_player_b  uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_player_a = p_player_b THEN RAISE EXCEPTION 'same_player'; END IF;

  -- The unique index in 0007 is on the unordered pair, so re-stating a rule
  -- the other way round changes its kind rather than failing.
  INSERT INTO pairing_rules (kind, player_a_id, player_b_id, created_by)
  VALUES (p_kind, p_player_a, p_player_b, auth.uid())
  ON CONFLICT (LEAST(player_a_id, player_b_id), GREATEST(player_a_id, player_b_id))
  DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_pairing_rule(p_rule_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  DELETE FROM pairing_rules WHERE id = p_rule_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- count_lineup_changes
-- BUILD-SPEC 13.8
--
-- "While true: booking changes do not touch the lineup. Instead the court
-- board shows a banner: '3 changes since this lineup was made'."
--
-- The number is bookings added and bookings removed since the lineup was
-- generated. `rotations.generated_at` is when that was; a session with no
-- rotations has no lineup to be stale, and answers zero.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION count_lineup_changes(p_session_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_generated_at timestamptz;
  v_count        integer;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT max(generated_at) INTO v_generated_at
    FROM rotations WHERE session_id = p_session_id;

  IF v_generated_at IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO v_count
    FROM bookings b
   WHERE b.session_id = p_session_id
     AND (
       (b.status = 'confirmed' AND b.booked_at > v_generated_at)
       OR (b.status <> 'confirmed' AND b.cancelled_at > v_generated_at)
     );

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION lineup_session_for_update(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION save_lineup(uuid, jsonb)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION swap_lineup_players(uuid, uuid, uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION lock_court(uuid, integer)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION unlock_court(uuid, integer)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION set_pairing_rule(pairing_rule_kind, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION delete_pairing_rule(uuid)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION count_lineup_changes(uuid)                  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION save_lineup(uuid, jsonb)                     TO authenticated;
GRANT EXECUTE ON FUNCTION swap_lineup_players(uuid, uuid, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION lock_court(uuid, integer)                    TO authenticated;
GRANT EXECUTE ON FUNCTION unlock_court(uuid, integer)                  TO authenticated;
GRANT EXECUTE ON FUNCTION set_pairing_rule(pairing_rule_kind, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_pairing_rule(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION count_lineup_changes(uuid)                   TO authenticated;
