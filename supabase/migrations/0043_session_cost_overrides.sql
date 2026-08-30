-- ─────────────────────────────────────────────────────────
-- 0043  Per-session cost overrides and extra cost lines
-- BUILD-SPEC 12.1, amended on direct client instruction.
--
-- ── What 12.1 assumed, and what actually happens ──────────
-- 12.1 computes a session's cost from three effective-dated rate tables and
-- nothing else: the venue's court rent for that weekday, the consumable rate
-- for that session type, and the daily assistant-coach fee. `recompute_night_
-- costs` (0017) divides them across the night's sessions and snapshots the
-- result onto the instance.
--
-- That model has one assumption in it: that a night costs what the rate table
-- says it costs. The client's account of a real month says otherwise, and in
-- four distinct ways:
--
--   1. An assistant coach is sometimes paid more than the standard daily fee.
--   2. Water is sometimes two packs, sometimes four, sometimes none at all
--      because nobody brought any.
--   3. Snacks, and shuttlecocks, get bought for a session and are not in any
--      rate table.
--   4. A session that starts late runs 15–30 minutes over, and the hall
--      charges another 5–10 JD for the court.
--
-- ── The shape ─────────────────────────────────────────────
-- Two mechanisms, because those four cases are two different kinds of thing.
--
-- **Overrides.** Court rent, coach fee and water each have a rate-table
-- default that is right most nights and wrong some nights. Each gets a
-- nullable override column: NULL means "the computed share stands", and a
-- value means "this night, it was this". Cases 1 and 2, and the client's
-- "prices of the courts should be entered by default, but the coach should be
-- able to adjust them for each session".
--
-- Why a nullable column rather than writing over the snapshot: the snapshot is
-- not the coach's to keep. `recompute_night_costs` rewrites
-- `court_cost_share_fils` whenever another session is added to or cancelled
-- from that night, and it would silently erase a correction. With an override
-- beside it, the division keeps working on the default and the coach's number
-- survives — and "what it should have been" and "what it was" are both still
-- readable, which a single column cannot express.
--
-- **Extra lines.** Snacks, shuttlecocks and overtime are open-ended: there is
-- no default to override, there can be more than one in a session, and each
-- wants a name. A row per line, with a kind for the three that recur and
-- `other` for the rest. Cases 3 and 4.
--
-- Folding overtime into the court override was the obvious alternative and is
-- worse: the coach would lose the fact that 7.500 JD of a 31.250 JD court cost
-- was for staying late, which is exactly the thing he would want to see again
-- when deciding whether to keep starting at 19:00.
--
-- ── Where the total is assembled ──────────────────────────
-- `v_session_costs`, below, and every consumer is rewritten to read it. Four
-- places had the same three-column sum written out by hand — 0010's
-- `v_session_financials`, 0027's `get_session_money_summary`, and 0036's
-- `report_totals` and `report_sessions` — and a fifth copy of an expression
-- that now has five terms would drift within a month.
--
-- ── Effective dating is untouched ─────────────────────────
-- 0003's tables still hold the rates and 12.1's warning still applies: an
-- override is per instance, so editing a rate does not rewrite history, and
-- neither does an override — it belongs to the one session it was typed on.
-- ─────────────────────────────────────────────────────────

-- ── The overrides ────────────────────────────────────────
ALTER TABLE session_instances
  ADD COLUMN court_cost_override_fils integer
    CHECK (court_cost_override_fils IS NULL OR court_cost_override_fils >= 0),
  ADD COLUMN coach_fee_override_fils integer
    CHECK (coach_fee_override_fils IS NULL OR coach_fee_override_fils >= 0),
  ADD COLUMN water_cost_override_fils integer
    CHECK (water_cost_override_fils IS NULL OR water_cost_override_fils >= 0);

COMMENT ON COLUMN session_instances.court_cost_override_fils IS
  'What the court actually cost this session. NULL uses court_cost_share_fils, the night''s divided rate. 12.1 as amended.';
COMMENT ON COLUMN session_instances.coach_fee_override_fils IS
  'What the assistant coaches were actually paid for this session. NULL uses coach_fee_share_fils.';
COMMENT ON COLUMN session_instances.water_cost_override_fils IS
  'What water actually cost this session, 0 included — the coach does not always bring any. NULL uses water_cost_fils.';

-- ── The extra lines ──────────────────────────────────────
-- `other` exists so that a cost the coach has no name for still gets recorded
-- rather than being pushed into whichever of the three fits worst. The label
-- carries what it actually was.
CREATE TYPE session_extra_cost_kind AS ENUM ('overtime', 'snacks', 'shuttlecocks', 'other');

CREATE TABLE session_extra_costs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  kind        session_extra_cost_kind NOT NULL,
  -- Optional, and free text. The kind is what reports group by; this is the
  -- coach's own note — "2 tubes", "stayed 30 min" — and is his to leave blank.
  label       text CHECK (label IS NULL OR char_length(label) <= 120),
  -- Non-negative like every other cost column in the schema. A refund is not
  -- an extra cost; it belongs in whichever override it came out of.
  amount_fils integer NOT NULL CHECK (amount_fils >= 0),
  created_by  uuid NOT NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_extra_costs_session ON session_extra_costs(session_id);

-- Section 7's default deny, then the one policy that opens it. D68 and A14
-- put every cost figure behind staff; a player has no business reading what a
-- session cost to run, and 0012's `session_instances_select_window` gives him
-- the row without these numbers ever being on it.
ALTER TABLE session_extra_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_extra_costs_staff_all ON session_extra_costs FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── The one place the total is assembled ─────────────────
-- security_invoker, so a staff client selecting from it gets exactly the
-- sessions 0012 already lets him read, and so the SECURITY DEFINER functions
-- below — which run as the table owner and therefore above RLS, as they
-- already did — see everything.
CREATE VIEW v_session_costs
WITH (security_invoker = true) AS
SELECT si.id AS session_id,
       si.court_cost_share_fils                                         AS court_cost_default_fils,
       si.coach_fee_share_fils                                          AS coach_fee_default_fils,
       si.water_cost_fils                                               AS water_cost_default_fils,
       si.court_cost_override_fils,
       si.coach_fee_override_fils,
       si.water_cost_override_fils,
       COALESCE(si.court_cost_override_fils, si.court_cost_share_fils)  AS court_cost_fils,
       COALESCE(si.coach_fee_override_fils,  si.coach_fee_share_fils)   AS coach_fee_fils,
       COALESCE(si.water_cost_override_fils, si.water_cost_fils)        AS water_cost_fils,
       COALESCE(x.extras_fils, 0)::integer                              AS extras_fils,
       (COALESCE(si.court_cost_override_fils, si.court_cost_share_fils)
        + COALESCE(si.coach_fee_override_fils, si.coach_fee_share_fils)
        + COALESCE(si.water_cost_override_fils, si.water_cost_fils)
        + COALESCE(x.extras_fils, 0))::integer                          AS cost_fils
FROM session_instances si
LEFT JOIN (
  SELECT session_id, SUM(amount_fils)::integer AS extras_fils
  FROM session_extra_costs
  GROUP BY session_id
) x ON x.session_id = si.id;

-- 0010's stance on views: nothing here is readable without a session.
REVOKE ALL ON v_session_costs FROM anon;


-- ─────────────────────────────────────────────────────────
-- set_session_costs(session, court, coach_fee, water)
--
-- All three every time, because the screen edits all three at once. NULL for
-- an argument means "no override" — the rate table's divided share stands —
-- which is how a coach undoes a correction, and is why this is not three
-- separate setters: "clear it" and "do not touch it" cannot be the same value.
--
-- A confirmed session is still editable, and a locked one is not, matching
-- every other write on the review screen (D39).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_session_costs(
  p_session_id      uuid,
  p_court_cost_fils integer DEFAULT NULL,
  p_coach_fee_fils  integer DEFAULT NULL,
  p_water_cost_fils integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM assert_session_unlocked(p_session_id);

  IF (p_court_cost_fils IS NOT NULL AND p_court_cost_fils < 0)
     OR (p_coach_fee_fils IS NOT NULL AND p_coach_fee_fils < 0)
     OR (p_water_cost_fils IS NOT NULL AND p_water_cost_fils < 0) THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE session_instances
  SET court_cost_override_fils = p_court_cost_fils,
      coach_fee_override_fils  = p_coach_fee_fils,
      water_cost_override_fils = p_water_cost_fils
  WHERE id = p_session_id;
END;
$$;


-- ─────────────────────────────────────────────────────────
-- add_session_extra_cost / delete_session_extra_cost
--
-- RPCs rather than direct table writes, even though the policy above would
-- allow the writes: `created_by` has to be the caller and not whoever the
-- client says, and the lock check belongs on the server for the reason D39
-- gives — a locked session accepts nothing, and a cost line is money.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_session_extra_cost(
  p_session_id  uuid,
  p_kind        session_extra_cost_kind,
  p_amount_fils integer,
  p_label       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_id    uuid;
  v_label text := NULLIF(btrim(COALESCE(p_label, '')), '');
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM assert_session_unlocked(p_session_id);

  IF p_amount_fils IS NULL OR p_amount_fils < 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  IF v_label IS NOT NULL AND char_length(v_label) > 120 THEN
    RAISE EXCEPTION 'label_too_long';
  END IF;

  INSERT INTO session_extra_costs (session_id, kind, label, amount_fils, created_by)
  VALUES (p_session_id, p_kind, v_label, p_amount_fils, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION delete_session_extra_cost(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT session_id INTO v_session_id FROM session_extra_costs WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'extra_cost_not_found'; END IF;

  PERFORM assert_session_unlocked(v_session_id);

  DELETE FROM session_extra_costs WHERE id = p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_session_costs(uuid, integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION add_session_extra_cost(uuid, session_extra_cost_kind, integer, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION delete_session_extra_cost(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION set_session_costs(uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION add_session_extra_cost(uuid, session_extra_cost_kind, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION delete_session_extra_cost(uuid) TO authenticated;


-- ─────────────────────────────────────────────────────────
-- Every consumer of the old three-column sum, rewritten onto v_session_costs.
-- ─────────────────────────────────────────────────────────

-- 0010's coach-only report view. Unchanged except for where cost_fils comes
-- from; the `WHERE is_coach()` boundary of D73/A19 is preserved verbatim.
CREATE OR REPLACE VIEW v_session_financials AS
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
  c.cost_fils,
  -- Unpaid amounts are not revenue. They are what "profit if all outstanding
  -- is collected" is built from. Section 12.3.
  COALESCE(SUM(b.expected_fils - b.paid_fils) FILTER (
    WHERE b.status IN ('confirmed','settled')), 0)::integer
    AS outstanding_fils
FROM session_instances si
JOIN v_session_costs c ON c.session_id = si.id
LEFT JOIN bookings b
  ON b.session_id = si.id
 AND b.status IN ('confirmed','settled')
LEFT JOIN credit_transactions ct ON ct.id = b.credit_txn_id
LEFT JOIN player_subscriptions ps ON ps.id = ct.subscription_id
WHERE is_coach()
GROUP BY si.id, c.cost_fils;

REVOKE ALL ON v_session_financials FROM anon;


-- 0027's review footer. Only the `cost` CTE changes.
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
    SELECT c.cost_fils AS cost FROM v_session_costs c WHERE c.session_id = p_session_id
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

REVOKE EXECUTE ON FUNCTION get_session_money_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_session_money_summary(uuid) TO authenticated;


-- 0036 section 1's totals. The signature gains `extras_fils`, which is why
-- this is a DROP and not a REPLACE: 15.12 returns the cost breakdown in parts
-- because "the coach reading a bad month wants to know which one moved", and
-- extras are the part most likely to have moved.
DROP FUNCTION IF EXISTS report_totals(date);

CREATE FUNCTION report_totals(p_month date)
RETURNS TABLE (
  cash_fils                integer,
  cliq_fils                integer,
  credit_fils              integer,
  revenue_fils             integer,
  court_cost_fils          integer,
  water_cost_fils          integer,
  coach_fee_fils           integer,
  extras_fils              integer,
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
           c.court_cost_fils, c.water_cost_fils, c.coach_fee_fils, c.extras_fils
    FROM session_instances si
    JOIN v_session_costs c ON c.session_id = si.id
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
    SELECT COALESCE(SUM(s.court_cost_fils), 0)::integer AS court,
           COALESCE(SUM(s.water_cost_fils), 0)::integer AS water,
           COALESCE(SUM(s.coach_fee_fils),  0)::integer AS coach,
           COALESCE(SUM(s.extras_fils),     0)::integer AS extras,
           COUNT(*)::integer                            AS run,
           COALESCE(SUM(s.capacity), 0)::integer        AS capacity
    FROM scoped s
  ),
  -- D17: the coach "marks each paid or unpaid". session_coaches.fee_share_fils
  -- is that coach's slice of the session's share, so the unpaid slices sum to
  -- exactly the part of coach_fee_fils that is still owed.
  --
  -- Note that an override on the coach fee does not redistribute those slices:
  -- what is still owed is what was agreed with each assistant, and the
  -- override is the coach recording what the night actually cost him. They can
  -- differ, and 12.3 already reports both numbers side by side.
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
         c.extras,
         a.unpaid,
         (c.court + c.water + c.coach + c.extras)::integer,
         -- 12.3: an unpaid assistant is an accrued cost, not cash spent.
         (c.court + c.water + c.coach + c.extras - a.unpaid)::integer,
         rv.outstanding,
         -- 12.3: session_profit = (cash + cliq + credit revenue) - session_cost
         (rv.cash + rv.cliq + rv.credit - (c.court + c.water + c.coach + c.extras))::integer,
         (rv.cash + rv.cliq + rv.credit + rv.outstanding
            - (c.court + c.water + c.coach + c.extras))::integer,
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

REVOKE EXECUTE ON FUNCTION report_totals(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION report_totals(date) TO authenticated;


-- 0036 section 4's per-session rows. Same signature; only the cost expression
-- moves onto the view.
CREATE OR REPLACE FUNCTION report_sessions(p_month date)
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
         cst.cost_fils,
         (m.collected + m.credit - cst.cost_fils)::integer,
         m.outstanding
  FROM scoped s
  JOIN venues v ON v.id = s.venue_id
  JOIN money  m ON m.id = s.id
  JOIN v_session_costs cst ON cst.session_id = s.id
  ORDER BY s.starts_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION report_sessions(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION report_sessions(date) TO authenticated;
