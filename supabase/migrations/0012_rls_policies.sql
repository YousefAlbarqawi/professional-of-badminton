-- ─────────────────────────────────────────────────────────
-- 0012  Row level security
-- BUILD-SPEC section 7.3
--
-- RLS is enabled on every table and the default is deny. Every policy below is
-- scoped TO authenticated, so the anonymous role reads nothing anywhere, which
-- is the first of the phase 1 security assertions.
--
-- "Staff" means admin or coach. An assistant_coach is not staff: per A14 he
-- sees Today and the court board and nothing else, and that read path is built
-- with the court board in phase 7.
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues               ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_night_costs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumable_costs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_fee_rates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_instances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_coaches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_sitouts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE locked_courts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────
-- A player reads his own row and no other. Names of other attendees reach him,
-- if his level permits, only through get_session_attendees.
CREATE POLICY profiles_select_self ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY profiles_select_staff ON profiles FOR SELECT TO authenticated
  USING (is_staff());
CREATE POLICY profiles_update_self ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_staff ON profiles FOR UPDATE TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());
-- Which columns he may change is trg_guard_profile's job, not a policy's.

-- ── venues ───────────────────────────────────────────────
CREATE POLICY venues_select_active ON venues FOR SELECT TO authenticated
  USING (is_active = true);
CREATE POLICY venues_staff_all ON venues FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── cost rates ───────────────────────────────────────────
-- What a night costs the coach is not a player's business.
CREATE POLICY venue_night_costs_staff_all ON venue_night_costs FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY consumable_costs_staff_all ON consumable_costs FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY coach_fee_rates_staff_all ON coach_fee_rates FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── session_templates ────────────────────────────────────
CREATE POLICY session_templates_staff_all ON session_templates FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── session_instances ────────────────────────────────────
-- The booking window is 5 days inclusive of today, so today + 4. Past sessions
-- are hidden from the schedule entirely (section 5.2).
--
-- The second disjunct is assumption A20: a player can always read a session he
-- himself has a booking on, whatever its date or status. Without it My
-- Bookings (14.9), booking detail (14.10) and the cancelled-session banner
-- (14.7) cannot render. It discloses nothing he does not already know.
CREATE POLICY session_instances_select_window ON session_instances FOR SELECT TO authenticated
  USING (
    (status <> 'cancelled'
     AND session_date >= current_date
     AND session_date <= current_date + 4)
    OR EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.session_id = session_instances.id
        AND b.player_id = auth.uid()
    )
  );
CREATE POLICY session_instances_staff_all ON session_instances FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── bookings ─────────────────────────────────────────────
-- Own rows only. There is no player INSERT policy: bookings are created by
-- create_booking, a security definer RPC, in phase 4.
CREATE POLICY bookings_select_own ON bookings FOR SELECT TO authenticated
  USING (player_id = auth.uid());
CREATE POLICY bookings_staff_all ON bookings FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── waitlist_entries ─────────────────────────────────────
CREATE POLICY waitlist_select_own ON waitlist_entries FOR SELECT TO authenticated
  USING (player_id = auth.uid());
CREATE POLICY waitlist_insert_own ON waitlist_entries FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());
CREATE POLICY waitlist_delete_own ON waitlist_entries FOR DELETE TO authenticated
  USING (player_id = auth.uid());
CREATE POLICY waitlist_staff_all ON waitlist_entries FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── payment_proofs ───────────────────────────────────────
CREATE POLICY payment_proofs_select_own ON payment_proofs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = payment_proofs.booking_id AND b.player_id = auth.uid()
  ));
CREATE POLICY payment_proofs_insert_own ON payment_proofs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.id = payment_proofs.booking_id AND b.player_id = auth.uid()
  ));
CREATE POLICY payment_proofs_staff_all ON payment_proofs FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── balance_entries ──────────────────────────────────────
-- No player policy of any kind. The player does not see what he owes. A4.
CREATE POLICY balance_entries_staff_all ON balance_entries FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── packages ─────────────────────────────────────────────
-- Readable so the subscription screen can name a package. There is no purchase
-- flow anywhere in the app.
CREATE POLICY packages_select_active ON packages FOR SELECT TO authenticated
  USING (is_active = true);
CREATE POLICY packages_staff_all ON packages FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── player_subscriptions ─────────────────────────────────
CREATE POLICY subscriptions_select_own ON player_subscriptions FOR SELECT TO authenticated
  USING (player_id = auth.uid());
CREATE POLICY subscriptions_staff_all ON player_subscriptions FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── credit_transactions ──────────────────────────────────
CREATE POLICY credit_txn_select_own ON credit_transactions FOR SELECT TO authenticated
  USING (player_id = auth.uid());
CREATE POLICY credit_txn_staff_all ON credit_transactions FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── session_coaches ──────────────────────────────────────
CREATE POLICY session_coaches_staff_all ON session_coaches FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── lineups ──────────────────────────────────────────────
-- No player sees court assignments or rotations at any visibility level. D18.
CREATE POLICY rotations_staff_all ON rotations FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY court_assignments_staff_all ON court_assignments FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY rotation_sitouts_staff_all ON rotation_sitouts FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY locked_courts_staff_all ON locked_courts FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY pairing_rules_staff_all ON pairing_rules FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── announcements ────────────────────────────────────────
CREATE POLICY announcements_select_published ON announcements FOR SELECT TO authenticated
  USING (is_deleted = false);
CREATE POLICY announcements_staff_all ON announcements FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── device_tokens ────────────────────────────────────────
CREATE POLICY device_tokens_select_own ON device_tokens FOR SELECT TO authenticated
  USING (player_id = auth.uid());
CREATE POLICY device_tokens_insert_own ON device_tokens FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());
CREATE POLICY device_tokens_update_own ON device_tokens FOR UPDATE TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());
CREATE POLICY device_tokens_staff_all ON device_tokens FOR ALL TO authenticated
  USING (is_staff()) WITH CHECK (is_staff());

-- ── audit_log ────────────────────────────────────────────
-- Coach only, and read only. Rows arrive by trigger. D73's spirit: an admin can
-- do everything the coach can do except see the books.
CREATE POLICY audit_log_select_coach ON audit_log FOR SELECT TO authenticated
  USING (is_coach());
