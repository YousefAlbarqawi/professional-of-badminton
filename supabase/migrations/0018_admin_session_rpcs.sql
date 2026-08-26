-- ─────────────────────────────────────────────────────────
-- 0018  The three staff session mutations
-- BUILD-SPEC 15.4 (edit a dated instance), 15.5 and 9.4 (cancel),
-- 15.6 (create a one-off)
--
-- These are the only writes to session_instances the app makes. Every one is
-- security definer, gated on is_staff() rather than on RLS, so that the guard
-- and its error code live in one place instead of being spread across a policy
-- and a screen.
--
-- D16: an admin can do everything the coach can do except view reports, so
-- is_staff() and not is_coach() is the right gate on all three.
-- ─────────────────────────────────────────────────────────

-- D5: two session types only, and the duration decides which.
CREATE OR REPLACE FUNCTION session_type_for_duration(p_minutes integer)
RETURNS session_type LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_minutes = 150 THEN 'extended' ELSE 'standard' END::session_type;
$$;

-- D5 again: 4 rotations on a standard session, 6 on an extended one. A15 lets
-- the coach add a seventh by hand from the court board, which is why this is
-- only ever used as a default and never to overwrite a session whose duration
-- has not changed.
CREATE OR REPLACE FUNCTION default_rotation_count(p_minutes integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_minutes = 150 THEN 6 ELSE 4 END;
$$;

-- ─────────────────────────────────────────────────────────
-- update_session_instance
-- BUILD-SPEC 15.4
--
-- The capacity guard is the point of this function. A3: the app never
-- auto-removes players when the court count drops. It refuses the save and
-- tells the coach to remove people first, because deciding who loses a spot is
-- his call, not the algorithm's.
--
-- A7: changing the price never rewrites an existing booking. Every booking
-- snapshotted expected_fils when it was made, and nothing here touches the
-- bookings table at all.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_session_instance(
  p_session_id       uuid,
  p_start_time       time,
  p_duration_minutes integer,
  p_price_fils       integer,
  p_court_count      integer,
  p_notes            text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
  v_booked  integer;
  v_starts  timestamptz;
  v_ends    timestamptz;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF p_duration_minutes NOT IN (90, 150) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF p_court_count IS NULL OR p_court_count < 1 OR p_court_count > 20 THEN
    RAISE EXCEPTION 'invalid_court_count';
  END IF;
  IF p_price_fils IS NULL OR p_price_fils < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;

  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status = 'locked'    THEN RAISE EXCEPTION 'session_locked';   END IF;
  IF v_session.status = 'cancelled' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  SELECT count(*)::integer INTO v_booked
  FROM bookings
  WHERE session_id = p_session_id AND status = 'confirmed';

  IF p_court_count * 4 < v_booked THEN
    RAISE EXCEPTION 'capacity_below_bookings';
  END IF;

  v_starts := (v_session.session_date + p_start_time) AT TIME ZONE 'Asia/Amman';
  v_ends   := v_starts + make_interval(mins => p_duration_minutes);

  UPDATE session_instances
  SET starts_at    = v_starts,
      ends_at      = v_ends,
      price_fils   = p_price_fils,
      court_count  = p_court_count,
      notes        = p_notes,
      -- The type follows the duration, and the rotation count follows the type
      -- — but only when the duration actually changed, so a coach who added a
      -- seventh rotation by hand and then nudged the start time keeps it.
      session_type = CASE
        WHEN p_duration_minutes
             = (EXTRACT(EPOCH FROM (v_session.ends_at - v_session.starts_at)) / 60)::integer
        THEN v_session.session_type
        ELSE session_type_for_duration(p_duration_minutes)
      END,
      rotation_count = CASE
        WHEN p_duration_minutes
             = (EXTRACT(EPOCH FROM (v_session.ends_at - v_session.starts_at)) / 60)::integer
        THEN v_session.rotation_count
        ELSE default_rotation_count(p_duration_minutes)
      END
  WHERE id = p_session_id;

  -- The water cost follows the session type, so a duration change moves it.
  PERFORM recompute_night_costs(v_session.venue_id, v_session.session_date);
EXCEPTION
  WHEN unique_violation THEN
    -- UNIQUE (venue_id, starts_at): he has moved this session onto the start
    -- time of another one at the same venue on the same night.
    RAISE EXCEPTION 'session_time_taken';
END;
$$;

-- ─────────────────────────────────────────────────────────
-- create_one_off_session
-- BUILD-SPEC 15.6. No recurrence option; one-off means one-off.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_one_off_session(
  p_venue_id         uuid,
  p_session_date     date,
  p_start_time       time,
  p_duration_minutes integer,
  p_price_fils       integer,
  p_court_count      integer,
  p_rotation_count   integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_starts timestamptz;
  v_ends   timestamptz;
  v_id     uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF p_duration_minutes NOT IN (90, 150) THEN RAISE EXCEPTION 'invalid_duration'; END IF;
  IF p_court_count IS NULL OR p_court_count < 1 OR p_court_count > 20 THEN
    RAISE EXCEPTION 'invalid_court_count';
  END IF;
  IF p_price_fils IS NULL OR p_price_fils < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;
  IF NOT EXISTS (SELECT 1 FROM venues WHERE id = p_venue_id AND is_active) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  v_starts := (p_session_date + p_start_time) AT TIME ZONE 'Asia/Amman';
  v_ends   := v_starts + make_interval(mins => p_duration_minutes);

  -- template_id stays null. That is what makes it ad hoc, and it is also what
  -- keeps generate_sessions from ever treating it as a template's slot.
  INSERT INTO session_instances (
    template_id, venue_id, session_date, starts_at, ends_at,
    session_type, price_fils, court_count, rotation_count
  ) VALUES (
    NULL, p_venue_id, p_session_date, v_starts, v_ends,
    session_type_for_duration(p_duration_minutes),
    p_price_fils, p_court_count,
    COALESCE(p_rotation_count, default_rotation_count(p_duration_minutes))
  )
  RETURNING id INTO v_id;

  -- 12.1: the night's court rent now divides one more way.
  PERFORM recompute_night_costs(p_venue_id, p_session_date);

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'session_time_taken';
END;
$$;

-- ─────────────────────────────────────────────────────────
-- cancel_session
-- BUILD-SPEC 9.4, step by step.
--
-- Step 5 of 9.4 is the one worth reading twice: **no push notification is
-- sent**. That is D31, not an oversight. The coach is offered a prefilled
-- announcement composer afterwards instead, which is A6, and that happens on
-- the client — nothing here notifies anybody.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_session(p_session_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
  v_booking record;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF v_session.status = 'locked' THEN RAISE EXCEPTION 'session_locked'; END IF;
  -- 5.5: only a scheduled or in-progress session can be cancelled. Once it has
  -- ended it goes to review, and review is where a session that did not happen
  -- gets sorted out.
  IF v_session.status NOT IN ('scheduled', 'in_progress') THEN
    RAISE EXCEPTION 'session_not_open';
  END IF;

  -- Step 1
  UPDATE session_instances
  SET status            = 'cancelled',
      cancelled_at      = now(),
      cancelled_by      = auth.uid(),
      cancellation_note = p_note
  WHERE id = p_session_id;

  -- Step 3, before step 2 so the bookings still read as confirmed here.
  -- Every credit booking gets +1 back regardless of how close to start time it
  -- is, and it goes back to the subscription it came from even if that has
  -- since expired (A2). The expiry job voids it later like any other credit.
  FOR v_booking IN
    SELECT b.id, b.player_id, ct.subscription_id
    FROM bookings b
    JOIN credit_transactions ct ON ct.id = b.credit_txn_id
    WHERE b.session_id = p_session_id
      AND b.status = 'confirmed'
      AND b.payment_method = 'credit'
  LOOP
    INSERT INTO credit_transactions
      (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES
      (v_booking.subscription_id, v_booking.player_id, 1, 'session_cancelled',
       v_booking.id, auth.uid());
  END LOOP;

  -- Step 2. Cancelled sessions keep their bookings for the record, all marked
  -- cancelled_by_admin (5.5).
  UPDATE bookings
  SET status       = 'cancelled_by_admin',
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE session_id = p_session_id
    AND status = 'confirmed';

  -- Step 4 is a no-op by design: cash and CliQ bookings produce no financial
  -- record. D32 — the coach settles CliQ outside the app.

  -- Step 7. This is what doubles the surviving session's court cost share when
  -- one of two sessions on a night is cancelled.
  PERFORM recompute_night_costs(v_session.venue_id, v_session.session_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION session_type_for_duration(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION default_rotation_count(integer)    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_session_instance(uuid, time, integer, integer, integer, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_one_off_session(uuid, date, time, integer, integer, integer, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_session(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION update_session_instance(uuid, time, integer, integer, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION create_one_off_session(uuid, date, time, integer, integer, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_session(uuid, text) TO authenticated;
