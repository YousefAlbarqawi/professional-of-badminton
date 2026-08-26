-- ─────────────────────────────────────────────────────────
-- 0030  Expiry, and the last of section 8.6's five jobs
-- BUILD-SPEC 11.5, D54, D56, 8.6
--
-- 8.6 lists five scheduled jobs. Migration 0019 created two and named the
-- three it was leaving; 0028 created two more and named the one still
-- outstanding. This is that one:
--
--   every 5 minutes   advance session states                 -> 0019
--   daily 03:00       generate_sessions(21)                  -> 0019
--   daily 03:10       lock sessions 7 days after they end    -> 0028
--   daily 03:20       void expired subscriptions             -> here
--   daily 04:00       purge payment proofs                   -> 0028, and it
--                                                               cannot be a
--                                                               cron job (A54)
--
-- pg_cron reads its schedules in the server's timezone, which on Supabase is
-- UTC, so 03:20 Amman is written below as 00:20 with no DST arithmetic:
-- Jordan has had none since 2022 (5.1).
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- void_expired_subscriptions()
-- BUILD-SPEC 11.5, verbatim: "The nightly job voids subscriptions past
-- expires_on by writing an expiry transaction that brings the balance to
-- exactly zero, then setting is_voided = true. The history remains readable."
--
-- ── Why a transaction rather than a flag ──────────────────
-- D54 says expiry voids unused credits and the balance goes to zero. D56 says
-- credits are an append only ledger with a reason on every movement. The only
-- way to satisfy both is to *move* the credits: the balance is SUM(delta) and
-- nothing else, so bringing it to zero means writing −remaining with reason
-- `expiry`. Setting is_voided alone would leave a subscription whose ledger
-- still says 12 and whose screen says 0, and a coach reading the history in
-- March would find twelve credits that simply stopped existing one night.
--
-- Written in that order, and it matters. The zeroing row goes in while the
-- subscription is still live, then the row is voided. Reversing the two would
-- be writing to a closed ledger, which is the thing adjust_credits refuses to
-- do for exactly the same reason.
--
-- ── A subscription that is already empty ──────────────────
-- gets no transaction, because credit_transactions.delta carries CHECK
-- (delta <> 0) and a row saying "nothing happened" would be noise in the one
-- history the player is told to read. It is still voided: the date has passed
-- and the row is closed whether or not anything was left in it.
--
-- ── A2, and why the sum can be positive after a refund ────
-- A credit returned by a cancellation goes back to the subscription it came
-- from even if that subscription has since expired. This job is what then
-- voids it, "like any other credit" — so a subscription can be voided on one
-- night, receive a +1 refund the next morning, and be voided again on the
-- following run. The `is_voided = false` filter would skip it, so the filter
-- is on the date and on there being something to do, not on the flag.
--
-- ── Time ──────────────────────────────────────────────────
-- amman_today(), never current_date (A31). pick_subscription treats a
-- subscription expiring today as usable all of today, and this job must agree
-- with it exactly or a credit would be voided on the morning of a day it was
-- still spendable — or spendable on a day it had already been voided.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION void_expired_subscriptions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  r           record;
  v_remaining integer;
  v_count     integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.player_id
    FROM player_subscriptions s
    WHERE s.expires_on < amman_today()
      AND (s.is_voided = false OR subscription_remaining(s.id) <> 0)
    FOR UPDATE
  LOOP
    v_remaining := subscription_remaining(r.id);

    IF v_remaining <> 0 THEN
      INSERT INTO credit_transactions
        (subscription_id, player_id, delta, reason, created_by)
      VALUES (r.id, r.player_id, -v_remaining, 'expiry', NULL);
    END IF;

    UPDATE player_subscriptions SET is_voided = true WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Nobody calls this from a phone. It runs on a schedule and, in the tests,
-- through the service role.
REVOKE EXECUTE ON FUNCTION void_expired_subscriptions() FROM PUBLIC, anon, authenticated;

-- 8.6: daily 03:20 Amman = 00:20 UTC. cron.schedule replaces a job of the same
-- name, so a `supabase db reset` re-running this migration leaves no
-- duplicates behind.
SELECT cron.schedule(
  'void-expired-subscriptions',
  '20 0 * * *',
  $job$SELECT public.void_expired_subscriptions();$job$
);
