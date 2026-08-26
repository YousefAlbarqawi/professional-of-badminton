-- ─────────────────────────────────────────────────────────
-- 0041  A nightly credit-balance cache, and a cursor on the player directory
-- OPEN-ITEMS.md: "`list_players` sums the ledger per row" and
-- "The player directory is unpaged"
--
-- Both watch-list items land on `search_players` (migration 0031), so both
-- are closed here in one rewrite of it.
--
-- ── The cache ──────────────────────────────────────────────
-- 15.7's row needs "credits remaining" and the date the nearest one expires,
-- and D56 (6.2) is explicit: the balance is always SUM(delta) over
-- credit_transactions, never a cached counter column, because a counter that
-- is written on every booking and every cancellation is a second ledger that
-- can drift from the first. `player_credit_balances` is not that: it writes
-- nothing when a credit moves, and nothing reads it as the balance except
-- this one screen. It is a nightly snapshot of the same SUM(delta) the ledger
-- has always been the source of truth for, refreshed by the same 03:20 job
-- that already walks every subscription (migration 0030), rather than a
-- counter kept live by every transaction that touches a subscription.
--
-- `REFRESH MATERIALIZED VIEW` (no CONCURRENTLY) is what `void_expired_subscriptions`
-- can actually call: CONCURRENTLY refuses to run inside a transaction block,
-- and a function body is one. The exclusive lock it takes instead is held for
-- a sub-second rebuild over a few hundred rows, at 00:20 UTC when nobody is
-- looking at the player list.
--
-- The view is never granted to `anon` or `authenticated`: it holds every
-- player's credit balance with no RLS to narrow it — materialized views
-- cannot carry a policy — so the only door to it is `search_players` itself,
-- a SECURITY DEFINER function already gated on `is_staff()`.
--
-- ── The cursor ─────────────────────────────────────────────
-- `search_players` already took `p_limit`; what it never took was a way to
-- ask for the next page instead of the first one. `p_after_*` carries the
-- sort-relevant columns of the caller's last row — tier, amount owed, name
-- and id, one of which matters depending on `p_sort` — and the query resumes
-- strictly after that row in the same order it was already returning. Name
-- and id are always both compared as the final tiebreaker, which is new: the
-- original query only tiebroke on name, and two players who share a full
-- name need `id` as well for a cursor to be able to tell them apart.
-- ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW player_credit_balances AS
SELECT
  s.player_id,
  COALESCE(SUM(subscription_remaining(s.id)) FILTER (
    WHERE s.is_voided = false AND s.expires_on >= amman_today()), 0)::integer AS credits,
  MIN(s.expires_on) FILTER (
    WHERE s.is_voided = false
      AND s.expires_on >= amman_today()
      AND subscription_remaining(s.id) > 0) AS credit_expires
FROM player_subscriptions s
GROUP BY s.player_id;

CREATE UNIQUE INDEX player_credit_balances_player_id_idx ON player_credit_balances (player_id);

-- No RLS exists for a materialized view, so the grant itself is the boundary
-- here, and it is closed: only `search_players`, a SECURITY DEFINER function
-- owned by the same role that owns this view, can read it. `service_role`
-- keeps the same broad access migration 0032 already gives it everywhere.
REVOKE ALL ON player_credit_balances FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION void_expired_subscriptions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  r           record;
  v_remaining integer;
  v_count     integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.player_id
    FROM player_subscriptions s
    WHERE s.expires_on < amman_today()
      AND (s.is_voided = false OR subscription_remaining(s.id) <> 0)
    FOR UPDATE
  LOOP
    v_remaining := subscription_remaining(r.id);

    IF v_remaining <> 0 THEN
      INSERT INTO credit_transactions
        (subscription_id, player_id, delta, reason, created_by)
      VALUES (r.id, r.player_id, -v_remaining, 'expiry', NULL);
    END IF;

    UPDATE player_subscriptions SET is_voided = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  -- 0041: the same nightly pass refreshes 15.7's credit cache, so a voided
  -- subscription's zeroed balance and a fresh grant made since yesterday are
  -- both reflected the next time the player list is opened. Not CONCURRENTLY:
  -- see the migration header.
  REFRESH MATERIALIZED VIEW player_credit_balances;

  RETURN v_count;
END;
$$;

DROP FUNCTION IF EXISTS search_players(text, tier, visibility_level, boolean, boolean, text, integer);

CREATE OR REPLACE FUNCTION search_players(
  p_query            text    DEFAULT NULL,
  p_tier             tier    DEFAULT NULL,
  p_visibility       visibility_level DEFAULT NULL,
  p_has_subscription boolean DEFAULT NULL,
  p_owes_money       boolean DEFAULT NULL,
  p_sort             text    DEFAULT 'name',
  p_limit            integer DEFAULT 100,
  -- The previous page's last row, in the same sort. NULL (the default) asks
  -- for the first page. Only the field `p_sort` actually needs is read.
  p_after_tier       tier    DEFAULT NULL,
  p_after_owed       integer DEFAULT NULL,
  p_after_name       text    DEFAULT NULL,
  p_after_id         uuid    DEFAULT NULL
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
           -- 0041: the sum of every live subscription's remaining credits,
           -- read from last night's snapshot of exactly that sum rather than
           -- recomputed per row. A player with no row in the cache — brand
           -- new, or with no subscription ever — has zero, same as before.
           COALESCE(b.credits, 0)::integer AS credits,
           b.credit_expires,
           COALESCE((
             SELECT SUM(be.amount_fils)
             FROM balance_entries be
             WHERE be.player_id = p.id
           ), 0)::integer AS owed
    FROM profiles p
    LEFT JOIN player_credit_balances b ON b.player_id = p.id
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
  ),
  filtered AS (
    SELECT r.*
    FROM rows r
    WHERE (p_has_subscription IS NULL OR (r.credits > 0) = p_has_subscription)
      AND (p_owes_money IS NULL OR (r.owed > 0) = p_owes_money)
      -- The cursor. A NULL p_after_id means "first page": every row passes.
      -- Otherwise the branch for the live sort decides what "after" means —
      -- DESC NULLS LAST for tier, since a NULL tier is not a weak one (A11)
      -- and sorts last; plain DESC for owed, which COALESCE above never lets
      -- be NULL; ascending name for the default. Every branch tiebreaks on
      -- (name, id), matching the ORDER BY below exactly, because a cursor
      -- that does not walk the same order it was built from can skip or
      -- repeat a row.
      AND (
        p_after_id IS NULL
        OR (
          CASE v_sort
            WHEN 'tier' THEN
              (r.player_tier < p_after_tier)
              OR (r.player_tier IS NOT DISTINCT FROM p_after_tier
                  AND (r.name, r.id) > (p_after_name, p_after_id))
              OR (r.player_tier IS NULL AND p_after_tier IS NOT NULL)
            WHEN 'owed' THEN
              (r.owed < p_after_owed)
              OR (r.owed = p_after_owed AND (r.name, r.id) > (p_after_name, p_after_id))
            ELSE
              (r.name, r.id) > (p_after_name, p_after_id)
          END
        )
      )
  )
  SELECT f.id, f.name, f.player_tier, f.player_visibility,
         f.credits, f.credit_expires, f.owed
  FROM filtered f
  ORDER BY
    -- Tier descending: A+ is strongest (D58) and the enum is declared weakest
    -- first, so DESC is the order the coach reads a list of players in. An
    -- unrated player sorts last rather than first, because a missing tier is
    -- not a weak one (A11).
    CASE WHEN v_sort = 'tier'  THEN f.player_tier END DESC NULLS LAST,
    CASE WHEN v_sort = 'owed'  THEN f.owed        END DESC NULLS LAST,
    f.name,
    f.id
  LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_players(
  text, tier, visibility_level, boolean, boolean, text, integer, tier, integer, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION search_players(
  text, tier, visibility_level, boolean, boolean, text, integer, tier, integer, text, uuid
) TO authenticated;
