-- ─────────────────────────────────────────────────────────
-- 0024  The coach adds people
-- BUILD-SPEC 15.2, D22, D42 to D47
--
-- Three ways in, and they are deliberately different from one another:
--
--   a registered player   D42, D43 — credit if he has one, otherwise cash
--                                    marked paid, editable during review
--   a guest               D44, D45, D46 — name and tier only, paid or free,
--                                    never remembered
--   an assistant coach    D17, D47 — occupies a court slot, pays nothing,
--                                    and costs 10 JD for the night
--
-- D22 governs all three: the coach can add people manually at any time,
-- including after the cutoff and during the session. So none of these checks a
-- booking window. What none of them may do is oversell — D30, capacity is
-- hard, no overselling under any circumstance — so all three take the same
-- FOR UPDATE lock and count that create_booking does.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- assert_session_addable(session) -> the locked session row
--
-- The three add functions share a preamble. Written once so that a rule
-- changed in one place is changed everywhere, and so the lock is never
-- forgotten in one of the three.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_session_addable(p_session_id uuid)
RETURNS session_instances
LANGUAGE plpgsql
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
  v_taken   integer;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_session FROM session_instances
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- D39: locked is permanent, no edits ever. A cancelled session has nobody to
  -- add anybody to.
  IF v_session.status = 'locked'    THEN RAISE EXCEPTION 'session_locked';   END IF;
  IF v_session.status = 'cancelled' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RAISE EXCEPTION 'session_full'; END IF;

  RETURN v_session;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- search_players_for_session(query, session)
-- BUILD-SPEC 15.2, "Add player"
--
-- "A search field over registered players, minimum 2 characters, pg_trgm
-- matching on the full name, results showing name, tier, and credit balance."
-- Plus the blocked case: "Blocked if he is already booked, with the reason
-- shown", which is why is_booked comes back rather than the row being hidden.
--
-- ILIKE alongside similarity because trigram similarity on a two or three
-- character query is close to nothing, and the coach types the first few
-- letters of a first name. The trigram index earns its place on the longer
-- queries and on misspellings.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_players_for_session(p_query text, p_session_id uuid)
RETURNS TABLE (
  player_id      uuid,
  display_name   text,
  tier           tier,
  credits        integer,
  credit_expires date,
  is_booked      boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_query text := trim(COALESCE(p_query, ''));
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF length(v_query) < 2 THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.id,
         p.first_name || ' ' || p.last_name,
         p.tier,
         COALESCE(subscription_remaining(sub.id), 0),
         sub.expires_on,
         EXISTS (SELECT 1 FROM bookings b
                 WHERE b.session_id = p_session_id
                   AND b.player_id = p.id
                   AND b.status = 'confirmed')
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT s.id, s.expires_on
    FROM player_subscriptions s
    WHERE s.player_id = p.id
      AND s.is_voided = false
      AND s.expires_on >= amman_today()
      AND subscription_remaining(s.id) > 0
    ORDER BY s.expires_on ASC, s.created_at ASC
    LIMIT 1
  ) sub ON true
  WHERE p.role = 'player'
    AND p.deleted_at IS NULL
    AND p.is_active
    AND ((p.first_name || ' ' || p.last_name) ILIKE '%' || v_query || '%'
         OR similarity(p.first_name || ' ' || p.last_name, v_query) > 0.2)
  ORDER BY similarity(p.first_name || ' ' || p.last_name, v_query) DESC,
           p.first_name, p.last_name
  LIMIT 20;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- list_coach_options(session)
-- BUILD-SPEC 15.2, "Add coach"
--
-- "Picks from profiles with role = 'assistant_coach' ... and warns when that
-- coach is already on another session the same night: 'Already added tonight.
-- The 10 JD fee is counted once.'" That warning is what is_on_night is for,
-- and it is computed here because it is the same night key D76 charges by.
--
-- The main coach appears in the list as well. D47 says "the coach and
-- assistant coaches can be added as players", and 15.2's sentence names the
-- assistant role because that is who it usually is, not to exclude him from a
-- session he plays in himself.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION list_coach_options(p_session_id uuid)
RETURNS TABLE (
  coach_id        uuid,
  display_name    text,
  tier            tier,
  is_on_session   boolean,
  is_on_night     boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session session_instances;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;

  RETURN QUERY
  SELECT p.id,
         p.first_name || ' ' || p.last_name,
         p.tier,
         EXISTS (SELECT 1 FROM session_coaches sc
                 WHERE sc.session_id = p_session_id AND sc.coach_id = p.id),
         EXISTS (SELECT 1 FROM session_coaches sc
                 JOIN session_instances si ON si.id = sc.session_id
                 WHERE sc.coach_id = p.id
                   AND si.venue_id = v_session.venue_id
                   AND si.session_date = v_session.session_date
                   AND si.id <> p_session_id
                   AND si.status <> 'cancelled')
  FROM profiles p
  WHERE p.role IN ('assistant_coach', 'coach')
    AND p.deleted_at IS NULL
    AND p.is_active
  ORDER BY p.first_name, p.last_name;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- admin_add_player(session, player, use_credit)
-- BUILD-SPEC 15.2 and D43
--
-- "If that player has an active subscription, one credit is deducted. If not,
-- the booking is created as cash and marked paid, editable during review."
--
-- p_use_credit is null for "do what D43 says" and an explicit boolean for the
-- two choices 15.2 offers the coach: *Use 1 credit* preselected when he has
-- one, *Cash instead* as the alternative.
--
-- The cash booking is marked paid straight away, which is the odd-looking half
-- of D43 and is deliberate: the coach adds people he is standing next to, and
-- the review screen is where he corrects it if he was wrong. A 0 JD custom
-- rate (D41) is waived rather than paid, because 12.2 rule 2 says such a
-- player contributes no revenue while consuming a court slot, and 8.5 reserves
-- 'waived' for exactly expected_fils = 0.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_add_player(
  p_session_id uuid,
  p_player_id  uuid,
  p_use_credit boolean DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session    session_instances;
  v_player     profiles;
  v_expected   integer;
  v_use_credit boolean;
  v_sub_id     uuid;
  v_booking_id uuid;
  v_txn_id     uuid;
BEGIN
  v_session := assert_session_addable(p_session_id);

  SELECT * INTO v_player FROM profiles WHERE id = p_player_id;
  IF NOT FOUND OR v_player.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'account_deleted';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_session_id
               AND player_id = p_player_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  v_sub_id := pick_subscription(p_player_id);
  v_use_credit := COALESCE(p_use_credit, v_sub_id IS NOT NULL);

  IF v_use_credit AND v_sub_id IS NULL THEN
    RAISE EXCEPTION 'no_credits_available';
  END IF;

  v_expected := resolve_price(p_player_id, v_session.session_type, v_session.price_fils);

  INSERT INTO bookings (session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, paid_fils,
                        source, created_by)
  VALUES (p_session_id, 'player', p_player_id, v_player.tier,
          (CASE WHEN v_use_credit THEN 'credit' ELSE 'cash' END)::payment_method,
          (CASE WHEN v_use_credit THEN 'paid'
                WHEN v_expected = 0 THEN 'waived'
                ELSE 'paid' END)::payment_status,
          CASE WHEN v_use_credit THEN 0 ELSE v_expected END,
          CASE WHEN v_use_credit THEN 0 ELSE v_expected END,
          'admin_added', auth.uid())
  RETURNING id INTO v_booking_id;

  IF v_use_credit THEN
    INSERT INTO credit_transactions (subscription_id, player_id, delta, reason, booking_id, created_by)
    VALUES (v_sub_id, p_player_id, -1, 'booking', v_booking_id, auth.uid())
    RETURNING id INTO v_txn_id;
    UPDATE bookings SET credit_txn_id = v_txn_id WHERE id = v_booking_id;
  END IF;

  DELETE FROM waitlist_entries WHERE session_id = p_session_id AND player_id = p_player_id;
  PERFORM mark_lineup_stale(p_session_id);
  RETURN v_booking_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- admin_add_guest(session, name, tier, is_free, amount)
-- BUILD-SPEC 15.2, D44, D45, D46
--
-- Name and tier only. D46: guests are not remembered. No autocomplete, no
-- history, no merging, typed fresh every time — which is why nothing here
-- looks a guest up or writes anything a later session could read back.
--
-- D45: paid with an amount, or free at zero. "Free guests fill empty spots and
-- are not counted as income" — 12.2 rule 2 — so a free guest is method 'free'
-- and status 'waived', never a cash booking of zero.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_add_guest(
  p_session_id  uuid,
  p_guest_name  text,
  p_guest_tier  tier,
  p_is_free     boolean,
  p_amount_fils integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session    session_instances;
  v_name       text := trim(COALESCE(p_guest_name, ''));
  v_amount     integer;
  v_booking_id uuid;
BEGIN
  v_session := assert_session_addable(p_session_id);

  IF v_name = '' THEN RAISE EXCEPTION 'guest_name_required'; END IF;
  IF p_guest_tier IS NULL THEN RAISE EXCEPTION 'guest_tier_required'; END IF;

  v_amount := CASE WHEN p_is_free THEN 0
                   ELSE COALESCE(p_amount_fils, v_session.price_fils) END;
  IF v_amount < 0 THEN RAISE EXCEPTION 'invalid_price'; END IF;

  INSERT INTO bookings (session_id, attendee_kind, guest_name, guest_tier, tier_snapshot,
                        payment_method, payment_status, expected_fils, paid_fils,
                        source, created_by)
  VALUES (p_session_id, 'guest', v_name, p_guest_tier, p_guest_tier,
          (CASE WHEN p_is_free THEN 'free' ELSE 'cash' END)::payment_method,
          (CASE WHEN p_is_free OR v_amount = 0 THEN 'waived' ELSE 'paid' END)::payment_status,
          v_amount, v_amount,
          'admin_added', auth.uid())
  RETURNING id INTO v_booking_id;

  PERFORM mark_lineup_stale(p_session_id);
  RETURN v_booking_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- admin_add_coach(session, coach, is_paid)
-- BUILD-SPEC 15.2, D17, D47, D76
--
-- Two rows, not one. The booking is the court slot D47 gives him — he occupies
-- one and pays nothing — and the session_coaches row is the 10 JD daily fee
-- D76 charges for the night. They are separate because the fee is per night
-- and the slot is per session: one assistant present for both Saturday
-- sessions at Khalda holds two slots and costs 10 JD once, and
-- recompute_night_costs is what works that out from the night key.
--
-- p_is_paid is D17's "marks each paid or unpaid", about the fee the academy
-- owes him, not about anything he pays.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_add_coach(
  p_session_id uuid,
  p_coach_id   uuid,
  p_is_paid    boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session    session_instances;
  v_coach      profiles;
  v_booking_id uuid;
BEGIN
  v_session := assert_session_addable(p_session_id);

  SELECT * INTO v_coach FROM profiles WHERE id = p_coach_id;
  IF NOT FOUND OR v_coach.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'account_deleted';
  END IF;
  IF v_coach.role NOT IN ('assistant_coach', 'coach') THEN
    RAISE EXCEPTION 'not_a_coach';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings
             WHERE session_id = p_session_id
               AND player_id = p_coach_id AND status = 'confirmed') THEN
    RAISE EXCEPTION 'already_booked';
  END IF;

  INSERT INTO bookings (session_id, attendee_kind, player_id, tier_snapshot,
                        payment_method, payment_status, expected_fils, paid_fils,
                        is_coach_slot, source, created_by)
  VALUES (p_session_id, 'coach', p_coach_id, v_coach.tier,
          'free', 'waived', 0, 0,
          true, 'admin_added', auth.uid())
  RETURNING id INTO v_booking_id;

  INSERT INTO session_coaches (session_id, coach_id, night_key, is_paid, added_by, paid_at)
  VALUES (p_session_id, p_coach_id,
          v_session.venue_id::text || v_session.session_date::text,
          p_is_paid, auth.uid(),
          CASE WHEN p_is_paid THEN now() END)
  ON CONFLICT (session_id, coach_id) DO UPDATE
    SET is_paid = EXCLUDED.is_paid,
        paid_at = EXCLUDED.paid_at;

  -- 12.1: the night's coach fee now divides across this night's sessions.
  PERFORM recompute_night_costs(v_session.venue_id, v_session.session_date);

  -- And each coach on a session carries an even share of that session's slice,
  -- so the per-coach figures still add up to the session's.
  WITH ordered AS (
    SELECT sc.id,
           row_number() OVER (ORDER BY sc.created_at, sc.id) AS rn,
           count(*)     OVER () AS n
    FROM session_coaches sc
    WHERE sc.session_id = p_session_id
  )
  UPDATE session_coaches sc
  SET fee_share_fils = split_share(si.coach_fee_share_fils, ordered.n::integer, ordered.rn::integer)
  FROM ordered, session_instances si
  WHERE ordered.id = sc.id AND si.id = p_session_id;

  PERFORM mark_lineup_stale(p_session_id);
  RETURN v_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION assert_session_addable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION search_players_for_session(text, uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION list_coach_options(uuid)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_add_player(uuid, uuid, boolean)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_add_guest(uuid, text, tier, boolean, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_add_coach(uuid, uuid, boolean)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION search_players_for_session(text, uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION list_coach_options(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_player(uuid, uuid, boolean)          TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_guest(uuid, text, tier, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_coach(uuid, uuid, boolean)           TO authenticated;
