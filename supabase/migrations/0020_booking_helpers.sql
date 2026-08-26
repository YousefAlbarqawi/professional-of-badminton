-- ─────────────────────────────────────────────────────────
-- 0020  The four helpers create_booking leans on
-- BUILD-SPEC 8.2 (resolve_price, pick_subscription, mark_lineup_stale),
-- 11.4 (nearest expiry first), 13.8 (regeneration)
--
-- Each one is small, each one is called from more than one place, and each one
-- is the sort of rule a screen must never be trusted to compute for itself.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- resolve_price(player, type, session price)
-- BUILD-SPEC 8.2, D41, A5
--
--   if standard and custom_rate_standard_fils is not null -> that
--   if extended and custom_rate_extended_fils is not null -> that
--   otherwise the session price
--
-- A5: the two overrides are independent. A player on 4 JD for standard
-- sessions is not automatically on 4 JD for the 8 JD Tuesday. Zero is a valid
-- override and is expected (D41), which is why every test here is against
-- IS NOT NULL rather than against truthiness.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION resolve_price(
  p_player_id     uuid,
  p_session_type  session_type,
  p_session_price integer
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    CASE WHEN p_session_type = 'standard'
         THEN p.custom_rate_standard_fils
         ELSE p.custom_rate_extended_fils END,
    p_session_price)
  FROM profiles p
  WHERE p.id = p_player_id;
$$;

-- ─────────────────────────────────────────────────────────
-- subscription_remaining(subscription)
-- BUILD-SPEC 6.2: "The credit balance of a subscription is always
-- SUM(delta) over credit_transactions. There is no cached counter column."
-- D56 says the same thing as a decision. Never add one.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION subscription_remaining(p_subscription_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT COALESCE(SUM(t.delta), 0)::integer
  FROM credit_transactions t
  WHERE t.subscription_id = p_subscription_id;
$$;

-- ─────────────────────────────────────────────────────────
-- pick_subscription(player)
-- BUILD-SPEC 8.2 and 11.4
--
--   1. is_voided = false, expires_on >= today, remaining > 0
--   2. expires_on ascending, so the credit closest to dying is used first
--   3. tie break on created_at ascending
--   4. null if none
--
-- A31: today is amman_today(), not current_date. current_date reads the
-- database session's timezone, which on Supabase is UTC, so between midnight
-- and 03:00 Amman it returns yesterday — and a subscription expiring today
-- would be treated as still usable for three hours after it died.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pick_subscription(p_player_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT s.id
  FROM player_subscriptions s
  WHERE s.player_id = p_player_id
    AND s.is_voided = false
    AND s.expires_on >= amman_today()
    AND subscription_remaining(s.id) > 0
  ORDER BY s.expires_on ASC, s.created_at ASC
  LIMIT 1;
$$;

-- ─────────────────────────────────────────────────────────
-- mark_lineup_stale(session)
-- BUILD-SPEC 13.8
--
-- "While has_manual_lineup is false: any booking change (create, cancel, admin
-- add, admin remove) discards and regenerates the whole lineup automatically.
-- While true: booking changes do not touch the lineup. Instead the court board
-- shows a banner."
--
-- Discarding is this function's half. Regenerating is the engine's, and the
-- engine is a pure TypeScript module that runs on the coach's phone (13.1),
-- so it cannot be called from here. The court board loads, finds no rotations,
-- and generates — which is exactly what "discards and regenerates" describes,
-- one step later.
--
-- Once the coach has made a manual edit the rotations are his work and this
-- leaves them alone. The banner counting changes since is the court board's,
-- in phase 7.
--
-- Locked courts and pairing rules are never touched by either branch. They are
-- inputs to generation, not results of it. 13.8.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_lineup_stale(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM rotations r
  USING session_instances si
  WHERE r.session_id = si.id
    AND si.id = p_session_id
    AND si.has_manual_lineup = false;
END;
$$;

-- These are internals. Nothing outside the RPCs in 0021 to 0024 calls them,
-- and a client that could call resolve_price on somebody else's id would be
-- reading a custom rate that D41 keeps between that player and the coach.
REVOKE EXECUTE ON FUNCTION resolve_price(uuid, session_type, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION subscription_remaining(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION pick_subscription(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_lineup_stale(uuid)      FROM PUBLIC, anon, authenticated;
