-- ─────────────────────────────────────────────────────────
-- 0022  The waiting list
-- BUILD-SPEC 8.4 (notify_waitlist), 9.5 (the rules), D27, D28
--
-- D27 is the whole design: free, no cap, no queue order, no auto promotion.
-- Everyone is notified at once and the first to press reserve wins. There is
-- no hold, no reservation and no position, so there is nothing here that
-- promotes anybody — claiming a spot is an ordinary create_booking call, and
-- the losers get session_full, which the UI presents gently (9.5).
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- join_waitlist(session)
-- BUILD-SPEC 9.5
--
-- The row already carries left_at, so leaving is a stamp rather than a delete
-- and rejoining is the same row coming back. UNIQUE (session_id, player_id)
-- makes that the only shape that works, and it keeps the history of who was
-- waiting when a spot opened.
--
-- The 1 hour cutoff applies here too. D28 makes a spot opening inside the last
-- hour invisible to the list, so joining it then would be selling a place in a
-- queue that can no longer be called. 14.7's action table agrees: past the
-- cutoff and not booked, the player sees *Booking closed*, not the list.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION join_waitlist(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status <> 'scheduled' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  IF v_session.session_date > amman_today() + 4 THEN
    RAISE EXCEPTION 'outside_booking_window';
  END IF;

  IF now() > v_session.starts_at - interval '1 hour' THEN
    RAISE EXCEPTION 'booking_window_closed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users
                 WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'email_not_confirmed';
  END IF;

  -- 9.5: "Joining a waitlist for a session he is already booked into is
  -- rejected with already_booked."
  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_session_id
               AND player_id = auth.uid() AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  INSERT INTO waitlist_entries (session_id, player_id)
  VALUES (p_session_id, auth.uid())
  ON CONFLICT (session_id, player_id) DO UPDATE
    SET left_at = NULL, joined_at = now(), notified_at = NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- leave_waitlist(session)
--
-- Silent when he is not on the list. Leaving a list you are not on is not an
-- error worth a dialog, and 14.7 can show the button off a stale read.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION leave_waitlist(p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE waitlist_entries
  SET left_at = now()
  WHERE session_id = p_session_id
    AND player_id = auth.uid()
    AND left_at IS NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- notify_waitlist(session)
-- BUILD-SPEC 8.4, and D28 is the point of it
--
--   1. If now() > starts_at - 1 hour, return immediately and do nothing.
--   2. If occupancy is still at capacity, return.
--   3. Select every waitlist entry with left_at IS NULL.
--   4. Send.
--   5. Stamp notified_at.
--
-- Step 1 is decision D28, stated twice in the specification and once more in
-- the phase brief: a spot freed 40 minutes before start notifies nobody. Only
-- the coach can fill it. It is the first thing this function does and it does
-- it before reading anything else, so there is no path where a notification
-- escapes late.
--
-- Step 4 is phase 8. Section 6 defines no push job table and section 20 puts
-- token registration, the send-push edge function and dead token pruning in
-- phase 8, so this stamps who should have been told and phase 8 sends to
-- exactly that set. What this function is responsible for now — and what the
-- phase 4 acceptance criteria test — is the silence in step 1.
--
-- Returns the number of entries stamped so a test can tell "nobody was on the
-- list" from "the list was deliberately not called".
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_waitlist(p_session_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session  session_instances;
  v_taken    integer;
  v_notified integer;
BEGIN
  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Step 1. D28.
  IF now() > v_session.starts_at - interval '1 hour' THEN RETURN 0; END IF;

  -- A cancelled session has no spot to offer either.
  IF v_session.status <> 'scheduled' THEN RETURN 0; END IF;

  -- Step 2
  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RETURN 0; END IF;

  -- Steps 3 and 5. There is no ordering here on purpose: D27 says everyone is
  -- notified at once and the first to press reserve wins.
  UPDATE waitlist_entries
  SET notified_at = now()
  WHERE session_id = p_session_id
    AND left_at IS NULL;
  GET DIAGNOSTICS v_notified = ROW_COUNT;

  RETURN v_notified;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- close_started_waitlists()
-- BUILD-SPEC 9.5: "Waitlist entries are cleaned up when the session starts."
--
-- Its own job rather than a line inside advance_session_states, because that
-- function is 5.5's and answers for session status alone. Both run on the same
-- 5 minute schedule; this one keys on starts_at rather than on the status it
-- set, so a session already advanced by an earlier run is still swept.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_started_waitlists() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_closed integer;
BEGIN
  UPDATE waitlist_entries w
  SET left_at = now()
  FROM session_instances si
  WHERE si.id = w.session_id
    AND w.left_at IS NULL
    AND si.starts_at <= now();
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN v_closed;
END;
$$;

SELECT cron.schedule(
  'close-started-waitlists',
  '*/5 * * * *',
  $job$SELECT public.close_started_waitlists();$job$
);

-- notify_waitlist is never called by a client. It is called by
-- cancel_own_booking and admin_remove_booking, both of which are security
-- definer, and a player who could call it himself could stamp notified_at on
-- rows belonging to other people.
REVOKE EXECUTE ON FUNCTION notify_waitlist(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION close_started_waitlists()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION join_waitlist(uuid)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION leave_waitlist(uuid)         FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION notify_waitlist(uuid)     TO service_role;
GRANT EXECUTE ON FUNCTION close_started_waitlists() TO service_role;
GRANT EXECUTE ON FUNCTION join_waitlist(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION leave_waitlist(uuid)      TO authenticated;
