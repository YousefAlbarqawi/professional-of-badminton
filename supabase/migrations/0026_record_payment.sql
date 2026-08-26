-- ─────────────────────────────────────────────────────────
-- 0026  record_payment
-- BUILD-SPEC 8.5, 10.2, 10.3, D37, D38, D39, D40, D41
--
-- The one function that turns a night at the gym into money owed. 8.5 gives
-- five rules; the order they are written in below is the order that makes them
-- total, which is not quite the order 8.5 lists them in:
--
--   expected = 0                 -> waived, and never a balance entry
--   paid  = expected             -> paid
--   0 < paid < expected          -> partial, balance entry for the difference
--   paid  = 0, expected > 0      -> unpaid, balance entry for the whole amount
--
-- `expected = 0` has to be tested first or a waived row would fall into the
-- fourth rule and grow a balance entry of zero.
--
-- ── "Every call rewrites, never duplicates" ───────────────
-- 8.5's closing line, and phase 5's stated acceptance criterion: 6 JD expected,
-- record 4 JD, one entry of 2 JD. Record 5 JD, exactly one entry of 1 JD. It
-- is implemented as delete-then-insert rather than update-if-exists, because
-- the delete also has to cover the case where the remainder becomes nothing:
-- correcting an unpaid row to paid must leave no entry at all, and an UPDATE
-- cannot remove a row.
--
-- Only entries carrying this booking_id are touched. 10.3 lets the coach add
-- manual entries from the player profile; those have no booking_id and are
-- never rewritten by anything here.
--
-- ── Guests ────────────────────────────────────────────────
-- balance_entries.player_id is NOT NULL and a guest has no account (D44, D46),
-- so an underpaying guest gets his payment_status and no balance entry. There
-- is nowhere to put the debt and nobody to collect it from: the coach knows
-- who the guest was, the app deliberately does not. The same is true of the
-- coach slot, which expects nothing anyway (D47).
--
-- ── Changing the method ───────────────────────────────────
-- 10.2: "Change method. In case the player said CliQ and turned up with cash."
-- Cash, CliQ and free interchange freely. Credit does not, either way: moving
-- a booking off credit would strand the -1 transaction that paid for it, and
-- moving one onto credit would need a subscription chosen and a ledger row
-- written, which is 8.2's job and not this one. The coach's route for a credit
-- row is 10.2's *Remove from session*, which returns the credit, and then
-- re-add. Recorded as A47.
--
-- ── What this never does ──────────────────────────────────
-- D40: balances never block a booking. Nothing here writes to a session, a
-- subscription or a device. A11 and 10.3: a balance entry is created only by
-- this function and only from the review screen — never by a cancellation, a
-- no show, or an unpaid subscription.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- assert_session_unlocked(session) -> the session row
--
-- D39 has two halves and only one of them is a status. "The review window is 7
-- days from session end" is a fact about the clock; `status = 'locked'` is a
-- fact about whether the nightly job has run yet (8.6, daily 03:10). Between
-- the moment the window closes and the moment the job fires, a session is over
-- its deadline and still says `pending_review`, and for those few hours a
-- status check alone would let a mutation through.
--
-- Both halves are checked, so "after 7 days the session locks permanently" is
-- true of the deadline rather than of the cron schedule. The job still runs:
-- it is what makes the state visible to a reader and to the UI's read-only
-- banner. This is what makes it true to a writer.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_session_unlocked(p_session_id uuid)
RETURNS session_instances
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  IF v_session.status = 'locked' THEN RAISE EXCEPTION 'session_locked'; END IF;
  IF v_session.ends_at < now() - interval '7 days' THEN RAISE EXCEPTION 'session_locked'; END IF;

  RETURN v_session;
END;
$$;

-- 10.3 lets staff add and delete manual entries directly. created_by is who
-- did it, and taking it from the session rather than from the request body is
-- what stops one admin filing an entry under another's name.
ALTER TABLE balance_entries ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION record_payment(
  p_booking_id uuid,
  p_paid_fils  integer,
  p_method     payment_method DEFAULT NULL,
  p_note       text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_booking   bookings;
  v_session   session_instances;
  v_method    payment_method;
  v_expected  integer;
  v_paid      integer;
  v_status    payment_status;
  v_remainder integer;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  -- 5.6: confirmed and settled are both reviewable. A cancelled row is not a
  -- row anybody owes anything on (9.3: "The app never creates a balance entry
  -- from a cancellation").
  IF v_booking.status NOT IN ('confirmed', 'settled') THEN
    RAISE EXCEPTION 'already_cancelled';
  END IF;

  -- 8.5's only session rule, and D39's whole point: after 7 days the session
  -- locks permanently and there is no unlock.
  v_session := assert_session_unlocked(v_booking.session_id);

  v_method := COALESCE(p_method, v_booking.payment_method);
  IF (v_method = 'credit') <> (v_booking.payment_method = 'credit') THEN
    RAISE EXCEPTION 'credit_change_not_supported';
  END IF;

  -- A7: expected_fils is the price he booked at and a method change does not
  -- rewrite it. `free` is the one exception, because 10.1's table defines free
  -- as expecting nothing — choosing it *is* the act of waiving the amount.
  v_expected := CASE WHEN v_method = 'free' THEN 0 ELSE v_booking.expected_fils END;

  IF p_paid_fils IS NULL OR p_paid_fils < 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_paid_fils > v_expected THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  v_paid := CASE WHEN v_expected = 0 THEN 0 ELSE p_paid_fils END;

  -- 8.5's four rules, in the order that makes them total.
  IF v_expected = 0 THEN
    v_status := 'waived';
  ELSIF v_paid = v_expected THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'unpaid';
  END IF;

  UPDATE bookings
  SET payment_method = v_method,
      payment_status = v_status,
      expected_fils  = v_expected,
      paid_fils      = v_paid,
      note           = COALESCE(p_note, note)
  WHERE id = p_booking_id;

  -- The rewrite. Unconditional, so that every one of the four outcomes above
  -- leaves exactly the entry it should: one, or none.
  DELETE FROM balance_entries WHERE booking_id = p_booking_id;

  v_remainder := v_expected - v_paid;

  IF v_remainder > 0 AND v_booking.player_id IS NOT NULL THEN
    INSERT INTO balance_entries (player_id, booking_id, session_id, amount_fils, note, created_by)
    VALUES (v_booking.player_id, p_booking_id, v_booking.session_id, v_remainder,
            p_note, auth.uid());
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION assert_session_unlocked(uuid) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION record_payment(uuid, integer, payment_method, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION record_payment(uuid, integer, payment_method, text) TO authenticated;
