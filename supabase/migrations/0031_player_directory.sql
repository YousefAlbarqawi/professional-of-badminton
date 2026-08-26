-- ─────────────────────────────────────────────────────────
-- 0031  The player directory behind 15.7
-- BUILD-SPEC 15.7, and 14.0's Players stack
--
-- ── Why this is in phase 6 at all ─────────────────────────
-- Section 20 assigns 15.7 to no phase. 14.0 does assign it a place:
--
--     Players (stack: PlayerList → PlayerProfile → GrantSubscription
--              → AdjustCredits)
--
-- Grant and adjust are this phase's, and that stack is the only route to them
-- the specification describes. Phase 5 gave the player profile one other way
-- in — tapping a name on the review screen — but the people 11.3's migration
-- is *for* are mid-subscription today and may not appear on any recent review
-- screen at all. Without the list, the flow this phase is measured by cannot
-- be reached for exactly the players it exists to serve. Recorded as an
-- assumption in section 21.
--
-- ── One function, because the row is four tables wide ─────
-- 15.7's row is "name, tier badge, visibility level chip, credits remaining,
-- and amount owed when non-zero" — profiles, plus the credit ledger, plus
-- balance_entries. Staff can read all three, so the client could fetch them
-- separately and join them on the phone, at the cost of three round trips and
-- a join written twice. Filtering by "has an active subscription" or "owes
-- money" would then have to happen after all three had arrived, which is a
-- filter that cannot page.
--
-- Sorting is a parameter rather than a client-side `.sort()` for the same
-- reason: 15.7 sorts by name, tier or amount owed, and only the database knows
-- the last two before the rows are on the phone.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_players(
  p_query           text    DEFAULT NULL,
  p_tier            tier    DEFAULT NULL,
  p_visibility      visibility_level DEFAULT NULL,
  p_has_subscription boolean DEFAULT NULL,
  p_owes_money      boolean DEFAULT NULL,
  p_sort            text    DEFAULT 'name',
  p_limit           integer DEFAULT 100
) RETURNS TABLE (
  player_id      uuid,
  display_name   text,
  tier           tier,
  visibility     visibility_level,
  credits        integer,
  credit_expires date,
  owed_fils      integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
  v_sort  text := COALESCE(p_sort, 'name');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  -- D16: an admin does everything the coach does except read reports, and a
  -- player list is not a report. A14: an assistant coach is not staff and gets
  -- nothing here.
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH rows AS (
    SELECT p.id,
           p.first_name || ' ' || p.last_name AS name,
           p.tier       AS player_tier,
           p.visibility AS player_visibility,
           -- D56 and 6.2: the balance is the sum of the ledger. This adds up
           -- every live subscription's sum; it does not read a counter,
           -- because there is not one.
           COALESCE((
             SELECT SUM(subscription_remaining(s.id))
             FROM player_subscriptions s
             WHERE s.player_id = p.id
               AND s.is_voided = false
               AND s.expires_on >= amman_today()
           ), 0)::integer AS credits,
           -- 11.4: nearest expiry first, so this is the date the row should
           -- warn about — the same subscription pick_subscription would spend.
           (SELECT MIN(s.expires_on)
            FROM player_subscriptions s
            WHERE s.player_id = p.id
              AND s.is_voided = false
              AND s.expires_on >= amman_today()
              AND subscription_remaining(s.id) > 0) AS credit_expires,
           COALESCE((
             SELECT SUM(be.amount_fils)
             FROM balance_entries be
             WHERE be.player_id = p.id
           ), 0)::integer AS owed
    FROM profiles p
    WHERE p.deleted_at IS NULL
      AND p.is_active
      -- Staff have their own routes into their own accounts (A28) and are not
      -- who the coach is looking for on this screen. An assistant coach who
      -- also plays is reached through the session he plays in (D47).
      AND p.role = 'player'
      AND (v_query = ''
           OR (p.first_name || ' ' || p.last_name) ILIKE '%' || v_query || '%'
           OR similarity(p.first_name || ' ' || p.last_name, v_query) > 0.2)
      AND (p_tier IS NULL OR p.tier = p_tier)
      AND (p_visibility IS NULL OR p.visibility = p_visibility)
  )
  SELECT r.id, r.name, r.player_tier, r.player_visibility,
         r.credits, r.credit_expires, r.owed
  FROM rows r
  WHERE (p_has_subscription IS NULL OR (r.credits > 0) = p_has_subscription)
    AND (p_owes_money IS NULL OR (r.owed > 0) = p_owes_money)
  ORDER BY
    -- Tier descending: A+ is strongest (D58) and the enum is declared weakest
    -- first, so DESC is the order the coach reads a list of players in. An
    -- unrated player sorts last rather than first, because a missing tier is
    -- not a weak one (A11).
    CASE WHEN v_sort = 'tier'  THEN r.player_tier END DESC NULLS LAST,
    CASE WHEN v_sort = 'owed'  THEN r.owed        END DESC NULLS LAST,
    r.name
  LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_players(text, tier, visibility_level, boolean, boolean, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_players(text, tier, visibility_level, boolean, boolean, text, integer)
  TO authenticated;
