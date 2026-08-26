-- ═════════════════════════════════════════════════════════
-- SEED DATA
-- BUILD-SPEC section 22
--
-- Part 1 is reference data and is safe to run against prod: venues,
-- templates, cost rates, packages.
--
-- Part 2 is dev-only fixture data: accounts, players, subscriptions, and two
-- months of past sessions. It creates auth.users rows directly and must never
-- be run against pob-prod.
-- ═════════════════════════════════════════════════════════


-- ═════════════════════════════════════════════════════════
-- PART 1 — REFERENCE DATA (dev and prod)
-- ═════════════════════════════════════════════════════════

-- ── Venues (D1, D2: Dunes Club does not exist) ───────────
INSERT INTO venues (id, name_en, name_ar, area_en, area_ar, court_count, display_order) VALUES
('11111111-1111-4111-8111-000000000001',
 'International Independent Schools', 'مدارس الاستقلالية الدولية',
 'Khalda', 'خلدا', 4, 1),
('11111111-1111-4111-8111-000000000002',
 'Al-Ra''ed Al-Arabi School', 'مدرسة الرائد العربي',
 'Shmeisani', 'الشميساني', 3, 2);

-- ── Templates: the twelve rows of section 3.1 ────────────
-- Weekday integers match Postgres EXTRACT(DOW): Sunday 0 … Saturday 6.
INSERT INTO session_templates
  (venue_id, weekday, start_time, duration_minutes, session_type, price_fils, court_count, rotation_count)
VALUES
  -- Khalda, 4 courts
  ('11111111-1111-4111-8111-000000000001', 6, '19:00',  90, 'standard', 6000, 4, 4),
  ('11111111-1111-4111-8111-000000000001', 6, '20:30',  90, 'standard', 6000, 4, 4),
  ('11111111-1111-4111-8111-000000000001', 1, '18:30', 150, 'extended', 8000, 4, 6),
  ('11111111-1111-4111-8111-000000000001', 4, '19:00',  90, 'standard', 6000, 4, 4),
  ('11111111-1111-4111-8111-000000000001', 4, '20:30',  90, 'standard', 6000, 4, 4),
  ('11111111-1111-4111-8111-000000000001', 5, '20:30',  90, 'standard', 6000, 4, 4),
  -- Shmeisani, 3 courts
  ('11111111-1111-4111-8111-000000000002', 0, '19:30',  90, 'standard', 6000, 3, 4),
  ('11111111-1111-4111-8111-000000000002', 0, '21:00',  90, 'standard', 6000, 3, 4),
  ('11111111-1111-4111-8111-000000000002', 2, '20:30', 150, 'extended', 8000, 3, 6),
  ('11111111-1111-4111-8111-000000000002', 3, '19:30',  90, 'standard', 6000, 3, 4),
  ('11111111-1111-4111-8111-000000000002', 3, '21:00',  90, 'standard', 6000, 3, 4),
  ('11111111-1111-4111-8111-000000000002', 5, '19:00',  90, 'standard', 6000, 3, 4);

-- ── Night court costs, effective 2026-08-01 ──────────────
INSERT INTO venue_night_costs (venue_id, weekday, court_cost_fils, effective_from) VALUES
  ('11111111-1111-4111-8111-000000000001', 6, 60000, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000001', 1, 50000, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000001', 4, 60000, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000001', 5, 30000, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000002', 0, 47500, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000002', 2, 35000, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000002', 3, 47500, '2026-08-01'),
  ('11111111-1111-4111-8111-000000000002', 5, 22500, '2026-08-01');

-- ── Water, per session. D75. ─────────────────────────────
INSERT INTO consumable_costs (session_type, water_cost_fils, effective_from) VALUES
  ('standard', 1250, '2026-08-01'),
  ('extended', 2500, '2026-08-01');

-- ── Assistant coach fee, per day not per session. D76. ───
INSERT INTO coach_fee_rates (daily_fee_fils, effective_from) VALUES
  (10000, '2026-08-01');

-- ── Packages. D48 and section 11.1. ──────────────────────
-- per_visit_fils is generated: 5000, 4667, 4500, 4167, 4000.
INSERT INTO packages (name_en, name_ar, visit_count, price_fils, duration_months, display_order) VALUES
  ('8 visits, 1 month',   '٨ زيارات، شهر',        8,  40000, 1, 1),
  ('15 visits, 1 month',  '١٥ زيارة، شهر',       15,  70000, 1, 2),
  ('20 visits, 2 months', '٢٠ زيارة، شهران',     20,  90000, 2, 3),
  ('30 visits, 2 months', '٣٠ زيارة، شهران',     30, 125000, 2, 4),
  ('40 visits, 3 months', '٤٠ زيارة، ٣ أشهر',    40, 160000, 3, 5);


-- ═════════════════════════════════════════════════════════
-- PART 2 — DEV ONLY FIXTURES
--
-- Never run against pob-prod. Creates auth.users rows directly, with a shared
-- password so that integration tests can sign in as each role.
--
--   coach@pob.test        coach
--   admin1@pob.test       admin
--   admin2@pob.test       admin
--   assistant@pob.test    assistant_coach
--   player001@pob.test …  player040@pob.test
--
--   password for every one of them: password123
--
-- player001 is level_0, player002 is level_1, player003 is level_2. The
-- security tests depend on those three.
-- ═════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- One DO block, deliberately. The Supabase CLI pipelines a seed file: every
-- statement is parsed before any of them executes, so a helper function
-- created in this file cannot be called from it. Everything that needs to
-- resolve at run time lives inside a block body instead.
DO $users$
DECLARE
  v_tiers tier[] := ARRAY[
    'A+',                                          -- 1
    'A','A',                                       -- 2
    'A-','A-','A-',                                -- 3
    'B+','B+','B+','B+','B+',                      -- 5
    'B','B','B','B','B','B','B',                   -- 7
    'B-','B-','B-','B-','B-','B-',                 -- 6
    'C+','C+','C+','C+','C+',                      -- 5
    'C','C','C','C',                               -- 4
    'C-','C-','C-',                                -- 3
    NULL, NULL, NULL, NULL                         -- 4 unrated
  ]::tier[];
  u          record;
  i          integer;
BEGIN
  FOR u IN
    -- Staff first, then the 40 players. Tier distribution is weighted to B and
    -- C, as the academy actually is, with four unrated players so the A11 path
    -- has fixtures. Default visibility is level_0 (D14); player002 and
    -- player003 are raised so every branch of get_session_attendees has a
    -- caller. A handful carry custom rates, including one at zero (D41, A5).
    SELECT * FROM (
      SELECT '44444444-4444-4444-8444-000000000001'::uuid AS id, 'coach@pob.test' AS email,
             'Yousef' AS first_name, 'Al-Khatib' AS last_name, '+962792841696' AS phone,
             'coach'::user_role AS role, 'level_2'::visibility_level AS visibility,
             'A+'::tier AS tier, NULL::integer AS rate_std, NULL::integer AS rate_ext
      UNION ALL SELECT '44444444-4444-4444-8444-000000000002', 'admin1@pob.test',
             'Rana', 'Haddad', '+962790000002', 'admin', 'level_2', 'B+', NULL, NULL
      UNION ALL SELECT '44444444-4444-4444-8444-000000000003', 'admin2@pob.test',
             'Omar', 'Shaheen', '+962790000003', 'admin', 'level_2', 'B', NULL, NULL
      UNION ALL SELECT '44444444-4444-4444-8444-000000000004', 'assistant@pob.test',
             'Bashar', 'Nimri', '+962790000004', 'assistant_coach', 'level_1', 'A', NULL, NULL
      UNION ALL
      SELECT ('33333333-3333-4333-8333-' || lpad(n::text, 12, '0'))::uuid,
             'player' || lpad(n::text, 3, '0') || '@pob.test',
             'Player',
             'Number' || lpad(n::text, 3, '0'),
             '+96279' || lpad(n::text, 7, '0'),
             'player'::user_role,
             (CASE
                WHEN n IN (2, 11, 19) THEN 'level_1'
                WHEN n IN (3, 12, 25) THEN 'level_2'
                ELSE 'level_0'
              END)::visibility_level,
             v_tiers[n],
             (CASE n WHEN 4 THEN 4000 WHEN 5 THEN 0 WHEN 6 THEN 5000 ELSE NULL END),
             (CASE n WHEN 4 THEN 6000 WHEN 5 THEN 0 ELSE NULL END)
      FROM generate_series(1, 40) AS n
    ) AS all_users
  LOOP
    -- The four token columns are empty strings rather than NULL on purpose.
    -- GoTrue scans them into a non-nullable Go string, and a NULL there makes
    -- every sign-in fail with "Database error querying schema".
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, extensions.crypt('password123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name),
      '', '', '', '',
      now(), now()
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );

    INSERT INTO profiles (
      id, first_name, last_name, phone, role, visibility, tier,
      custom_rate_standard_fils, custom_rate_extended_fils, preferred_locale
    ) VALUES (
      u.id, u.first_name, u.last_name, u.phone, u.role, u.visibility, u.tier,
      u.rate_std, u.rate_ext, 'ar'
    );
  END LOOP;
END;
$users$;


-- ── Subscriptions, five players at various depletion ─────
-- player001 carries the documented migration flow from section 11.3: grant the
-- full 40-visit package, then adjust by −13 with a note. The history explains
-- itself forever and the balance reads 27.
DO $subs$
DECLARE
  v_coach uuid := '44444444-4444-4444-8444-000000000001';
  r       record;
  v_sub   uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1,  40, (amman_today() - 20)::date, (amman_today() + 70)::date),
      (7,   8, (amman_today() - 20)::date, (amman_today() + 10)::date),
      (8,  15, (amman_today() - 25)::date, (amman_today() +  5)::date),
      (9,  20, (amman_today() - 30)::date, (amman_today() + 30)::date),
      (10, 30, (amman_today() - 55)::date, (amman_today() +  5)::date)
    ) AS v(player_index, visits, starts_on, expires_on)
  LOOP
    INSERT INTO player_subscriptions
      (player_id, package_id, granted_visits, per_visit_fils, starts_on, expires_on, granted_by, note)
    SELECT
      ('33333333-3333-4333-8333-' || lpad(r.player_index::text, 12, '0'))::uuid,
      p.id, r.visits, p.per_visit_fils, r.starts_on, r.expires_on, v_coach,
      'Seeded fixture'
    FROM packages p WHERE p.visit_count = r.visits
    RETURNING id INTO v_sub;

    INSERT INTO credit_transactions
      (subscription_id, player_id, delta, reason, created_by, created_at)
    VALUES
      (v_sub,
       ('33333333-3333-4333-8333-' || lpad(r.player_index::text, 12, '0'))::uuid,
       r.visits, 'grant', v_coach, r.starts_on::timestamptz);
  END LOOP;

  -- Section 11.3, verbatim: "grant the full 40 visit package, then adjust by
  -- −13 with the note 'used before the app'".
  INSERT INTO credit_transactions
    (subscription_id, player_id, delta, reason, note, created_by)
  SELECT s.id, s.player_id, -13, 'manual_adjustment', 'used before the app', v_coach
  FROM player_subscriptions s
  WHERE s.player_id = '33333333-3333-4333-8333-000000000001';
END;
$subs$;


-- ── Dev-only historical cost rates ───────────────────────
-- The reference rows above are effective 2026-08-01. Two months of fixture
-- history predates that, so without an earlier band those sessions would carry
-- a zero cost and every seeded profit figure would be wrong. Dev only.
INSERT INTO venue_night_costs (venue_id, weekday, court_cost_fils, effective_from, effective_to)
SELECT venue_id, weekday, court_cost_fils,
       LEAST(amman_today() - 90, DATE '2026-07-31'), DATE '2026-08-01'
FROM venue_night_costs
WHERE effective_from = DATE '2026-08-01';

INSERT INTO consumable_costs (session_type, water_cost_fils, effective_from, effective_to)
VALUES ('standard', 1250, LEAST(amman_today() - 90, DATE '2026-07-31'), DATE '2026-08-01'),
       ('extended', 2500, LEAST(amman_today() - 90, DATE '2026-07-31'), DATE '2026-08-01');

INSERT INTO coach_fee_rates (daily_fee_fils, effective_from, effective_to)
VALUES (10000, LEAST(amman_today() - 90, DATE '2026-07-31'), DATE '2026-08-01');


-- ── Sessions: 60 days back, 21 days forward ──────────────
-- Dates throughout this file are amman_today(), never current_date. A31:
-- current_date reads the database session's timezone, which on Supabase is
-- UTC, so between 00:00 and 03:00 Amman it returns yesterday. The seed used to
-- use it, which put its forward window a day behind generate_sessions(21) for
-- those three hours every night — and `generateSessions.test.ts` asserts that
-- running generation over a seeded window creates nothing.
-- Forward 21 days mirrors what generate_sessions(21) will do in phase 3, and
-- gives the RLS tests both in-window and out-of-window rows to assert on.
DO $sessions$
DECLARE
  d        date;
  t        record;
  v_starts timestamptz;
  v_ends   timestamptz;
  v_status session_status;
  v_coach  uuid := '44444444-4444-4444-8444-000000000001';
BEGIN
  FOR d IN SELECT generate_series(amman_today() - 60, amman_today() + 21, interval '1 day')::date
  LOOP
    FOR t IN
      SELECT * FROM session_templates
      WHERE is_active AND weekday = EXTRACT(DOW FROM d)::integer
      ORDER BY start_time
    LOOP
      -- Computed in Amman local time, then stored as timestamptz. Section 5.1.
      v_starts := (d::timestamp + t.start_time) AT TIME ZONE 'Asia/Amman';
      v_ends   := v_starts + make_interval(mins => t.duration_minutes);

      v_status := CASE
        WHEN v_ends < now() - interval '7 days'  THEN 'locked'
        WHEN v_ends < now() - interval '2 days'  THEN 'confirmed'
        WHEN v_ends < now()                      THEN 'pending_review'
        WHEN v_starts <= now()                   THEN 'in_progress'
        ELSE 'scheduled'
      END::session_status;

      INSERT INTO session_instances (
        template_id, venue_id, session_date, starts_at, ends_at, session_type,
        price_fils, court_count, rotation_count, status,
        reviewed_at, reviewed_by, locked_at
      ) VALUES (
        t.id, t.venue_id, d, v_starts, v_ends, t.session_type,
        t.price_fils, t.court_count, t.rotation_count, v_status,
        CASE WHEN v_status IN ('confirmed','locked') THEN v_ends + interval '1 day' END,
        CASE WHEN v_status IN ('confirmed','locked') THEN v_coach END,
        CASE WHEN v_status = 'locked' THEN v_ends + interval '7 days' END
      )
      ON CONFLICT (venue_id, starts_at) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$sessions$;


-- ── Assistant coach on Khalda Saturdays ──────────────────
-- One assistant present for both Saturday sessions costs 10 JD for the night,
-- not 20. D76. night_key is venue_id || session_date.
INSERT INTO session_coaches (session_id, coach_id, night_key, is_paid, added_by)
SELECT si.id,
       '44444444-4444-4444-8444-000000000004',
       si.venue_id::text || si.session_date::text,
       si.session_date < amman_today(),          -- past nights already settled
       '44444444-4444-4444-8444-000000000001'
FROM session_instances si
WHERE si.venue_id = '11111111-1111-4111-8111-000000000001'
  AND EXTRACT(DOW FROM si.session_date) = 6
  AND si.status <> 'cancelled';

UPDATE session_instances si
SET assistant_coach_count = sub.n
FROM (SELECT session_id, count(*) AS n FROM session_coaches GROUP BY session_id) sub
WHERE sub.session_id = si.id;


-- ── Cost snapshots ───────────────────────────────────────
-- Court cost splits evenly across that night's sessions with the remainder to
-- the earliest, exactly as splitEvenly does on the client. Section 12.1.
WITH nightly AS (
  SELECT si.id,
         row_number() OVER (PARTITION BY si.venue_id, si.session_date ORDER BY si.starts_at) AS rn,
         count(*)     OVER (PARTITION BY si.venue_id, si.session_date) AS n,
         nc.court_cost_fils,
         cc.water_cost_fils,
         COALESCE(cf.daily_fee_fils, 0) * COALESCE(sc.coaches_that_night, 0) AS coach_fee_total
  FROM session_instances si
  JOIN venue_night_costs nc
    ON nc.venue_id = si.venue_id
   AND nc.weekday  = EXTRACT(DOW FROM si.session_date)::integer
   AND nc.effective_from <= si.session_date
   AND (nc.effective_to IS NULL OR nc.effective_to > si.session_date)
  JOIN consumable_costs cc
    ON cc.session_type = si.session_type
   AND cc.effective_from <= si.session_date
   AND (cc.effective_to IS NULL OR cc.effective_to > si.session_date)
  LEFT JOIN coach_fee_rates cf
    ON cf.effective_from <= si.session_date
   AND (cf.effective_to IS NULL OR cf.effective_to > si.session_date)
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT sc2.coach_id) AS coaches_that_night
    FROM session_coaches sc2
    JOIN session_instances si2 ON si2.id = sc2.session_id
    WHERE si2.venue_id = si.venue_id AND si2.session_date = si.session_date
  ) sc ON true
  WHERE si.status <> 'cancelled'
)
UPDATE session_instances si
SET court_cost_share_fils =
      (nightly.court_cost_fils / nightly.n)
      + CASE WHEN nightly.rn = 1
             THEN nightly.court_cost_fils - (nightly.court_cost_fils / nightly.n) * nightly.n
             ELSE 0 END,
    water_cost_fils = nightly.water_cost_fils,
    coach_fee_share_fils =
      (nightly.coach_fee_total / nightly.n)
      + CASE WHEN nightly.rn = 1
             THEN nightly.coach_fee_total - (nightly.coach_fee_total / nightly.n) * nightly.n
             ELSE 0 END
FROM nightly
WHERE nightly.id = si.id;

UPDATE session_coaches sc
SET fee_share_fils = si.coach_fee_share_fils
FROM session_instances si
WHERE si.id = sc.session_id;


-- ── Two months of past bookings, mixed payment outcomes ──
-- Seeded RNG so a reset reproduces the same fixtures.
DO $bookings$
DECLARE
  v_coach    uuid := '44444444-4444-4444-8444-000000000001';
  s          record;
  p          record;
  v_n        integer;
  v_expected integer;
  v_method   payment_method;
  v_paid     integer;
  v_pstatus  payment_status;
  v_bstatus  booking_status;
  v_booking  uuid;
  v_sub      uuid;
  v_txn      uuid;
  v_roll     numeric;
BEGIN
  PERFORM setseed(0.42);

  FOR s IN
    SELECT * FROM session_instances
    WHERE session_date < amman_today() AND template_id IS NOT NULL
    ORDER BY starts_at
  LOOP
    v_bstatus := CASE WHEN s.status = 'pending_review' THEN 'confirmed' ELSE 'settled' END::booking_status;
    v_n := 5 + floor(random() * (s.capacity - 5))::integer;

    FOR p IN
      SELECT id, tier, custom_rate_standard_fils, custom_rate_extended_fils
      FROM profiles WHERE role = 'player'
      ORDER BY random() LIMIT v_n
    LOOP
      v_expected := COALESCE(
        CASE WHEN s.session_type = 'standard'
             THEN p.custom_rate_standard_fils
             ELSE p.custom_rate_extended_fils END,
        s.price_fils);

      -- Nearest expiry first, and only where the ledger still has a credit.
      -- player001 is left out of credit bookings on purpose: his ledger has to
      -- read as the section 11.3 migration example and nothing else, grant 40
      -- then adjust -13, balance 27.
      SELECT sub.id INTO v_sub
      FROM player_subscriptions sub
      WHERE sub.player_id = p.id
        AND sub.player_id <> '33333333-3333-4333-8333-000000000001'
        AND sub.is_voided = false
        AND sub.starts_on <= s.session_date
        AND sub.expires_on >= s.session_date
        AND (SELECT COALESCE(SUM(ct.delta),0) FROM credit_transactions ct
             WHERE ct.subscription_id = sub.id) > 0
      ORDER BY sub.expires_on, sub.created_at
      LIMIT 1;

      v_roll := random();
      v_method := CASE
        WHEN v_sub IS NOT NULL AND v_roll < 0.30 THEN 'credit'
        WHEN v_roll < 0.75 THEN 'cash'
        ELSE 'cliq'
      END::payment_method;

      IF v_method = 'credit' THEN
        v_expected := 0;
        v_paid     := 0;
        v_pstatus  := 'paid';
      ELSIF v_expected = 0 THEN
        -- A 0 JD custom rate consumes a slot and contributes no revenue. 12.2.
        v_paid    := 0;
        v_pstatus := 'waived';
      ELSE
        v_roll := random();
        IF v_roll < 0.75 THEN
          v_paid := v_expected; v_pstatus := 'paid';
        ELSIF v_roll < 0.90 THEN
          v_paid := (v_expected / 2); v_pstatus := 'partial';
        ELSE
          v_paid := 0; v_pstatus := 'unpaid';
        END IF;
      END IF;

      INSERT INTO bookings (
        session_id, attendee_kind, player_id, tier_snapshot, status, source,
        payment_method, payment_status, expected_fils, paid_fils,
        booked_at, settled_at, created_by
      ) VALUES (
        s.id, 'player', p.id, p.tier, v_bstatus, 'self',
        v_method, v_pstatus, v_expected, v_paid,
        s.starts_at - interval '2 days',
        CASE WHEN v_bstatus = 'settled' THEN s.ends_at + interval '1 day' END,
        p.id
      ) RETURNING id INTO v_booking;

      IF v_method = 'credit' THEN
        INSERT INTO credit_transactions
          (subscription_id, player_id, delta, reason, booking_id, created_by, created_at)
        VALUES (v_sub, p.id, -1, 'booking', v_booking, p.id, s.starts_at - interval '2 days')
        RETURNING id INTO v_txn;
        UPDATE bookings SET credit_txn_id = v_txn WHERE id = v_booking;
      END IF;

      -- 10.1: a booking must never exist with payment_method = 'cliq' and no
      -- proof row, and migration 0025's deferred trigger holds the seed to
      -- that as firmly as it holds the app. The object itself is not seeded —
      -- there is no screenshot to invent — so these rows point at the path
      -- 10.1 specifies for a proof that was purged, which after two months of
      -- history is the honest state anyway (A13).
      IF v_method = 'cliq' THEN
        INSERT INTO payment_proofs
          (booking_id, storage_path, file_size_bytes, mime_type, uploaded_at)
        VALUES (v_booking, p.id::text || '/' || v_booking::text || '.jpg',
                180000, 'image/jpeg', s.starts_at - interval '2 days');
      END IF;

      -- A balance entry is created only by record_payment, from the review
      -- screen, and only for money not received. Section 10.3.
      IF v_pstatus IN ('partial','unpaid') THEN
        INSERT INTO balance_entries
          (player_id, booking_id, session_id, amount_fils, note, created_by, created_at)
        VALUES (p.id, v_booking, s.id, v_expected - v_paid,
                'Seeded fixture', v_coach, s.ends_at + interval '1 day');
      END IF;
    END LOOP;

    -- A guest here and there. Name and tier only, never remembered. D44, D46.
    IF random() < 0.2 THEN
      INSERT INTO bookings (
        session_id, attendee_kind, guest_name, guest_tier, tier_snapshot,
        status, source, payment_method, payment_status,
        expected_fils, paid_fils, booked_at, settled_at, created_by
      ) VALUES (
        s.id, 'guest', 'Guest ' || substr(s.id::text, 1, 4), 'B', 'B',
        v_bstatus, 'admin_added',
        CASE WHEN random() < 0.5 THEN 'cash' ELSE 'free' END::payment_method,
        'paid', s.price_fils, s.price_fils,
        s.starts_at - interval '1 hour',
        CASE WHEN v_bstatus = 'settled' THEN s.ends_at + interval '1 day' END,
        v_coach
      );
    END IF;
  END LOOP;
END;
$bookings$;

-- Free guests contribute no revenue. Fix up the rows that drew 'free'.
UPDATE bookings
SET expected_fils = 0, paid_fils = 0, payment_status = 'waived'
WHERE payment_method = 'free';


-- ═════════════════════════════════════════════════════════
-- Deterministic fixtures for the phase 1 security tests
--
-- Fixed ids, fixed attendees, fixed dates relative to today, all at 17:00 so
-- they can never collide with a generated template session. Cost snapshots are
-- written by hand because these sessions sit outside the nightly split.
-- ═════════════════════════════════════════════════════════

INSERT INTO session_instances (
  id, template_id, venue_id, session_date, starts_at, ends_at, session_type,
  price_fils, court_count, rotation_count, status,
  court_cost_share_fils, water_cost_fils, coach_fee_share_fils,
  cancelled_at, cancelled_by, cancellation_note, reviewed_at, reviewed_by
) VALUES
  -- F1  in the booking window, open, six attendees
  ('22222222-2222-4222-8222-000000000001', NULL,
   '11111111-1111-4111-8111-000000000001', amman_today() + 1,
   ((amman_today() + 1)::timestamp + time '17:00') AT TIME ZONE 'Asia/Amman',
   ((amman_today() + 1)::timestamp + time '18:30') AT TIME ZONE 'Asia/Amman',
   'standard', 6000, 4, 4, 'scheduled', 30000, 1250, 0,
   NULL, NULL, NULL, NULL, NULL),

  -- F2  beyond the 5 day window, so invisible to a player
  ('22222222-2222-4222-8222-000000000002', NULL,
   '11111111-1111-4111-8111-000000000001', amman_today() + 10,
   ((amman_today() + 10)::timestamp + time '17:00') AT TIME ZONE 'Asia/Amman',
   ((amman_today() + 10)::timestamp + time '18:30') AT TIME ZONE 'Asia/Amman',
   'standard', 6000, 4, 4, 'scheduled', 30000, 1250, 0,
   NULL, NULL, NULL, NULL, NULL),

  -- F3  inside the window but cancelled, and nobody booked on it
  ('22222222-2222-4222-8222-000000000003', NULL,
   '11111111-1111-4111-8111-000000000001', amman_today() + 2,
   ((amman_today() + 2)::timestamp + time '17:00') AT TIME ZONE 'Asia/Amman',
   ((amman_today() + 2)::timestamp + time '18:30') AT TIME ZONE 'Asia/Amman',
   'standard', 6000, 4, 4, 'cancelled', 0, 0, 0,
   now(), '44444444-4444-4444-8444-000000000001', 'Hall unavailable', NULL, NULL),

  -- F4  in the past, and player001 has a booking on it. A20.
  ('22222222-2222-4222-8222-000000000004', NULL,
   '11111111-1111-4111-8111-000000000001', amman_today() - 3,
   ((amman_today() - 3)::timestamp + time '17:00') AT TIME ZONE 'Asia/Amman',
   ((amman_today() - 3)::timestamp + time '18:30') AT TIME ZONE 'Asia/Amman',
   'standard', 6000, 4, 4, 'confirmed', 30000, 1250, 0,
   NULL, NULL, NULL, now() - interval '2 days', '44444444-4444-4444-8444-000000000001');

-- F1 attendees, in booking order. Five players and one guest.
INSERT INTO bookings (
  id, session_id, attendee_kind, player_id, guest_name, guest_tier, tier_snapshot,
  status, source, payment_method, payment_status, expected_fils, paid_fils,
  booked_at, created_by
) VALUES
  ('55555555-5555-4555-8555-000000000001', '22222222-2222-4222-8222-000000000001',
   'player', '33333333-3333-4333-8333-000000000001', NULL, NULL, 'A+',
   'confirmed', 'self', 'cash', 'unpaid', 6000, 0, now() - interval '5 hours',
   '33333333-3333-4333-8333-000000000001'),

  ('55555555-5555-4555-8555-000000000002', '22222222-2222-4222-8222-000000000001',
   'player', '33333333-3333-4333-8333-000000000002', NULL, NULL, 'A',
   'confirmed', 'self', 'cash', 'unpaid', 6000, 0, now() - interval '4 hours',
   '33333333-3333-4333-8333-000000000002'),

  ('55555555-5555-4555-8555-000000000003', '22222222-2222-4222-8222-000000000001',
   'player', '33333333-3333-4333-8333-000000000003', NULL, NULL, 'A',
   'confirmed', 'self', 'cash', 'unpaid', 6000, 0, now() - interval '3 hours',
   '33333333-3333-4333-8333-000000000003'),

  -- CliQ, so payment_proofs has a row belonging to somebody other than player001
  ('55555555-5555-4555-8555-000000000004', '22222222-2222-4222-8222-000000000001',
   'player', '33333333-3333-4333-8333-000000000004', NULL, NULL, 'A-',
   'confirmed', 'self', 'cliq', 'unpaid', 4000, 0, now() - interval '2 hours',
   '33333333-3333-4333-8333-000000000004'),

  -- Custom rate of zero: takes a slot, contributes nothing. D41, 12.2 rule 2.
  ('55555555-5555-4555-8555-000000000005', '22222222-2222-4222-8222-000000000001',
   'player', '33333333-3333-4333-8333-000000000005', NULL, NULL, 'A-',
   'confirmed', 'self', 'cash', 'waived', 0, 0, now() - interval '1 hour',
   '33333333-3333-4333-8333-000000000005'),

  ('55555555-5555-4555-8555-000000000006', '22222222-2222-4222-8222-000000000001',
   'guest', NULL, 'Sami the Guest', 'B', NULL,
   'confirmed', 'admin_added', 'cash', 'unpaid', 6000, 0, now() - interval '30 minutes',
   '44444444-4444-4444-8444-000000000001'),

  -- F4, in the past. This is the only reason player001 can read that session.
  ('55555555-5555-4555-8555-000000000007', '22222222-2222-4222-8222-000000000004',
   'player', '33333333-3333-4333-8333-000000000001', NULL, NULL, 'A+',
   'settled', 'self', 'cash', 'paid', 6000, 6000, now() - interval '5 days',
   '33333333-3333-4333-8333-000000000001');

INSERT INTO payment_proofs (booking_id, storage_path, file_size_bytes, mime_type) VALUES
  ('55555555-5555-4555-8555-000000000004',
   '33333333-3333-4333-8333-000000000004/55555555-5555-4555-8555-000000000004.jpg',
   184320, 'image/jpeg');

-- player006 waits on F1, so the waitlist policy has somebody else's row to hide.
INSERT INTO waitlist_entries (session_id, player_id) VALUES
  ('22222222-2222-4222-8222-000000000001', '33333333-3333-4333-8333-000000000006');

-- A lineup on F4, so "no player sees court assignments at any level" (D18) is
-- tested against real rows rather than an empty table.
INSERT INTO rotations (id, session_id, rotation_index, rule) VALUES
  ('66666666-6666-4666-8666-000000000001',
   '22222222-2222-4222-8222-000000000004', 1, 'rule_1_similar');

INSERT INTO court_assignments (rotation_id, court_number, booking_id, team) VALUES
  ('66666666-6666-4666-8666-000000000001', 1, '55555555-5555-4555-8555-000000000007', 1);

INSERT INTO pairing_rules (kind, player_a_id, player_b_id, created_by) VALUES
  ('never_pair',
   '33333333-3333-4333-8333-000000000001',
   '33333333-3333-4333-8333-000000000002',
   '44444444-4444-4444-8444-000000000001');

INSERT INTO announcements (body, language, author_id, published_at, push_sent_at, is_deleted) VALUES
  ('لا يوجد تدريب يوم الجمعة القادم. نراكم يوم السبت.', 'ar',
   '44444444-4444-4444-8444-000000000001', now() - interval '2 days', now() - interval '2 days', false),
  ('New Monday extended session starts next week.', 'en',
   '44444444-4444-4444-8444-000000000001', now() - interval '9 days', now() - interval '9 days', false),
  ('Draft that was pulled.', 'en',
   '44444444-4444-4444-8444-000000000001', now() - interval '20 days', NULL, true);

INSERT INTO device_tokens (player_id, token, platform, locale) VALUES
  ('33333333-3333-4333-8333-000000000001', 'ExponentPushToken[player001-fixture]', 'ios', 'ar'),
  ('33333333-3333-4333-8333-000000000002', 'ExponentPushToken[player002-fixture]', 'android', 'en');

-- A manual balance entry that is not tied to any booking, so the coach-only
-- balance policy is tested against more than the generated ones.
INSERT INTO balance_entries (player_id, amount_fils, note, created_by) VALUES
  ('33333333-3333-4333-8333-000000000001', 12000, 'Two sessions from before the app',
   '44444444-4444-4444-8444-000000000001');

