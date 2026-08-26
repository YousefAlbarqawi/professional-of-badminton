-- ─────────────────────────────────────────────────────────
-- 0017  Session generation, night cost allocation, state advance
-- BUILD-SPEC sections 8.1, 12.1 and 5.5
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- splitEvenly, in SQL. The remainder goes to the earliest part so a night's
-- court cost reconciles exactly across its sessions. Section 5.3.
--
--   47500 across 2 -> 23750, 23750
--   47500 across 3 -> 15834, 15833, 15833
--
-- p_index is 1-based, matching row_number(). Integer division truncates toward
-- zero, which is Math.trunc, which is what src/lib/money.ts does.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION split_share(p_total integer, p_parts integer, p_index integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_total / p_parts)
       + CASE WHEN p_index = 1
              THEN p_total - (p_total / p_parts) * p_parts
              ELSE 0 END;
$$;

-- ─────────────────────────────────────────────────────────
-- recompute_night_costs(venue, date)
-- BUILD-SPEC 12.1
--
--   sessions_that_night = sessions for (venue, date) whose status is not
--                         'cancelled'
--   court_cost_share    = splitEvenly(night court cost, sessions_that_night)
--   water_cost          = per session, by type, effective dated
--   coach_fee_total     = daily fee x distinct assistant coaches that night
--   coach_fee_share     = splitEvenly(coach_fee_total, sessions_that_night)
--
-- Two things about the divisor are deliberate. It counts every non-cancelled
-- session that night, including ones already confirmed or locked, because the
-- night's rent really was split that many ways. But only sessions still in a
-- mutable status have their snapshot rewritten: once a session is confirmed or
-- locked its costs are frozen, or every historical profit figure would drift.
--
-- Called from generate_sessions, cancel_session, update_session_instance and
-- create_one_off_session. Not a trigger: it writes to the table it reads.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_night_costs(p_venue_id uuid, p_session_date date)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_parts       integer;
  v_court_cost  integer;
  v_daily_fee   integer;
  v_coaches     integer;
  v_coach_total integer;
BEGIN
  SELECT count(*)::integer INTO v_parts
  FROM session_instances
  WHERE venue_id = p_venue_id
    AND session_date = p_session_date
    AND status <> 'cancelled';

  -- Every session that night is cancelled. Nothing left to divide anything
  -- across, and a cancelled session keeps whatever snapshot it had.
  IF v_parts = 0 THEN
    RETURN;
  END IF;

  SELECT nc.court_cost_fils INTO v_court_cost
  FROM venue_night_costs nc
  WHERE nc.venue_id = p_venue_id
    AND nc.weekday = EXTRACT(DOW FROM p_session_date)::integer
    AND nc.effective_from <= p_session_date
    AND (nc.effective_to IS NULL OR nc.effective_to > p_session_date)
  ORDER BY nc.effective_from DESC
  LIMIT 1;
  v_court_cost := COALESCE(v_court_cost, 0);

  -- D76: the fee is per day, not per session. One assistant present for both
  -- Saturday sessions at Khalda costs 10 JD, not 20, so this counts distinct
  -- coaches across the whole night and then splits the total.
  SELECT count(DISTINCT sc.coach_id)::integer INTO v_coaches
  FROM session_coaches sc
  JOIN session_instances si ON si.id = sc.session_id
  WHERE si.venue_id = p_venue_id
    AND si.session_date = p_session_date
    AND si.status <> 'cancelled';

  SELECT cf.daily_fee_fils INTO v_daily_fee
  FROM coach_fee_rates cf
  WHERE cf.effective_from <= p_session_date
    AND (cf.effective_to IS NULL OR cf.effective_to > p_session_date)
  ORDER BY cf.effective_from DESC
  LIMIT 1;

  v_coach_total := COALESCE(v_daily_fee, 0) * COALESCE(v_coaches, 0);

  WITH ordered AS (
    SELECT si.id,
           row_number() OVER (ORDER BY si.starts_at, si.id) AS rn,
           COALESCE((
             SELECT cc.water_cost_fils
             FROM consumable_costs cc
             WHERE cc.session_type = si.session_type
               AND cc.effective_from <= si.session_date
               AND (cc.effective_to IS NULL OR cc.effective_to > si.session_date)
             ORDER BY cc.effective_from DESC
             LIMIT 1
           ), 0) AS water_fils,
           COALESCE((
             SELECT count(*)::integer FROM session_coaches sc WHERE sc.session_id = si.id
           ), 0) AS coach_count
    FROM session_instances si
    WHERE si.venue_id = p_venue_id
      AND si.session_date = p_session_date
      AND si.status <> 'cancelled'
  )
  UPDATE session_instances si
  SET court_cost_share_fils = split_share(v_court_cost,  v_parts, ordered.rn::integer),
      coach_fee_share_fils  = split_share(v_coach_total, v_parts, ordered.rn::integer),
      water_cost_fils       = ordered.water_fils,
      assistant_coach_count = ordered.coach_count
  FROM ordered
  WHERE ordered.id = si.id
    AND si.status IN ('scheduled', 'in_progress', 'pending_review');
END;
$$;

-- ─────────────────────────────────────────────────────────
-- generate_sessions(days_ahead)
-- BUILD-SPEC 8.1
--
-- Generating 21 days ahead while the booking window is 5 days is deliberate:
-- it gives the coach room to edit or cancel future instances in advance.
--
-- The existence check is on (template_id, session_date) rather than 8.1's
-- (venue_id, starts_at). D7 lets the coach move a single dated instance to a
-- different time without touching the template; keyed on starts_at, the next
-- nightly run would see the template's original slot standing empty and
-- helpfully undo him. Keyed on the template and the date, his override sticks,
-- and a session he cancelled stays cancelled. The unique constraint on
-- (venue_id, starts_at) is still enforced underneath by ON CONFLICT.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_sessions(p_days_ahead integer DEFAULT 21)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_today   date := amman_today();
  v_created integer := 0;
  v_row     record;
  v_keys    text[]  := '{}';
  v_venues  uuid[]  := '{}';
  v_dates   date[]  := '{}';
  v_key     text;
  i         integer;
BEGIN
  IF p_days_ahead IS NULL OR p_days_ahead < 0 THEN
    RAISE EXCEPTION 'invalid_days_ahead';
  END IF;

  FOR v_row IN
    WITH candidate AS (
      SELECT t.id  AS template_id,
             t.venue_id,
             d::date AS session_date,
             -- Computed in Amman local time, then stored as timestamptz. 5.1.
             ((d::date + t.start_time) AT TIME ZONE 'Asia/Amman') AS starts_at,
             ((d::date + t.start_time) AT TIME ZONE 'Asia/Amman')
               + make_interval(mins => t.duration_minutes) AS ends_at,
             t.session_type,
             t.price_fils,
             t.court_count,
             t.rotation_count
      FROM session_templates t
      CROSS JOIN generate_series(
        v_today::timestamp,
        (v_today + p_days_ahead)::timestamp,
        interval '1 day'
      ) AS d
      WHERE t.is_active
        AND EXTRACT(DOW FROM d)::integer = t.weekday
        AND NOT EXISTS (
          SELECT 1 FROM session_instances si
          WHERE si.template_id = t.id
            AND si.session_date = d::date
        )
    ),
    ins AS (
      INSERT INTO session_instances (
        template_id, venue_id, session_date, starts_at, ends_at,
        session_type, price_fils, court_count, rotation_count
      )
      SELECT template_id, venue_id, session_date, starts_at, ends_at,
             session_type, price_fils, court_count, rotation_count
      FROM candidate
      ON CONFLICT (venue_id, starts_at) DO NOTHING
      RETURNING venue_id, session_date
    )
    SELECT venue_id, session_date FROM ins
  LOOP
    v_created := v_created + 1;

    v_key := v_row.venue_id::text || '|' || v_row.session_date::text;
    IF NOT (v_key = ANY (v_keys)) THEN
      v_keys   := array_append(v_keys, v_key);
      v_venues := array_append(v_venues, v_row.venue_id);
      v_dates  := array_append(v_dates, v_row.session_date);
    END IF;
  END LOOP;

  -- Step 5: one call per affected night, after every insert, so a night that
  -- gained its second session divides the court rent two ways rather than one.
  FOR i IN 1 .. COALESCE(array_length(v_venues, 1), 0) LOOP
    PERFORM recompute_night_costs(v_venues[i], v_dates[i]);
  END LOOP;

  RETURN v_created;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- advance_session_states()
-- BUILD-SPEC 5.5: "IN_PROGRESS and PENDING_REVIEW are derived from timestamps
-- by a scheduled job, not by client polling."
--
-- The ends_at guard on the first statement stops a short session that both
-- started and finished between two runs from being written twice.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION advance_session_states()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_started integer;
  v_ended   integer;
BEGIN
  UPDATE session_instances
  SET status = 'in_progress'
  WHERE status = 'scheduled'
    AND starts_at <= now()
    AND ends_at > now();
  GET DIAGNOSTICS v_started = ROW_COUNT;

  UPDATE session_instances
  SET status = 'pending_review'
  WHERE status IN ('scheduled', 'in_progress')
    AND ends_at <= now();
  GET DIAGNOSTICS v_ended = ROW_COUNT;

  RETURN v_started + v_ended;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- None of these is callable from the app. Generation and the state advance run
-- from pg_cron, and recompute_night_costs is only ever called by the staff
-- RPCs in 0018, which are security definer themselves.
-- ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION split_share(integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION recompute_night_costs(uuid, date)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION generate_sessions(integer)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION advance_session_states()               FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION recompute_night_costs(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION generate_sessions(integer)        TO service_role;
GRANT EXECUTE ON FUNCTION advance_session_states()          TO service_role;
