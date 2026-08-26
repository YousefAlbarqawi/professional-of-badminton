-- ─────────────────────────────────────────────────────────
-- 0015  Account deletion, the database half
-- BUILD-SPEC section 14.14 and assumption A1
--
-- The edge function owns the two steps that are not SQL — removing the
-- screenshot objects from storage and deleting the auth.users row. Everything
-- else happens here, in one transaction, so a half-deleted account is not a
-- reachable state.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION anonymise_player_account(p_player_id uuid)
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_proof_paths text[];
  r             record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- 1. Cancel every future booking, returning credits.
  --
  -- "Future" is measured against the session, not the booking: a session that
  -- has already started is history and keeps its row so the coach's review and
  -- his reports still reconcile. Credit is returned to the subscription it came
  -- from even when that subscription has since expired, per A2; the expiry job
  -- voids it there like any other.
  FOR r IN
    SELECT b.id, b.payment_method, t.subscription_id
    FROM bookings b
    JOIN session_instances s ON s.id = b.session_id
    LEFT JOIN credit_transactions t ON t.id = b.credit_txn_id
    WHERE b.player_id = p_player_id
      AND b.status = 'confirmed'
      AND s.starts_at > now()
    FOR UPDATE OF b
  LOOP
    UPDATE bookings
       SET status       = 'cancelled_by_player',
           cancelled_at = now(),
           cancelled_by = p_player_id
     WHERE id = r.id;

    IF r.payment_method = 'credit' AND r.subscription_id IS NOT NULL THEN
      INSERT INTO credit_transactions
        (subscription_id, player_id, delta, reason, booking_id, note)
      VALUES
        (r.subscription_id, p_player_id, 1, 'booking_refund', r.id, 'Account deleted');
    END IF;
  END LOOP;

  -- A place on a waiting list is a standing claim on a spot. Leaving it behind
  -- would have notify_waitlist pushing at an account that no longer exists.
  DELETE FROM waitlist_entries WHERE player_id = p_player_id;

  -- 2. Anonymise the profile.
  --
  -- Only the columns trg_guard_profile leaves alone. Role, visibility, tier and
  -- the custom rates are deliberately untouched: the guard reads auth.uid(),
  -- which a service-role connection does not have, so it would refuse them —
  -- and none of them identifies anybody.
  UPDATE profiles
     SET first_name = 'Deleted',
         last_name  = 'player',
         phone      = NULL,
         is_active  = false,
         deleted_at = COALESCE(deleted_at, now())
   WHERE id = p_player_id;

  -- 3. Devices stop receiving anything, and the screenshots go.
  DELETE FROM device_tokens WHERE player_id = p_player_id;

  SELECT COALESCE(array_agg(pp.storage_path), ARRAY[]::text[])
    INTO v_proof_paths
    FROM payment_proofs pp
    JOIN bookings b ON b.id = pp.booking_id
   WHERE b.player_id = p_player_id;

  DELETE FROM payment_proofs pp
   USING bookings b
   WHERE b.id = pp.booking_id
     AND b.player_id = p_player_id;

  -- Past bookings, balance entries and credit history stay exactly where they
  -- are, now attached to an anonymous profile. A1: the coach's historical
  -- reports must not develop holes, and a balance is not forgiven by deletion.
  RETURN v_proof_paths;
END;
$$;

-- Only the delete-account edge function calls this, with the service role. A
-- player reaches it through that function, which proves who he is from his own
-- JWT; he can never call it for somebody else's id.
REVOKE EXECUTE ON FUNCTION anonymise_player_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION anonymise_player_account(uuid) TO service_role;
