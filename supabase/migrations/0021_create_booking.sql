-- ─────────────────────────────────────────────────────────
-- 0021  create_booking
-- BUILD-SPEC 8.2 (the code), 9.1 (the rules), 10.1 (what each method does)
--
-- This is the critical path. Two players tapping reserve on the last spot at
-- the same moment must produce exactly one booking and one clear error (5.4),
-- and the SELECT ... FOR UPDATE below is the only reason that holds. It
-- serialises every caller on the session row before anybody counts, so the
-- second transaction reads a count that already includes the first one's
-- insert. Do not remove it, and do not move the count above it.
--
-- ── Why the checks are in 9.1's order and not 8.2's ───────
-- Section 8.2 gives working code; section 9.1 gives a table and says
-- "evaluate in this order and return the first failure". They disagree twice:
-- 8.2 checks the 1 hour cutoff before the 5 day window and the deleted account
-- before the email, 9.1 the other way round. Appendix B rule 1 prefers the
-- decisions register, which is silent, so rule 2 prefers prose — and 9.1 is
-- the section that states an order as a requirement rather than incidentally.
-- 9.1 wins. The pairs that actually differ in outcome are few, but
-- `already_booked` before `session_full` is one a player will hit: rebooking a
-- full session he is already in should tell him he is already in it.
--
-- ── Why current_date does not appear ──────────────────────
-- A31. current_date reads the database session's timezone, which on Supabase
-- is UTC, so for the three hours between 00:00 and 03:00 Amman it returns
-- yesterday. 8.2 writes the window guard as `current_date + interval '4 days'`;
-- amman_today() is the same guard against the right day.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_booking(
  p_session_id     uuid,
  p_payment_method payment_method
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session    session_instances;
  v_taken      integer;
  v_player     profiles;
  v_expected   integer;
  v_sub_id     uuid;
  v_booking_id uuid;
  v_txn_id     uuid;
BEGIN
  -- A player picks one of the three methods in 10.1's table. `free` is staff
  -- only — it is how a free guest and a coach slot are recorded (D45, D47) —
  -- so a hand-crafted call asking for it is refused rather than honoured.
  -- A37.
  IF p_payment_method = 'free' THEN
    RAISE EXCEPTION 'payment_method_not_allowed';
  END IF;

  -- 10.1: "A booking must never exist with payment_method = 'cliq' and no
  -- proof row." The upload, the storage policy and the proof row are phase 5,
  -- so until they exist this path can only produce the state 10.1 forbids. The
  -- sheet disables the option; this refuses it. A37.
  IF p_payment_method = 'cliq' THEN
    RAISE EXCEPTION 'cliq_unavailable';
  END IF;

  -- 9.1 rule 1. FOR UPDATE: see the note above.
  SELECT * INTO v_session FROM session_instances
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- 9.1 rule 2
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  -- 9.1 rule 3. D20: a rolling 5 days from today, inclusive of today.
  IF v_session.session_date > amman_today() + 4 THEN
    RAISE EXCEPTION 'outside_booking_window';
  END IF;

  -- 9.1 rule 4. D21: reservations close 1 hour before start. 5.1: the server
  -- is the authority on time, so a phone with a wrong clock cannot get past
  -- this by lying about now.
  IF now() > v_session.starts_at - interval '1 hour' THEN
    RAISE EXCEPTION 'booking_window_closed';
  END IF;

  -- 9.1 rule 5. D12 and A10: confirmation gates booking, nothing else.
  IF NOT EXISTS (SELECT 1 FROM auth.users
                 WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  -- 9.1 rule 6. A1: a deleted account is anonymised rather than removed, so
  -- its profile row survives and this is the flag that says what it is.
  SELECT * INTO v_player FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'account_deleted'; END IF;
  IF v_player.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'account_deleted'; END IF;

  -- 9.1 rule 7
  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_session_id
               AND player_id = auth.uid() AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  -- 9.1 rule 8. D30: capacity is hard, no overselling under any circumstance.
  -- 5.4: cancelled bookings do not count; guest, coach and assistant coach
  -- bookings do.
  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION 'session_full'; END IF;

  v_expected := resolve_price(v_player.id, v_session.session_type, v_session.price_fils);

  -- 9.1 rule 9
  IF p_payment_method = 'credit' THEN
    v_sub_id := pick_subscription(auth.uid());
    IF v_sub_id IS NULL THEN RAISE EXCEPTION 'no_credits_available'; END IF;
  END IF;

  -- 10.1's table. A credit booking expects nothing and is paid on the spot;
  -- cash expects the resolved price and is unpaid until the coach says
  -- otherwise in review. A7: expected_fils is a snapshot and a later price
  -- change never rewrites it.
  INSERT INTO bookings (session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, source, created_by)
  VALUES (p_session_id, 'player', auth.uid(), v_player.tier,
          p_payment_method,
          (CASE WHEN p_payment_method = 'credit' THEN 'paid' ELSE 'unpaid' END)::payment_status,
          CASE WHEN p_payment_method = 'credit' THEN 0 ELSE v_expected END,
          'self', auth.uid())
  RETURNING id INTO v_booking_id;

  -- D56: credits are an append only ledger with a reason on every movement.
  IF p_payment_method = 'credit' THEN
    INSERT INTO credit_transactions (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES (v_sub_id, auth.uid(), -1, 'booking', v_booking_id, auth.uid())
    RETURNING id INTO v_txn_id;
    UPDATE bookings SET credit_txn_id = v_txn_id WHERE id = v_booking_id;
  END IF;

  -- He has the spot, so he is not waiting for one. 8.2.
  DELETE FROM waitlist_entries WHERE session_id = p_session_id AND player_id = auth.uid();

  PERFORM mark_lineup_stale(p_session_id);
  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_booking(uuid, payment_method) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION create_booking(uuid, payment_method) TO authenticated;
