-- ─────────────────────────────────────────────────────────
-- 0010  Views
-- BUILD-SPEC section 6.3, plus the coach-only report boundary from 7.3
--
-- security_invoker matters here. A Postgres view runs with its owner's rights
-- by default, which would bypass the RLS on the tables underneath it. Views
-- that must respect the caller's row access say so explicitly; the one view
-- that must NOT (occupancy counts, which every player may see in full) is left
-- as a definer view deliberately.
-- ─────────────────────────────────────────────────────────

-- A player sees his own subscriptions and nothing else, because the RLS on
-- player_subscriptions and credit_transactions is applied to him directly.
CREATE VIEW v_player_credit_balance
WITH (security_invoker = true) AS
SELECT s.player_id,
       s.id AS subscription_id,
       s.expires_on,
       s.per_visit_fils,
       COALESCE(SUM(t.delta), 0) AS remaining
FROM player_subscriptions s
LEFT JOIN credit_transactions t ON t.subscription_id = s.id
WHERE s.is_voided = false
GROUP BY s.id;

-- balance_entries has no player SELECT policy at all (A4), so this view is
-- empty for a player and complete for staff, with no extra rule needed.
CREATE VIEW v_player_total_balance
WITH (security_invoker = true) AS
SELECT player_id, COALESCE(SUM(amount_fils),0) AS owed_fils
FROM balance_entries GROUP BY player_id;

-- Deliberately a definer view. Occupancy is not private at any visibility
-- level (section 14.6: "the count is not private, only names and tiers are"),
-- and a player cannot read other people's bookings, so the count has to be
-- computed above his row access rather than through it. It exposes integers
-- and a session id, nothing else.
CREATE VIEW v_session_occupancy AS
SELECT si.id AS session_id,
       si.capacity,
       COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS taken,
       si.capacity - COUNT(b.id) FILTER (WHERE b.status = 'confirmed') AS remaining
FROM session_instances si
LEFT JOIN bookings b ON b.session_id = si.id
GROUP BY si.id;

-- ─────────────────────────────────────────────────────────
-- Report view. Coach only, per D73 and the last row of the section 7.3 table.
--
-- Reports proper are phase 9. This is the minimum needed for the coach-only
-- boundary to exist and be tested now: revenue per section 12.2, cost from the
-- instance's snapshot per section 12.1, profit per 12.3. An admin selecting
-- from it gets nothing, because is_coach() is false for him and the predicate
-- is evaluated per row. See assumption A19.
-- ─────────────────────────────────────────────────────────
CREATE VIEW v_session_financials AS
SELECT
  si.id AS session_id,
  si.session_date,
  si.venue_id,
  si.session_type,
  COALESCE(SUM(b.paid_fils) FILTER (
    WHERE b.payment_method = 'cash' AND b.payment_status IN ('paid','partial')), 0)::integer
    AS cash_revenue_fils,
  COALESCE(SUM(b.paid_fils) FILTER (
    WHERE b.payment_method = 'cliq' AND b.payment_status IN ('paid','partial')), 0)::integer
    AS cliq_revenue_fils,
  -- A credit is worth the per-visit rate of the subscription it came from,
  -- never the session price. Section 12.2 rule 1.
  COALESCE(SUM(ps.per_visit_fils) FILTER (WHERE b.payment_method = 'credit'), 0)::integer
    AS credit_revenue_fils,
  (si.court_cost_share_fils + si.water_cost_fils + si.coach_fee_share_fils)
    AS cost_fils,
  -- Unpaid amounts are not revenue. They are what "profit if all outstanding
  -- is collected" is built from. Section 12.3.
  COALESCE(SUM(b.expected_fils - b.paid_fils) FILTER (
    WHERE b.status IN ('confirmed','settled')), 0)::integer
    AS outstanding_fils
FROM session_instances si
LEFT JOIN bookings b
  ON b.session_id = si.id
 AND b.status IN ('confirmed','settled')
LEFT JOIN credit_transactions ct ON ct.id = b.credit_txn_id
LEFT JOIN player_subscriptions ps ON ps.id = ct.subscription_id
WHERE is_coach()
GROUP BY si.id;

-- Nothing above is readable without a session.
REVOKE ALL ON v_player_credit_balance FROM anon;
REVOKE ALL ON v_player_total_balance  FROM anon;
REVOKE ALL ON v_session_occupancy     FROM anon;
REVOKE ALL ON v_session_financials    FROM anon;

GRANT SELECT ON v_player_credit_balance TO authenticated;
GRANT SELECT ON v_player_total_balance  TO authenticated;
GRANT SELECT ON v_session_occupancy     TO authenticated;
GRANT SELECT ON v_session_financials    TO authenticated;
