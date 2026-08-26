-- ─────────────────────────────────────────────────────────
-- 0025  The CliQ booking path
-- BUILD-SPEC 10.1, D33, D34, D35, D36
--
-- 10.1 states the rule this whole migration exists to make true:
--
--   "If the upload fails, no booking is created. A booking must never exist
--    with payment_method = 'cliq' and no proof row."
--
-- ── The ordering problem ──────────────────────────────────
-- 10.1 step 5 puts the screenshot at payment-proofs/{user_id}/{booking_id}.jpg
-- and step 6 says create_booking "is called only after the upload succeeds".
-- Those two cannot both hold if the booking id is minted by the insert: the
-- path needs an id that does not exist yet.
--
-- The id is therefore reserved before the upload rather than after it. Three
-- functions, in the order the client calls them:
--
--   prepare_cliq_booking(session)   runs every 9.1 rule and hands back a uuid.
--                                   Writes nothing. Its job is to refuse a
--                                   doomed booking *before* the player spends
--                                   a photo upload on it, and to name the file.
--   (the client uploads)            payment-proofs/{uid}/{that uuid}.jpg
--   create_cliq_booking(...)        re-runs every rule under the session lock
--                                   and writes the booking and its proof row
--                                   in one transaction.
--
-- Reserving is not holding. Nothing is locked between the two calls, so the
-- last spot can still go while the photo uploads; create_cliq_booking then
-- raises session_full exactly as create_booking would, and 14.8's *"Sorry, the
-- last spot went while you were booking"* covers it. What is left behind is an
-- object with no proof row, which purge_payment_proofs (migration 0028) sweeps.
--
-- ── Why a uuid from the server and not from the phone ─────
-- Hermes has no global crypto, so a client-side uuid means another native
-- dependency for one string. gen_random_uuid() is already here.
--
-- ── The trigger is the actual guarantee ───────────────────
-- Everything above is a convention two functions happen to follow. The
-- deferred constraint trigger at the foot of this file is what makes 10.1's
-- rule true of the database rather than true of the code that usually writes
-- to it: at COMMIT, a booking inserted with payment_method = 'cliq' and no
-- payment_proofs row aborts the transaction, whoever wrote it and however.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- assert_can_book(session) -> the locked session row
--
-- Section 9.1 rules 1 to 8, lifted out of create_booking unchanged so that the
-- CliQ path cannot drift away from the cash path. Rule 9 — a usable
-- subscription — stays with the callers, because it is the only rule that
-- depends on which method was chosen.
--
-- The FOR UPDATE is the whole of 5.4. It serialises every caller on the
-- session row before anybody counts, so the second transaction reads a count
-- that already includes the first one's insert. Do not remove it, and do not
-- move the count above it.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_can_book(p_session_id uuid)
RETURNS session_instances
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
  v_player  profiles;
  v_taken   integer;
BEGIN
  -- 9.1 rule 1
  SELECT * INTO v_session FROM session_instances
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- 9.1 rule 2
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  -- 9.1 rule 3. D20: a rolling 5 days from today, inclusive of today. A31:
  -- amman_today() rather than current_date, which is UTC's today.
  IF v_session.session_date > amman_today() + 4 THEN
    RAISE EXCEPTION 'outside_booking_window';
  END IF;

  -- 9.1 rule 4. D21, and 5.1's rule that the server is the authority on time.
  IF now() > v_session.starts_at - interval '1 hour' THEN
    RAISE EXCEPTION 'booking_window_closed';
  END IF;

  -- 9.1 rule 5. D12 and A10.
  IF NOT EXISTS (SELECT 1 FROM auth.users
                 WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  -- 9.1 rule 6. A1: a deleted account is anonymised, so the row survives and
  -- deleted_at is what says what it is.
  SELECT * INTO v_player FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'account_deleted'; END IF;
  IF v_player.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'account_deleted'; END IF;

  -- 9.1 rule 7, before rule 8 deliberately: rebooking a full session he is
  -- already in should tell him he is already in it. A38.
  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_session_id
               AND player_id = auth.uid() AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  -- 9.1 rule 8. D30, and 5.4: cancelled bookings do not count; guest, coach
  -- and assistant coach bookings do.
  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION 'session_full'; END IF;

  RETURN v_session;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- create_booking, rewritten onto the shared preamble
--
-- Behaviour is unchanged for cash and credit. What changed is the CliQ branch:
-- phase 4 refused it outright (A37) because the proof did not exist yet. It is
-- still refused *here* — a CliQ booking now has somewhere else to go, and this
-- entry point cannot attach a proof, so letting it through would produce
-- exactly the state 10.1 forbids and the trigger below would abort at commit
-- with a message nobody could act on. `free` stays staff-only, permanently.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_booking(
  p_session_id     uuid,
  p_payment_method payment_method
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session    session_instances;
  v_player     profiles;
  v_expected   integer;
  v_sub_id     uuid;
  v_booking_id uuid;
  v_txn_id     uuid;
BEGIN
  -- A37. `free` is how a free guest and a coach slot are recorded (D45, D47);
  -- a hand-crafted call asking for it would be a player booking for nothing.
  IF p_payment_method = 'free' THEN
    RAISE EXCEPTION 'payment_method_not_allowed';
  END IF;

  -- 10.1: CliQ goes through create_cliq_booking, which carries the proof.
  IF p_payment_method = 'cliq' THEN
    RAISE EXCEPTION 'cliq_requires_proof';
  END IF;

  v_session := assert_can_book(p_session_id);
  SELECT * INTO v_player FROM profiles WHERE id = auth.uid();

  v_expected := resolve_price(v_player.id, v_session.session_type, v_session.price_fils);

  -- 9.1 rule 9
  IF p_payment_method = 'credit' THEN
    v_sub_id := pick_subscription(auth.uid());
    IF v_sub_id IS NULL THEN RAISE EXCEPTION 'no_credits_available'; END IF;
  END IF;

  -- 10.1's table. A7: expected_fils is a snapshot, and a later price change
  -- never rewrites it.
  INSERT INTO bookings (session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, source, created_by)
  VALUES (p_session_id, 'player', auth.uid(), v_player.tier,
          p_payment_method,
          (CASE WHEN p_payment_method = 'credit' THEN 'paid' ELSE 'unpaid' END)::payment_status,
          CASE WHEN p_payment_method = 'credit' THEN 0 ELSE v_expected END,
          'self', auth.uid())
  RETURNING id INTO v_booking_id;

  -- D56: an append only ledger with a reason on every movement.
  IF p_payment_method = 'credit' THEN
    INSERT INTO credit_transactions (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES (v_sub_id, auth.uid(), -1, 'booking', v_booking_id, auth.uid())
    RETURNING id INTO v_txn_id;
    UPDATE bookings SET credit_txn_id = v_txn_id WHERE id = v_booking_id;
  END IF;

  DELETE FROM waitlist_entries WHERE session_id = p_session_id AND player_id = auth.uid();

  PERFORM mark_lineup_stale(p_session_id);
  RETURN v_booking_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- prepare_cliq_booking(session) -> the id the file will be named after
--
-- 10.1 steps 1 to 4 happen on the phone. This sits between step 4 and step 5,
-- and it writes nothing at all: a player who abandons the sheet here has left
-- no trace, which is the difference between reserving a name and reserving a
-- spot.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION prepare_cliq_booking(p_session_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM assert_can_book(p_session_id);
  RETURN gen_random_uuid();
END;
$$;

-- ─────────────────────────────────────────────────────────
-- create_cliq_booking(...)  10.1 steps 6 and 7
--
-- One transaction, two rows. There is no window in which the first exists
-- without the second, which is what 10.1's rule asks for.
--
-- D34: attaching any image confirms the booking instantly. No approval step,
-- no pending state, for every player, new or old. D36: nothing reads the
-- image. The proof is a record for the coach's review screen (10.2), not a
-- gate.
--
-- The path is checked rather than trusted. Storage RLS already stops a player
-- writing outside his own folder (migration 0013), but nothing stops him
-- *pointing* a proof row at an object of somebody else's, so the path is
-- required to be exactly the one 10.1 specifies for this caller and this
-- booking.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_cliq_booking(
  p_session_id      uuid,
  p_booking_id      uuid,
  p_storage_path    text,
  p_file_size_bytes integer,
  p_mime_type       text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session  session_instances;
  v_player   profiles;
  v_expected integer;
BEGIN
  IF p_booking_id IS NULL THEN RAISE EXCEPTION 'proof_required'; END IF;
  IF p_storage_path IS DISTINCT FROM auth.uid()::text || '/' || p_booking_id::text || '.jpg' THEN
    RAISE EXCEPTION 'proof_path_mismatch';
  END IF;

  v_session := assert_can_book(p_session_id);
  SELECT * INTO v_player FROM profiles WHERE id = auth.uid();

  v_expected := resolve_price(v_player.id, v_session.session_type, v_session.price_fils);

  -- 10.1's table: cliq is confirmed and unpaid. Unpaid is not pending — the
  -- spot is his (D34). It says only that the coach has not yet ticked the row
  -- in review, which is 10.2's job and nobody else's.
  INSERT INTO bookings (id, session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, source, created_by)
  VALUES (p_booking_id, p_session_id, 'player', auth.uid(), v_player.tier,
          'cliq', 'unpaid', v_expected, 'self', auth.uid());

  INSERT INTO payment_proofs (booking_id, storage_path, file_size_bytes, mime_type)
  VALUES (p_booking_id, p_storage_path, p_file_size_bytes, p_mime_type);

  DELETE FROM waitlist_entries WHERE session_id = p_session_id AND player_id = auth.uid();

  PERFORM mark_lineup_stale(p_session_id);
  RETURN p_booking_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- The invariant, enforced by the database
--
-- DEFERRABLE INITIALLY DEFERRED so that create_cliq_booking may insert the
-- booking before the proof; the check runs once, at COMMIT, when both rows
-- either exist or do not.
--
-- INSERT only, deliberately. 10.2 gives the coach a *Change method* action
-- "in case the player said CliQ and turned up with cash" — and the reverse
-- happens too: a player pays by CliQ in person and the coach records it during
-- review, with no screenshot anywhere. That is a staff act on a booking that
-- already exists, and 10.1's rule is about what booking *creation* may leave
-- behind. Firing on UPDATE as well would forbid a legitimate correction to
-- protect against nothing.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_cliq_booking_has_proof()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.payment_method = 'cliq'
     AND NOT EXISTS (SELECT 1 FROM payment_proofs WHERE booking_id = NEW.id) THEN
    RAISE EXCEPTION 'cliq_requires_proof';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cliq_needs_proof ON bookings;
CREATE CONSTRAINT TRIGGER trg_cliq_needs_proof
  AFTER INSERT ON bookings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_cliq_booking_has_proof();

REVOKE EXECUTE ON FUNCTION assert_can_book(uuid)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION prepare_cliq_booking(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_cliq_booking(uuid, uuid, text, integer, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION prepare_cliq_booking(uuid)                          TO authenticated;
GRANT EXECUTE ON FUNCTION create_cliq_booking(uuid, uuid, text, integer, text) TO authenticated;
