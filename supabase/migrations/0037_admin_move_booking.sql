-- ─────────────────────────────────────────────────────────
-- 0037  Move a player to another session
-- BUILD-SPEC 15.2, "Move to another session" — one of the three players-tab
-- row actions, unbuilt through phase 9 because the sentence names it and
-- nothing else does. OPEN-ITEMS.md recorded three unanswered questions and is
-- updated alongside this migration with the answers:
--
--   Does the price re-resolve?    No. `expected_fils` and `paid_fils` move
--                                  across unchanged. Money already collected,
--                                  or already owed, is not this action's to
--                                  change — the coach adjusts it from the
--                                  target session's Money tab afterwards if
--                                  the two sessions' prices genuinely differ,
--                                  the same way he corrects any other booking.
--                                  This also keeps `paid_fils <= expected_fils`
--                                  true for free: it held for the row being
--                                  copied, and copying both sides preserves it.
--
--   Does a credit follow him?     Yes, literally: the new booking reuses the
--                                  same `credit_txn_id`. No refund is issued
--                                  and no second credit is spent — one credit
--                                  bought him a spot this week, and it is
--                                  still buying him a spot, just a different
--                                  one. If the new booking is later removed,
--                                  `admin_remove_booking` finds that same
--                                  `credit_txn_id` and refunds it exactly as
--                                  it would for a booking that was never
--                                  moved.
--
--   Does target capacity apply?   Yes, unconditionally — D30 allows no
--                                  exception, and `assert_session_addable` is
--                                  the same lock-and-count gate a fresh
--                                  booking passes through.
--
-- Scoped to `attendee_kind = 'player'`. A guest is never remembered (D46) and
-- has nothing to move to — a new one would be typed at the target instead.
-- A coach's booking is tied to the night's fee split (`session_coaches`,
-- D76), which a plain move does not carry, so that stays `admin_remove_booking`
-- plus `admin_add_coach` until a session manage row asks for a coach move
-- specifically, which 15.2's sentence never does.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_move_booking(
  p_booking_id         uuid,
  p_target_session_id  uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_booking bookings;
  v_new_id  uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  IF v_booking.attendee_kind <> 'player' THEN
    RAISE EXCEPTION 'not_a_player_booking';
  END IF;

  -- 5.6: settled is a reviewed booking, not a finished one, same as
  -- admin_remove_booking's own check.
  IF v_booking.status NOT IN ('confirmed', 'settled') THEN
    RAISE EXCEPTION 'already_cancelled';
  END IF;

  IF v_booking.session_id = p_target_session_id THEN
    RAISE EXCEPTION 'invalid_target_session';
  END IF;

  -- D39, both halves — the session he is leaving must still be open to edits.
  PERFORM assert_session_unlocked(v_booking.session_id);

  -- is_staff (again, harmlessly), lock, open/not-cancelled, capacity: the same
  -- gate admin_add_player sends a fresh booking through.
  PERFORM assert_session_addable(p_target_session_id);

  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_target_session_id
               AND player_id = v_booking.player_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  UPDATE bookings
  SET status       = 'cancelled_by_admin',
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE id = p_booking_id;

  -- 9.3, same as admin_remove_booking: no balance entry survives a booking
  -- that no longer stands at its original session.
  DELETE FROM balance_entries WHERE booking_id = p_booking_id;

  INSERT INTO bookings (session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, paid_fils,
                        credit_txn_id, source, created_by)
  VALUES (p_target_session_id, 'player', v_booking.player_id, v_booking.tier_snapshot,
          v_booking.payment_method, v_booking.payment_status,
          v_booking.expected_fils, v_booking.paid_fils,
          v_booking.credit_txn_id, 'admin_added', auth.uid())
  RETURNING id INTO v_new_id;

  DELETE FROM waitlist_entries
    WHERE session_id = p_target_session_id AND player_id = v_booking.player_id;

  -- A spot opened at the session he left; nothing changed at the one he
  -- joined that a fresh booking wouldn't already have accounted for.
  PERFORM notify_waitlist(v_booking.session_id);
  PERFORM mark_lineup_stale(v_booking.session_id);
  PERFORM mark_lineup_stale(p_target_session_id);

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_move_booking(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_move_booking(uuid, uuid) TO authenticated;
