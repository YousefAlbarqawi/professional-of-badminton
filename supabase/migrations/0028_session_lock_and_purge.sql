-- ─────────────────────────────────────────────────────────
-- 0028  The 7 day lock, the proof purge, and their schedules
-- BUILD-SPEC D39, 8.6, 10.2's closing paragraph, A13
--
-- 8.6 lists five scheduled jobs. Migration 0019 created two of them and named
-- the three it was leaving behind. Two of those three are this phase's:
--
--   daily 03:10   lock sessions 7 days after they end          -> here
--   daily 04:00   purge payment proofs past purge_after        -> here, but
--                                                                 not in cron
--   daily 03:20   void expired subscriptions                   -> phase 6
--
-- pg_cron reads its schedules in the server's timezone, which on Supabase is
-- UTC, so each Amman time below is written as Amman minus three hours with no
-- DST arithmetic anywhere: Jordan has had none since 2022 (5.1).
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- lock_expired_sessions()
-- D39: "After 7 days the session locks permanently."
-- 5.5: "LOCKED is permanent. No edits, ever. Set by a daily job."
--
-- Everything that is not already locked or cancelled is eligible. A session
-- that never reached pending_review — because the 5 minute status job was down
-- for a week, say — is a week old either way, and leaving it editable because
-- of a missed cron run would be the wrong half of D39 to honour.
--
-- A cancelled session is left alone deliberately. 9.4 gives it a terminal
-- state of its own with its own record: its bookings are cancelled_by_admin,
-- its credits are already back, and there is no review to close.
--
-- This job makes the state readable. assert_session_unlocked (migration 0026)
-- is what makes it enforced, deadline first and status second, so a mutation
-- arriving in the hours between the deadline and this job is refused anyway.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION lock_expired_sessions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE session_instances
  SET status    = 'locked',
      locked_at = now()
  WHERE ends_at < now() - interval '7 days'
    AND status NOT IN ('locked', 'cancelled');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- purge_payment_proofs()
-- A13: "CliQ proofs are deleted after 365 days by a purge job. Long enough for
-- any dispute, short enough to limit what a breach would expose."
--
-- ── Why this is not the whole job ─────────────────────────
-- 8.6 asks for a daily pg_cron job that purges the proofs, "deleting storage
-- objects first". Storage will not allow it. `storage.protect_delete` raises
-- on any DELETE against storage.objects that does not come through the Storage
-- API — "This prevents accidental data loss from orphaned objects" — so no
-- function in Postgres can remove the bytes, whatever role it runs as.
--
-- The work is therefore split the same way `delete-account` already splits it
-- (8.7 and A1): this function does the part SQL can do, and the edge function
-- `purge-payment-proofs` calls it and hands the paths it returns to the
-- Storage API. There is exactly one deleter of rows, so a path can never be
-- retired without something being told to remove the object behind it.
--
-- The order is rows-then-objects rather than 8.6's objects-then-rows, for the
-- reason `delete-account` gives for the same inversion: once the row is gone
-- nothing in the app can name the object, so a failure half way through leaves
-- an unreachable file rather than a review screen pointing at a hole. The next
-- run sweeps it, because the second query below finds anything unclaimed.
--
-- ── The second query ──────────────────────────────────────
-- 10.1's ordering uploads the screenshot before the booking exists (migration
-- 0025), so a booking that fails at the last moment — the last spot went while
-- the photo was uploading — leaves an object with no proof row and no owner.
-- Anything unclaimed after a day is returned for removal too. A day is long
-- enough that a slow phone on a bad connection is never caught by it.
--
-- Revoked from everybody. The edge function holds the service role, which
-- bypasses grants, and nothing else has any business calling this.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION purge_payment_proofs()
RETURNS TABLE (storage_path text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH purged AS (
    DELETE FROM payment_proofs p
    WHERE p.purge_after <= amman_today()
    RETURNING p.storage_path
  )
  SELECT purged.storage_path FROM purged;

  RETURN QUERY
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'payment-proofs'
    AND o.created_at < now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM payment_proofs p WHERE p.storage_path = o.name);
END;
$$;

-- ─────────────────────────────────────────────────────────
-- The two phase-4 guards, moved onto the shared helper
--
-- Both already refused a locked session. Both now refuse an expired one as
-- well, so that "after the 7 day lock every mutation on that session is
-- refused" is a fact about the deadline rather than about when cron last ran.
-- The only other change is the balance entry in admin_remove_booking, noted
-- where it happens.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_session_addable(p_session_id uuid)
RETURNS session_instances
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
  v_taken   integer;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- D39, both halves. Takes the FOR UPDATE lock the count below depends on.
  v_session := assert_session_unlocked(p_session_id);

  -- A cancelled session has nobody to add anybody to.
  IF v_session.status = 'cancelled' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION 'session_full'; END IF;

  RETURN v_session;
END;
$$;

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

  -- D39, both halves.
  v_session := assert_session_unlocked(v_booking.session_id);

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

  -- 10.3: a balance entry is created only by record_payment, and it is a debt
  -- for a place in this session. Removing the booking removes the place, so it
  -- removes the debt — 9.3 is explicit that "the app never creates a balance
  -- entry from a cancellation", and leaving one behind would do exactly that
  -- by omission. A manual entry, which carries no booking_id, is untouched.
  DELETE FROM balance_entries WHERE booking_id = p_booking_id;

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

-- ─────────────────────────────────────────────────────────
-- The schedules. cron.schedule replaces a job of the same name, so a
-- `supabase db reset` re-running this migration leaves no duplicates.
-- ─────────────────────────────────────────────────────────

-- 8.6: daily 03:10 Amman = 00:10 UTC.
SELECT cron.schedule(
  'lock-expired-sessions',
  '10 0 * * *',
  $job$SELECT public.lock_expired_sessions();$job$
);

-- 8.6's fifth job, daily 04:00 Amman, is deliberately absent. It cannot live
-- in pg_cron: purge_payment_proofs() above explains why, and the schedule
-- belongs with the edge function that can actually delete the objects. Wiring
-- that daily invocation is a deployment step, recorded in OPEN-ITEMS.md.

REVOKE EXECUTE ON FUNCTION lock_expired_sessions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION purge_payment_proofs()  FROM PUBLIC, anon, authenticated;
