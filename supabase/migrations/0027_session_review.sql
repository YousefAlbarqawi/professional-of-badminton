-- ─────────────────────────────────────────────────────────
-- 0027  Confirming, reopening, and the review footer
-- BUILD-SPEC 8.5, 10.2, 12.1, 12.2, 12.3, D37, D39
--
-- 5.5's state machine, the two transitions this file owns:
--
--   PENDING_REVIEW ──(coach confirms)──► CONFIRMED
--   CONFIRMED ───────(coach re-opens)──► PENDING_REVIEW      within 7 days
--
-- and 5.6's, which moves with it:
--
--   CONFIRMED ───────(coach confirms in review)──► SETTLED
--
-- "SETTLED means the coach has reviewed this row's payment; it says nothing
-- about whether the person physically turned up, because attendance is
-- explicitly not tracked." Section 4 item 5.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- confirm_session_review(session)
-- BUILD-SPEC 8.5, and 10.2's *Confirm session* header action
--
-- "Sets every confirmed booking on the session to settled, stamps reviewed_at
-- and reviewed_by, and moves the session to confirmed."
--
-- Idempotent on purpose: a second press after adding one more person settles
-- the row that was added and leaves the rest alone, which is what the coach
-- means by pressing it again. D39 keeps everything editable for 7 days, so
-- pressing confirm is not the end of anything.
--
-- Note what confirming freezes. 12.1: "Once a session is confirmed or locked,
-- its cost snapshot is frozen" — recompute_night_costs already skips anything
-- past pending_review, so this transition is what stops a later change to the
-- night rewriting this session's cost.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_session_review(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  v_session := assert_session_unlocked(p_session_id);

  -- 10.2: "Reachable from a session that is pending_review or confirmed, until
  -- it locks." A session still being played has nothing to confirm, and a
  -- cancelled one has nobody to confirm it for.
  IF v_session.status NOT IN ('pending_review', 'confirmed') THEN
    RAISE EXCEPTION 'session_not_in_review';
  END IF;

  UPDATE bookings
  SET status     = 'settled',
      settled_at = now()
  WHERE session_id = p_session_id AND status = 'confirmed';

  UPDATE session_instances
  SET status      = 'confirmed',
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = p_session_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- reopen_session_review(session)
-- BUILD-SPEC 8.5: "Reversible: reopen_session_review moves it back to
-- pending_review, allowed until ends_at + 7 days."
--
-- The settled bookings go back to confirmed with them. Leaving them settled
-- would make the reopened session a review screen full of rows nobody could
-- act on, and 5.6 defines settled as "the coach has reviewed this row's
-- payment" — which, having reopened, he has not.
--
-- reviewed_at and reviewed_by are cleared for the same reason: they name the
-- confirmation that is being undone. The audit log keeps the history (6.2),
-- which is where a question about who confirmed what and when belongs.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reopen_session_review(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  -- The 7 day deadline is inside this helper, so "allowed until ends_at + 7
  -- days" holds whether or not the nightly lock job has run yet.
  v_session := assert_session_unlocked(p_session_id);

  IF v_session.status <> 'confirmed' THEN
    RAISE EXCEPTION 'session_not_confirmed';
  END IF;

  UPDATE bookings
  SET status     = 'confirmed',
      settled_at = NULL
  WHERE session_id = p_session_id AND status = 'settled';

  UPDATE session_instances
  SET status      = 'pending_review',
      reviewed_at = NULL,
      reviewed_by = NULL
  WHERE id = p_session_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- get_session_money_summary(session)
-- BUILD-SPEC 10.2's footer, valued per 12.2 and 12.3
--
-- "Footer summary, always visible: expected total, collected total,
-- outstanding total, and the session's cost and profit."
--
-- ── Why this is an RPC and not v_session_financials ───────
-- That view is coach only (D73, A19) and phase 9 owns it. This footer is part
-- of the review screen, and D16 says an admin "can do everything the coach can
-- do except view reports" — the Reports tab in 15.12 is the thing D73 names,
-- not the bottom of the screen he is standing in the gym using. So the same
-- arithmetic is exposed here for one session at a time, gated on is_staff(),
-- and the month-wide view stays coach only. A46.
--
-- ── The three valuation rules, 12.2 ───────────────────────
-- 1. A credit is worth the per-visit rate of the subscription it came from,
--    between 4.000 and 5.000 JD. Never the 6 JD session price. Hence the join
--    down through credit_transactions to the subscription's snapshotted rate.
-- 2. A free guest, a 0 JD custom rate player and a coach slot all contribute
--    zero revenue while consuming a court slot. They do, by expecting nothing.
-- 3. Unpaid amounts are not revenue. They are outstanding, and they show up in
--    "profit if all outstanding is collected" and nowhere else.
--
-- Cancelled bookings are excluded throughout. 9.3: the app never creates a
-- balance entry from a cancellation, and a cancelled row is not expected money.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_session_money_summary(p_session_id uuid)
RETURNS TABLE (
  expected_fils            integer,
  collected_fils           integer,
  credit_revenue_fils      integer,
  outstanding_fils         integer,
  cost_fils                integer,
  profit_fils              integer,
  profit_if_collected_fils integer,
  attendee_count           integer,
  unsettled_count          integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH booking_rows AS (
    SELECT b.expected_fils,
           b.paid_fils,
           b.payment_method,
           b.payment_status,
           b.status,
           ps.per_visit_fils
    FROM bookings b
    LEFT JOIN credit_transactions ct   ON ct.id = b.credit_txn_id
    LEFT JOIN player_subscriptions ps  ON ps.id = ct.subscription_id
    WHERE b.session_id = p_session_id
      AND b.status IN ('confirmed', 'settled')
  ),
  totals AS (
    SELECT
      COALESCE(SUM(r.expected_fils), 0)::integer AS expected,
      COALESCE(SUM(r.paid_fils) FILTER (
        WHERE r.payment_method IN ('cash','cliq')
          AND r.payment_status IN ('paid','partial')), 0)::integer AS collected,
      COALESCE(SUM(r.per_visit_fils) FILTER (
        WHERE r.payment_method = 'credit'), 0)::integer AS credit_revenue,
      COALESCE(SUM(r.expected_fils - r.paid_fils), 0)::integer AS outstanding,
      COUNT(*)::integer AS attendees,
      COUNT(*) FILTER (WHERE r.status = 'confirmed')::integer AS unsettled
    FROM booking_rows r
  ),
  cost AS (
    SELECT (si.court_cost_share_fils + si.water_cost_fils + si.coach_fee_share_fils)::integer
             AS cost
    FROM session_instances si WHERE si.id = p_session_id
  )
  SELECT t.expected,
         t.collected,
         t.credit_revenue,
         t.outstanding,
         c.cost,
         -- 12.3: session_profit = (cash + cliq + credit revenue) - session_cost
         (t.collected + t.credit_revenue - c.cost)::integer,
         -- "The report shows both profit and profit if all outstanding is
         -- collected, because the coach will want both numbers." 12.3.
         (t.collected + t.credit_revenue + t.outstanding - c.cost)::integer,
         t.attendees,
         t.unsettled
  FROM totals t CROSS JOIN cost c;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_session_review(uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION reopen_session_review(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_session_money_summary(uuid)  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION confirm_session_review(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_session_review(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION get_session_money_summary(uuid)   TO authenticated;
