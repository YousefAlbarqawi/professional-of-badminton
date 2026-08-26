-- ─────────────────────────────────────────────────────────
-- 0040  One round trip for the seven gated report sections
-- OPEN-ITEMS.md, "The reports screen fires eight queries for one month"
--
-- ── What this does and does not change ────────────────────
-- `report_totals` (migration 0036) stays exactly as it is and stays the query
-- ReportsScreen runs alone: it is D73's refusal gate, and an admin must still
-- generate exactly one `not_authorized` rather than two. Everything after it —
-- 15.12 sections 1's weekly bars, 4, 5, 6, 7, 8 and 9 — was seven separate
-- RPCs fired together the moment the gate opened; this adds one more function,
-- `report_sections`, that calls all seven itself and hands back one jsonb
-- document, so the round trip count for a month the coach has not looked at
-- yet goes from up to eight requests to at most two.
--
-- The seven functions this wraps are untouched and still directly callable —
-- deleting them would be a second, unrelated migration, and BUILD-SPEC 15.12
-- names each of them individually. `report_sections` only composes what they
-- already return; it holds no logic of its own about revenue, cost or fill.
--
-- ── Why jsonb and not a wider TABLE ────────────────────────
-- The seven results are not the same shape: one is a set of weeks, one a set
-- of sessions, two are single summary rows. A `TABLE` return has to pick one
-- row shape; `jsonb_build_object` does not, and PostgREST hands the whole
-- object back as one column. `src/features/reports/api.ts`'s `fetchReportSections`
-- is what turns it back into the seven typed shapes the panels already expect
-- — the trade the OPEN-ITEMS note called "eight typed row shapes for one
-- untyped blob" happens once, at that one boundary, and nowhere past it.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION report_sections(p_month date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT jsonb_build_object(
    'weeks',         COALESCE((SELECT jsonb_agg(to_jsonb(w)) FROM report_revenue_by_week(p_month) w), '[]'::jsonb),
    'sessions',       COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM report_session_table(p_month)   s), '[]'::jsonb),
    'slots',          COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM report_slot_attendance(p_month) l), '[]'::jsonb),
    'venues',         COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM report_venue_fill(p_month)      v), '[]'::jsonb),
    'subscriptions',  (SELECT to_jsonb(u) FROM report_subscriptions(p_month) u),
    'outstanding',    COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM report_outstanding(p_month)     o), '[]'::jsonb),
    'players',        (SELECT to_jsonb(p) FROM report_players(p_month) p)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION report_sections(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION report_sections(date) TO authenticated;
