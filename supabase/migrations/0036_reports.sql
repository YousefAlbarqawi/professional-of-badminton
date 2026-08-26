-- ─────────────────────────────────────────────────────────
-- 0036  Reports
-- BUILD-SPEC 15.12, and sections 12.1, 12.2, 12.3
--
-- ── Coach only, in the API and not merely in the tab ──────
-- D73 and D16. Every function here raises `not_authorized` unless is_coach().
-- An admin holds a valid session, reaches the RPC, and is refused by the
-- function itself; hiding the button is a courtesy, not the boundary. A19's
-- v_session_financials guards the same line with WHERE is_coach() and stays
-- where it is — phase 5's review footer is is_staff() by A53, because the
-- bottom of the screen an admin is standing in the gym using is not a report.
--
-- ── Scope: what a month contains ─────────────────────────
-- Every figure below is drawn from sessions whose session_date falls in the
-- Amman month AND which have started AND which are not cancelled.
--
-- "Have started" matters only for the current month. A session tonight at
-- 21:00 already carries a cost snapshot — the rent is committed — but cannot
-- have taken a fils yet, so counting it would make the month the coach is
-- standing in look like a loss until the last session of it has run. Cancelled
-- sessions are excluded from revenue, cost and occupancy alike, and counted on
-- their own line, because recompute_night_costs redistributes their share of
-- the rent across the sessions that did run (12.1). Recorded as A72.
--
-- ── The three revenue rules of 12.2 ──────────────────────
-- 1. A credit is worth the per-visit rate of the subscription it came from,
--    reached through bookings.credit_txn_id → credit_transactions →
--    player_subscriptions.per_visit_fils. Between 4.000 and 5.000 JD. Never
--    the 6 JD session price.
-- 2. A free guest, a 0 JD custom rate player and a coach slot contribute zero
--    while consuming a court slot. They do so by expecting nothing: their rows
--    are counted as attendees everywhere and are filtered out of every revenue
--    sum by payment_method and payment_status.
-- 3. Unpaid amounts are not revenue. sum(expected - paid) is `outstanding`,
--    which appears in "profit if all outstanding is collected" and nowhere in
--    `revenue`.
--
-- Cancelled bookings are excluded throughout. 9.3: a cancellation never makes
-- a balance entry, and a cancelled row is not expected money.
-- ─────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────
-- report_totals(month)
-- 15.12 sections 1 (totals), 2 (counts), 3 (profit) and 8 (the two totals).
--
-- The cost breakdown is returned in its three parts because 12.1 allocates
-- them by three different rules and the coach reading a bad month wants to
-- know which one moved. `coach_fee_accrued_fils` is 12.3's marker: a fee owed
-- to an assistant who has not been paid is a cost, and it is not cash spent,
-- so both numbers are reported and the screen labels the difference.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_totals(p_month date)
RETURNS TABLE (
  cash_fils                integer,
  cliq_fils                integer,
  credit_fils              integer,
  revenue_fils             integer,
  court_cost_fils          integer,
  water_cost_fils          integer,
  coach_fee_fils           integer,
  coach_fee_accrued_fils   integer,
  cost_fils                integer,
  cash_cost_fils           integer,
  outstanding_fils         integer,
  profit_fils              integer,
  profit_if_collected_fils integer,
  sessions_run             integer,
  sessions_cancelled       integer,
  attendee_count           integer,
  capacity_total           integer,
  owed_to_date_fils        integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT si.id, si.capacity,
           si.court_cost_share_fils, si.water_cost_fils, si.coach_fee_share_fils
    FROM session_instances si
    WHERE si.session_date >= v_from
      AND si.session_date <  v_to
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
  ),
  attendee_rows AS (
    SELECT b.payment_method, b.payment_status, b.expected_fils, b.paid_fils,
           ps.per_visit_fils
    FROM bookings b
    JOIN scoped s ON s.id = b.session_id
    LEFT JOIN credit_transactions  ct ON ct.id = b.credit_txn_id
    LEFT JOIN player_subscriptions ps ON ps.id = ct.subscription_id
    WHERE b.status IN ('confirmed', 'settled')
  ),
  revenue AS (
    SELECT
      COALESCE(SUM(r.paid_fils) FILTER (
        WHERE r.payment_method = 'cash' AND r.payment_status IN ('paid','partial')), 0)::integer
        AS cash,
      COALESCE(SUM(r.paid_fils) FILTER (
        WHERE r.payment_method = 'cliq' AND r.payment_status IN ('paid','partial')), 0)::integer
        AS cliq,
      COALESCE(SUM(COALESCE(r.per_visit_fils, 0)) FILTER (
        WHERE r.payment_method = 'credit'), 0)::integer
        AS credit,
      COALESCE(SUM(r.expected_fils - r.paid_fils), 0)::integer AS outstanding,
      COUNT(*)::integer AS attendees
    FROM attendee_rows r
  ),
  cost AS (
    SELECT COALESCE(SUM(s.court_cost_share_fils), 0)::integer AS court,
           COALESCE(SUM(s.water_cost_fils),       0)::integer AS water,
           COALESCE(SUM(s.coach_fee_share_fils),  0)::integer AS coach,
           COUNT(*)::integer                                  AS run,
           COALESCE(SUM(s.capacity), 0)::integer              AS capacity
    FROM scoped s
  ),
  -- D17: the coach "marks each paid or unpaid". session_coaches.fee_share_fils
  -- is that coach's slice of the session's share, so the unpaid slices sum to
  -- exactly the part of coach_fee_fils that is still owed.
  accrued AS (
    SELECT COALESCE(SUM(sc.fee_share_fils), 0)::integer AS unpaid
    FROM session_coaches sc
    JOIN scoped s ON s.id = sc.session_id
    WHERE sc.is_paid = false
  ),
  cancelled AS (
    SELECT COUNT(*)::integer AS n
    FROM session_instances si
    WHERE si.session_date >= v_from
      AND si.session_date <  v_to
      AND si.status = 'cancelled'
  ),
  -- 15.12 section 8's "total owed". The debt book as it stands today, not this
  -- month's slice of it: a debt from March that is still unpaid in May is
  -- money the coach is owed in May. A73.
  owed AS (
    SELECT COALESCE(SUM(be.amount_fils), 0)::integer AS total FROM balance_entries be
  )
  SELECT rv.cash,
         rv.cliq,
         rv.credit,
         (rv.cash + rv.cliq + rv.credit)::integer,
         c.court,
         c.water,
         c.coach,
         a.unpaid,
         (c.court + c.water + c.coach)::integer,
         -- 12.3: an unpaid assistant is an accrued cost, not cash spent.
         (c.court + c.water + c.coach - a.unpaid)::integer,
         rv.outstanding,
         -- 12.3: session_profit = (cash + cliq + credit revenue) - session_cost
         (rv.cash + rv.cliq + rv.credit - (c.court + c.water + c.coach))::integer,
         (rv.cash + rv.cliq + rv.credit + rv.outstanding
            - (c.court + c.water + c.coach))::integer,
         c.run,
         x.n,
         rv.attendees,
         c.capacity,
         o.total
  FROM revenue rv
  CROSS JOIN cost c
  CROSS JOIN accrued a
  CROSS JOIN cancelled x
  CROSS JOIN owed o;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_revenue_by_week(month)
-- 15.12 section 1, "with a bar per week".
--
-- Weeks start on Sunday, matching the weekday integers the whole schema uses
-- (6.2: 0 = Sunday, EXTRACT(DOW)). A week is keyed by its Sunday even when
-- that Sunday falls in the previous month, so a session is never counted in
-- two buckets and the bars sum to the month's revenue exactly.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_revenue_by_week(p_month date)
RETURNS TABLE (
  week_start    date,
  cash_fils     integer,
  cliq_fils     integer,
  credit_fils   integer,
  total_fils    integer,
  session_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT si.id,
           (si.session_date - EXTRACT(DOW FROM si.session_date)::integer) AS sunday
    FROM session_instances si
    WHERE si.session_date >= v_from
      AND si.session_date <  v_to
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
  ),
  per_session AS (
    SELECT s.id, s.sunday,
           COALESCE(SUM(b.paid_fils) FILTER (
             WHERE b.payment_method = 'cash' AND b.payment_status IN ('paid','partial')), 0) AS cash,
           COALESCE(SUM(b.paid_fils) FILTER (
             WHERE b.payment_method = 'cliq' AND b.payment_status IN ('paid','partial')), 0) AS cliq,
           COALESCE(SUM(COALESCE(ps.per_visit_fils, 0)) FILTER (
             WHERE b.payment_method = 'credit'), 0) AS credit
    FROM scoped s
    LEFT JOIN bookings b
      ON b.session_id = s.id
     AND b.status IN ('confirmed','settled')
    LEFT JOIN credit_transactions  ct ON ct.id = b.credit_txn_id
    LEFT JOIN player_subscriptions ps ON ps.id = ct.subscription_id
    GROUP BY s.id, s.sunday
  )
  SELECT p.sunday::date,
         SUM(p.cash)::integer,
         SUM(p.cliq)::integer,
         SUM(p.credit)::integer,
         SUM(p.cash + p.cliq + p.credit)::integer,
         COUNT(*)::integer
  FROM per_session p
  GROUP BY p.sunday
  ORDER BY p.sunday;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_session_table(month)
-- 15.12 section 4: "Date, venue, time, players, revenue, cost, profit,
-- sortable." Sorting is left to the client — a month holds around fifty rows,
-- they are already on the phone, and re-sorting them must not cost a request.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_session_table(p_month date)
RETURNS TABLE (
  session_id       uuid,
  session_date     date,
  starts_at        timestamptz,
  ends_at          timestamptz,
  venue_id         uuid,
  venue_name_en    text,
  venue_name_ar    text,
  session_type     session_type,
  player_count     integer,
  capacity         integer,
  revenue_fils     integer,
  cost_fils        integer,
  profit_fils      integer,
  outstanding_fils integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT si.*
    FROM session_instances si
    WHERE si.session_date >= v_from
      AND si.session_date <  v_to
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
  ),
  money AS (
    SELECT s.id,
           COALESCE(SUM(b.paid_fils) FILTER (
             WHERE b.payment_method IN ('cash','cliq')
               AND b.payment_status IN ('paid','partial')), 0)::integer AS collected,
           COALESCE(SUM(COALESCE(ps.per_visit_fils, 0)) FILTER (
             WHERE b.payment_method = 'credit'), 0)::integer AS credit,
           COALESCE(SUM(b.expected_fils - b.paid_fils), 0)::integer AS outstanding,
           COUNT(b.id)::integer AS players
    FROM scoped s
    LEFT JOIN bookings b
      ON b.session_id = s.id
     AND b.status IN ('confirmed','settled')
    LEFT JOIN credit_transactions  ct ON ct.id = b.credit_txn_id
    LEFT JOIN player_subscriptions ps ON ps.id = ct.subscription_id
    GROUP BY s.id
  )
  SELECT s.id,
         s.session_date,
         s.starts_at,
         s.ends_at,
         s.venue_id,
         v.name_en,
         v.name_ar,
         s.session_type,
         m.players,
         s.capacity,
         (m.collected + m.credit)::integer,
         (s.court_cost_share_fils + s.water_cost_fils + s.coach_fee_share_fils)::integer,
         (m.collected + m.credit
            - (s.court_cost_share_fils + s.water_cost_fils + s.coach_fee_share_fils))::integer,
         m.outstanding
  FROM scoped s
  JOIN venues v ON v.id = s.venue_id
  JOIN money  m ON m.id = s.id
  ORDER BY s.starts_at;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_slot_attendance(month)
-- 15.12 section 5: "Every recurring slot with average fill over the month, so
-- dying slots are obvious."
--
-- Recurring means a template. A one-off created under 15.6 is not a slot and
-- is left out of this table; it still appears in section 4 and in every total.
-- The average is left to the client, from the two integers it divides, so that
-- section 5 and section 6 cannot disagree about what "fill" means. A74.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_slot_attendance(p_month date)
RETURNS TABLE (
  template_id    uuid,
  venue_id       uuid,
  venue_name_en  text,
  venue_name_ar  text,
  weekday        integer,
  start_time     time,
  session_type   session_type,
  sessions_run   integer,
  attendee_total integer,
  capacity_total integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT si.id, si.template_id, si.venue_id, si.capacity,
           COUNT(b.id)::integer AS players
    FROM session_instances si
    LEFT JOIN bookings b
      ON b.session_id = si.id
     AND b.status IN ('confirmed','settled')
    WHERE si.session_date >= v_from
      AND si.session_date <  v_to
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
      AND si.template_id IS NOT NULL
    GROUP BY si.id
  )
  SELECT t.id,
         t.venue_id,
         v.name_en,
         v.name_ar,
         t.weekday,
         t.start_time,
         t.session_type,
         COUNT(s.id)::integer,
         COALESCE(SUM(s.players), 0)::integer,
         COALESCE(SUM(s.capacity), 0)::integer
  FROM scoped s
  JOIN session_templates t ON t.id = s.template_id
  JOIN venues v            ON v.id = t.venue_id
  GROUP BY t.id, v.name_en, v.name_ar
  ORDER BY t.weekday, t.start_time;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_venue_fill(month)
-- 15.12 section 6.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_venue_fill(p_month date)
RETURNS TABLE (
  venue_id       uuid,
  venue_name_en  text,
  venue_name_ar  text,
  sessions_run   integer,
  attendee_total integer,
  capacity_total integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT si.id, si.venue_id, si.capacity,
           COUNT(b.id)::integer AS players
    FROM session_instances si
    LEFT JOIN bookings b
      ON b.session_id = si.id
     AND b.status IN ('confirmed','settled')
    WHERE si.session_date >= v_from
      AND si.session_date <  v_to
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
    GROUP BY si.id
  )
  SELECT v.id,
         v.name_en,
         v.name_ar,
         COUNT(s.id)::integer,
         COALESCE(SUM(s.players), 0)::integer,
         COALESCE(SUM(s.capacity), 0)::integer
  FROM scoped s
  JOIN venues v ON v.id = s.venue_id
  GROUP BY v.id
  ORDER BY v.display_order, v.id;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_subscriptions(month)
-- 15.12 section 7: "Sold this month, credits used, credits expired unused."
--
-- "Sold" is granted: D49 and D50 put the money outside the app entirely, so
-- the only date the app knows is the grant. Its value is granted_visits x the
-- snapshotted per_visit_fils rather than the package price, because 11.2 step
-- 4 lets the coach override the visit count and 11.1 snapshots the rate.
--
-- Credits used nets refunds off. A booking that was made and cancelled on the
-- same day consumed nothing (9.3), and a report that said otherwise would
-- overstate every month in which a player changed his mind.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_subscriptions(p_month date)
RETURNS TABLE (
  sold_count       integer,
  sold_value_fils  integer,
  credits_used     integer,
  credits_expired  integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH sold AS (
    SELECT COUNT(*)::integer AS n,
           COALESCE(SUM(s.granted_visits * s.per_visit_fils), 0)::integer AS value
    FROM player_subscriptions s
    WHERE (s.created_at AT TIME ZONE 'Asia/Amman')::date >= v_from
      AND (s.created_at AT TIME ZONE 'Asia/Amman')::date <  v_to
  ),
  moved AS (
    SELECT
      COALESCE(-SUM(ct.delta) FILTER (
        WHERE ct.reason IN ('booking','booking_refund','session_cancelled')), 0)::integer AS used,
      COALESCE(-SUM(ct.delta) FILTER (WHERE ct.reason = 'expiry'), 0)::integer AS expired
    FROM credit_transactions ct
    WHERE (ct.created_at AT TIME ZONE 'Asia/Amman')::date >= v_from
      AND (ct.created_at AT TIME ZONE 'Asia/Amman')::date <  v_to
  )
  SELECT sold.n, sold.value, moved.used, moved.expired
  FROM sold CROSS JOIN moved;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_outstanding(month)
-- 15.12 section 8's top ten debtors.
--
-- `owed_fils` is the player's live book, which is what the coach chases;
-- `month_owed_fils` is the part of it this month's sessions created, so a name
-- that appears because of one bad night reads differently from a name that has
-- been there since March. Both come from balance_entries, which 10.3 makes the
-- only place a debt is ever recorded.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_outstanding(p_month date)
RETURNS TABLE (
  player_id       uuid,
  display_name    text,
  owed_fils       integer,
  month_owed_fils integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  SELECT p.id,
         p.first_name || ' ' || p.last_name,
         COALESCE(SUM(be.amount_fils), 0)::integer,
         COALESCE(SUM(be.amount_fils) FILTER (
           WHERE (be.created_at AT TIME ZONE 'Asia/Amman')::date >= v_from
             AND (be.created_at AT TIME ZONE 'Asia/Amman')::date <  v_to), 0)::integer
  FROM balance_entries be
  JOIN profiles p ON p.id = be.player_id
  GROUP BY p.id
  HAVING COALESCE(SUM(be.amount_fils), 0) > 0
  ORDER BY 3 DESC, 2
  LIMIT 10;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- report_players(month)
-- 15.12 section 9: "Active this month against last month, and new
-- registrations."
--
-- Active means he was on a court: a confirmed or settled booking on a session
-- that ran. A guest has no account and is nobody's registration, so guests are
-- counted as attendees everywhere else and not here.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_players(p_month date)
RETURNS TABLE (
  active_this_month     integer,
  active_previous_month integer,
  new_registrations     integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_prev date := (date_trunc('month', p_month) - interval '1 month')::date;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  RETURN QUERY
  WITH active AS (
    SELECT b.player_id,
           si.session_date >= v_from AND si.session_date < v_to AS this_month,
           si.session_date >= v_prev AND si.session_date < v_from AS previous_month
    FROM bookings b
    JOIN session_instances si ON si.id = b.session_id
    WHERE b.status IN ('confirmed','settled')
      AND b.player_id IS NOT NULL
      AND si.status <> 'cancelled'
      AND si.starts_at <= now()
      AND si.session_date >= v_prev
      AND si.session_date <  v_to
  )
  SELECT COUNT(DISTINCT a.player_id) FILTER (WHERE a.this_month)::integer,
         COUNT(DISTINCT a.player_id) FILTER (WHERE a.previous_month)::integer,
         (SELECT COUNT(*)::integer FROM profiles p
          WHERE (p.created_at AT TIME ZONE 'Asia/Amman')::date >= v_from
            AND (p.created_at AT TIME ZONE 'Asia/Amman')::date <  v_to)
  FROM active a;
END;
$$;


-- Nothing here is reachable without a session, and every one of them refuses
-- anybody who is not the coach from the inside as well.
REVOKE EXECUTE ON FUNCTION report_totals(date)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_revenue_by_week(date)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_session_table(date)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_slot_attendance(date)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_venue_fill(date)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_subscriptions(date)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_outstanding(date)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION report_players(date)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION report_totals(date)             TO authenticated;
GRANT EXECUTE ON FUNCTION report_revenue_by_week(date)    TO authenticated;
GRANT EXECUTE ON FUNCTION report_session_table(date)      TO authenticated;
GRANT EXECUTE ON FUNCTION report_slot_attendance(date)    TO authenticated;
GRANT EXECUTE ON FUNCTION report_venue_fill(date)         TO authenticated;
GRANT EXECUTE ON FUNCTION report_subscriptions(date)      TO authenticated;
GRANT EXECUTE ON FUNCTION report_outstanding(date)        TO authenticated;
GRANT EXECUTE ON FUNCTION report_players(date)            TO authenticated;
