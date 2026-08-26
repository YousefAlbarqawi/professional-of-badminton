-- ─────────────────────────────────────────────────────────
-- 0023  Cancelling a booking, by the player and by the coach
-- BUILD-SPEC 8.3, 9.2, 9.3, D23 to D26
--
-- 9.3 is the table that matters and its most surprising line is the one that
-- is empty: **the app never creates a balance entry from a cancellation**. A
-- player who cancels late owes nothing in the system. Cash owes nothing either
-- way, CliQ is settled between him and the coach outside the app, and the only
-- thing that moves is a credit.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- cancel_own_booking(booking)
-- BUILD-SPEC 8.3 and 9.2
--
--   1. booking belongs to the caller        -> not_your_booking
--   2. status is confirmed                  -> already_cancelled
--   3. now is before starts_at - 3 hours    -> cancellation_window_closed
--
-- D23 and D24: he may cancel until three hours before start, and not a minute
-- after; inside the last three hours only the coach can remove him. 5.1 makes
-- the server the authority on that boundary, so the client's copy of the same
-- rule (features/bookings/bookingState.ts) decides which button to draw and
-- nothing more.
--
-- D25: cancelling more than 3 hours out returns the credit. The refund goes
-- back to the subscription it came from even if that subscription has since
-- expired — A2 — and the nightly expiry job then voids it like any other
-- credit. Moving credits between subscriptions would be a second rule to
-- explain and would rewrite a ledger that D56 keeps append only.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_own_booking(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_booking bookings;
  v_session session_instances;
  v_sub_id  uuid;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- Rule 1. RLS already hides other people's bookings from a player's reads,
  -- but this is a security definer function and reads past RLS, so the check
  -- has to be made here in as many words.
  IF v_booking.player_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_your_booking';
  END IF;

  -- Rule 2
  IF v_booking.status <> 'confirmed' THEN RAISE EXCEPTION 'already_cancelled'; END IF;

  SELECT * INTO v_session FROM session_instances
    WHERE id = v_booking.session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- Rule 3
  IF now() > v_session.starts_at - interval '3 hours' THEN
    RAISE EXCEPTION 'cancellation_window_closed';
  END IF;

  UPDATE bookings
  SET status       = 'cancelled_by_player',
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE id = p_booking_id;

  -- 9.3, credit column, left cell: +1 returned, reason booking_refund.
  IF v_booking.payment_method = 'credit' AND v_booking.credit_txn_id IS NOT NULL THEN
    SELECT subscription_id INTO v_sub_id
    FROM credit_transactions WHERE id = v_booking.credit_txn_id;

    INSERT INTO credit_transactions
      (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES (v_sub_id, v_booking.player_id, 1, 'booking_refund', p_booking_id, auth.uid());
  END IF;

  -- A spot just opened. Whether anybody hears about it is D28's decision, not
  -- this function's.
  PERFORM notify_waitlist(v_booking.session_id);
  PERFORM mark_lineup_stale(v_booking.session_id);
END;
$$;

-- ─────────────────────────────────────────────────────────
-- admin_remove_booking(booking, return_credit)
-- BUILD-SPEC 8.3, 10.2, D22, D24
--
-- Staff only. Works at any time, before or after the cutoff, until the session
-- locks — D22 lets the coach add and remove people during the session itself,
-- and D39 keeps the attendance list editable for the whole 7 day review
-- window.
--
-- p_return_credit defaults to false inside the 3 hour window and true outside
-- it, per 8.3, "but the caller may override either way, because the coach is
-- allowed to make exceptions". The default is computed here rather than on the
-- screen so that the rule holds for any caller; the remove dialog passes an
-- explicit value, which is what the prompt in 15.2 is for.
--
-- A coach slot (D47) is removed from session_coaches as well as from bookings,
-- because the two were written together by admin_add_coach and the 10 JD daily
-- fee in 12.1 is counted from session_coaches, not from the booking.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_remove_booking(
  p_booking_id    uuid,
  p_return_credit boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_booking bookings;
  v_session session_instances;
  v_return  boolean;
  v_sub_id  uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- 5.6: settled is a reviewed booking, not a finished one, and 10.2 lists
  -- *Remove from session* among the review row actions. Both are removable.
  IF v_booking.status NOT IN ('confirmed', 'settled') THEN
    RAISE EXCEPTION 'already_cancelled';
  END IF;

  SELECT * INTO v_session FROM session_instances
    WHERE id = v_booking.session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- D39: after 7 days the session locks permanently. There is no unlock.
  IF v_session.status = 'locked' THEN RAISE EXCEPTION 'session_locked'; END IF;

  v_return := COALESCE(
    p_return_credit,
    now() <= v_session.starts_at - interval '3 hours');

  UPDATE bookings
  SET status       = 'cancelled_by_admin',
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE id = p_booking_id;

  IF v_return AND v_booking.payment_method = 'credit' AND v_booking.credit_txn_id IS NOT NULL THEN
    SELECT subscription_id INTO v_sub_id
    FROM credit_transactions WHERE id = v_booking.credit_txn_id;

    INSERT INTO credit_transactions
      (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES (v_sub_id, v_booking.player_id, 1, 'booking_refund', p_booking_id, auth.uid());
  END IF;

  IF v_booking.attendee_kind = 'coach' THEN
    DELETE FROM session_coaches
    WHERE session_id = v_booking.session_id AND coach_id = v_booking.player_id;

    -- D76: the fee is per night, so losing a coach from one session may or may
    -- not change what the night costs. recompute_night_costs works that out.
    PERFORM recompute_night_costs(v_session.venue_id, v_session.session_date);
  END IF;

  PERFORM notify_waitlist(v_booking.session_id);
  PERFORM mark_lineup_stale(v_booking.session_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_own_booking(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_remove_booking(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION cancel_own_booking(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_booking(uuid, boolean) TO authenticated;
