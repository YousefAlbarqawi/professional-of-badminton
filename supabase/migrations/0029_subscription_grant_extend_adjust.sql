-- ─────────────────────────────────────────────────────────
-- 0029  Granting, extending and adjusting a subscription
-- BUILD-SPEC 11.2, 11.3, 11.5, 15.9, 15.10, D48 to D57
--
-- Three functions, and one rule underneath all three: the credit balance of a
-- subscription is `SUM(delta)` over `credit_transactions` and nothing else.
-- D56 and section 6.2 both say so. There is no counter column, none of these
-- functions writes one, and none of them may ever be "optimised" into writing
-- one — a counter is a second answer to a question that already has one, and
-- the moment the two disagree the coach has no way to tell which is lying.
-- `subscription_remaining` (migration 0020) is the one reader.
--
-- ── Why these are RPCs and not table writes ───────────────
-- Staff already have `FOR ALL` policies on `player_subscriptions` and
-- `credit_transactions` (migration 0012), so PostgREST could write both rows
-- directly. It could not write them *together*: a grant is a subscription and
-- its opening ledger entry, and each PostgREST request commits on its own, so
-- a grant made that way could leave a subscription with no credits in it. The
-- rules that are not expressible as a policy live here for the same reason —
-- D55's "only before it expires", 11.3's required note, and the snapshot of
-- `per_visit_fils` that section 11.1 and section 12.2 rule 1 depend on.
--
-- ── What is never here ────────────────────────────────────
-- D49: subscriptions cannot be bought in the app. Nothing below can be reached
-- by a player, and there is no price, no payment and no purchase anywhere in
-- this file. D50: the app does not track whether the player paid for his
-- subscription. If the coach wants that recorded it is a balance entry (10.3),
-- which is a different table and a different screen.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- grant_subscription(player, package, starts_on, expires_on, visits, note)
-- BUILD-SPEC 11.2 and 15.9
--
--   1. choose a package
--   2. choose a start date, defaulting to today
--   3. expiry auto-fills to start + duration months, and is editable
--   4. optionally override the granted visit count
--   5. optional note, for example "paid 80, 45 remaining"
--
-- Steps 2 and 3 have defaults here as well as on the screen, so a caller that
-- omits them gets the same subscription the form would have produced.
--
-- `per_visit_fils` is snapshotted onto the subscription, per 11.1: "so later
-- price changes never rewrite history". Section 12.2 rule 1 then values every
-- credit booking at that snapshot rather than at the session price — which is
-- what phase 9's revenue figures are built on, and the reason this column is
-- copied rather than joined.
--
-- D51: a player may hold several subscriptions at once, including duplicates
-- of the same package. Nothing here checks for an existing one.
--
-- The grant writes exactly one credit transaction, `delta = granted_visits`,
-- reason `grant`. That row *is* the balance.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION grant_subscription(
  p_player_id      uuid,
  p_package_id     uuid,
  p_starts_on      date DEFAULT NULL,
  p_expires_on     date DEFAULT NULL,
  p_granted_visits integer DEFAULT NULL,
  p_note           text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_package  packages;
  v_player   profiles;
  v_starts   date;
  v_expires  date;
  v_visits   integer;
  v_sub_id   uuid;
BEGIN
  -- 11.2 and D16: coach or admin. An assistant coach is not staff (A14).
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_player FROM profiles WHERE id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found'; END IF;
  -- A1: a deleted account keeps its history so the coach's reports do not
  -- develop holes. Adding to that history afterwards is a different thing.
  IF v_player.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'account_deleted'; END IF;

  SELECT * INTO v_package FROM packages WHERE id = p_package_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'package_not_found'; END IF;

  -- A31: amman_today(), not current_date. current_date reads the database
  -- session's timezone, which on Supabase is UTC, so between midnight and
  -- 03:00 Amman it returns yesterday — and a subscription granted in those
  -- three hours would start the day before the coach granted it.
  v_starts  := COALESCE(p_starts_on, amman_today());
  v_expires := COALESCE(
    p_expires_on,
    (v_starts + make_interval(months => v_package.duration_months))::date);
  v_visits  := COALESCE(p_granted_visits, v_package.visit_count);

  IF v_visits <= 0 THEN RAISE EXCEPTION 'invalid_visit_count'; END IF;
  IF v_expires <= v_starts THEN RAISE EXCEPTION 'invalid_expiry'; END IF;

  INSERT INTO player_subscriptions
    (player_id, package_id, granted_visits, per_visit_fils,
     starts_on, expires_on, granted_by, note)
  VALUES
    (p_player_id, v_package.id, v_visits, v_package.per_visit_fils,
     v_starts, v_expires, auth.uid(), NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING id INTO v_sub_id;

  INSERT INTO credit_transactions
    (subscription_id, player_id, delta, reason, note, created_by)
  VALUES
    (v_sub_id, p_player_id, v_visits, 'grant',
     NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid());

  RETURN v_sub_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- extend_subscription(subscription, new expiry)
-- BUILD-SPEC 11.5 and D55
--
-- "Only the coach extends, by editing expires_on on a non-expired
-- subscription. Editing an expired subscription is blocked."
--
-- ── Coach, not staff ──────────────────────────────────────
-- D16 gives an admin everything the coach has except reports, and its list of
-- examples includes granting a subscription — which is why grant_subscription
-- above is `is_staff()`. D55 is narrower and names extension specifically:
-- "Only the coach extends". A list of examples does not override a decision
-- written about the very action in question, so this one is `is_coach()`.
-- Recorded as an assumption in section 21; one sentence overturns it, and the
-- change is this line.
--
-- ── Why an expired subscription is blocked ────────────────
-- 11.5's first half is the reason its second half exists: expiry writes a
-- transaction that zeroes the balance and then voids the row. Moving
-- `expires_on` forward afterwards would leave a subscription that is live
-- again and empty, or — if it were extended in the hours between its expiry
-- date passing and the 03:20 job running — one whose credits survive a date
-- they were supposed to die on. D54 is explicit that expiry voids unused
-- credits. The coach's route for a player who deserves more time is a new
-- grant, which is honest about being a new grant.
--
-- No credit moves here, so nothing is written to the ledger. The change is
-- captured by trg_audit_player_subscriptions (migration 0011).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION extend_subscription(
  p_subscription_id uuid,
  p_expires_on      date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sub player_subscriptions;
BEGIN
  IF NOT is_coach() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT * INTO v_sub FROM player_subscriptions
    WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  -- Both halves of "expired", for the same reason assert_session_unlocked
  -- checks both halves of "locked" (A52): is_voided is a fact about whether
  -- the nightly job has run, expires_on is a fact about the clock, and the
  -- hours between them must not be a window in which the rule does not hold.
  IF v_sub.is_voided OR v_sub.expires_on < amman_today() THEN
    RAISE EXCEPTION 'subscription_expired';
  END IF;

  IF p_expires_on IS NULL OR p_expires_on <= v_sub.expires_on THEN
    RAISE EXCEPTION 'invalid_expiry';
  END IF;

  UPDATE player_subscriptions
  SET expires_on = p_expires_on
  WHERE id = p_subscription_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- adjust_credits(subscription, delta, note)
-- BUILD-SPEC 11.3, 15.10, D57
--
-- The whole of the migration story, and it is a real one: there are people
-- mid-subscription today. 11.3's documented flow is to grant the full 40 visit
-- package and then adjust by −13 with the note "used before the app". The
-- balance reads 27 and the history explains itself forever.
--
-- 11.3 is equally explicit about what not to build: "Do not make him book and
-- cancel phantom sessions. Do not build a special import screen. The adjust
-- action is enough." There is no import path anywhere in this phase.
--
-- ── The note is required ──────────────────────────────────
-- 11.3 and 15.10 both say so, and D56 makes it a rule about the ledger rather
-- than about a form: "Credits are an append only ledger with a reason on every
-- movement." Every other reason in the enum carries its own explanation —
-- `grant`, `booking`, `booking_refund`, `expiry`, `session_cancelled` all say
-- what happened. `manual_adjustment` says only that a human did something, so
-- the note is what makes the row readable, and the check is here rather than
-- only in the form so that it holds for any caller.
--
-- ── Why the balance may not go negative ───────────────────
-- 15.10's preview is "Balance goes from 40 to 27". A subscription holding −6
-- credits is not a state anything in the specification describes: it cannot be
-- spent (pick_subscription wants remaining > 0), the expiry job would have to
-- add credits to zero it, and the number on the player's own screen (14.13)
-- would be a debt in a place D40 keeps debts out of. A coach who has
-- over-adjusted corrects it with another adjustment upwards; a coach who wants
-- to record money owed uses a balance entry (10.3), which is what that table
-- is for.
--
-- ── Why a voided subscription is refused ──────────────────
-- Expiry closes the ledger by bringing it to exactly zero (11.5). Writing to
-- it afterwards would reopen a balance that D54 voided, on a subscription
-- pick_subscription will never return, so the credits would be visible and
-- unspendable — the worst of both. A new grant is the honest route.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION adjust_credits(
  p_subscription_id uuid,
  p_delta           integer,
  p_note            text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_sub       player_subscriptions;
  v_note      text;
  v_remaining integer;
  v_txn_id    uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO v_sub FROM player_subscriptions
    WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  IF v_sub.is_voided THEN RAISE EXCEPTION 'subscription_voided'; END IF;

  v_remaining := subscription_remaining(p_subscription_id);
  IF v_remaining + p_delta < 0 THEN RAISE EXCEPTION 'insufficient_credits'; END IF;

  INSERT INTO credit_transactions
    (subscription_id, player_id, delta, reason, note, created_by)
  VALUES
    (p_subscription_id, v_sub.player_id, p_delta, 'manual_adjustment', v_note, auth.uid())
  RETURNING id INTO v_txn_id;

  RETURN v_txn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION grant_subscription(uuid, uuid, date, date, integer, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION extend_subscription(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION adjust_credits(uuid, integer, text) FROM PUBLIC, anon;

-- Granted to every authenticated role and gated inside, exactly as the session
-- and payment RPCs are. A player calling one of these gets `not_authorized`
-- from the function rather than a 404 from PostgREST, which is the difference
-- between a boundary and an accident.
GRANT EXECUTE ON FUNCTION grant_subscription(uuid, uuid, date, date, integer, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION extend_subscription(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_credits(uuid, integer, text) TO authenticated;
