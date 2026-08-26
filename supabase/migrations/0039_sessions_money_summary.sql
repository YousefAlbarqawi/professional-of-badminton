-- ─────────────────────────────────────────────────────────
-- 0039  Today's payment summary, one query for the list
-- BUILD-SPEC 15.1: "Each card: venue, time, occupancy, status chip, and a
-- payment summary once the session is past."
--
-- get_session_money_summary (0027) already answers this, one session at a
-- time, for 10.2's footer. Today lists several sessions at once, and OPEN-
-- ITEMS.md recorded why the card was left without this figure until phase 9
-- gave the shape it wanted: "a list of today's sessions would want them in
-- one query rather than N."
--
-- get_sessions_money_summary is that one query: the same 12.2 valuation (a
-- credit is worth its subscription's per-visit rate, never the session price)
-- collapsed to the two figures a card has room for — collected and
-- outstanding — over whatever set of sessions the caller hands in, gated on
-- is_staff() exactly like 0027's function, so an admin reads it too (D16).
--
-- A session missing from p_session_ids' bookings, or missing entirely, comes
-- back as zeroes rather than absent: the caller already knows which sessions
-- it asked about and a card with nothing collected should read as 0 JD, not
-- disappear.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_sessions_money_summary(p_session_ids uuid[])
RETURNS TABLE (
  session_id       uuid,
  collected_fils   integer,
  outstanding_fils integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT DISTINCT s AS id FROM unnest(p_session_ids) AS s
  ),
  booking_rows AS (
    SELECT b.session_id,
           b.expected_fils,
           b.paid_fils,
           b.payment_method,
           b.payment_status,
           ps.per_visit_fils
    FROM bookings b
    JOIN scoped sc ON sc.id = b.session_id
    LEFT JOIN credit_transactions  ct ON ct.id = b.credit_txn_id
    LEFT JOIN player_subscriptions ps ON ps.id = ct.subscription_id
    WHERE b.status IN ('confirmed', 'settled')
  )
  SELECT sc.id,
         -- Cash/CliQ actually in hand, plus a credit at its snapshotted rate.
         -- 12.2 rules 1 and 3.
         (COALESCE(SUM(r.paid_fils) FILTER (
            WHERE r.payment_method IN ('cash','cliq')
              AND r.payment_status IN ('paid','partial')), 0)
          + COALESCE(SUM(r.per_visit_fils) FILTER (
            WHERE r.payment_method = 'credit'), 0))::integer,
         COALESCE(SUM(r.expected_fils - r.paid_fils), 0)::integer
  FROM scoped sc
  LEFT JOIN booking_rows r ON r.session_id = sc.id
  GROUP BY sc.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_sessions_money_summary(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_sessions_money_summary(uuid[]) TO authenticated;
