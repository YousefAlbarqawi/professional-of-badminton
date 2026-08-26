-- ─────────────────────────────────────────────────────────
-- 0019  Scheduled jobs
-- BUILD-SPEC 8.6
--
-- pg_cron reads its schedules in the server's timezone, which on Supabase is
-- UTC. Jordan is permanently UTC+3 with no daylight saving since 2022 (5.1),
-- so every Amman time in 8.6 is written here as Amman minus three hours, with
-- no DST arithmetic anywhere.
--
-- 8.6 lists five jobs. Two of them belong to this phase:
--
--   every 5 minutes   advance sessions past starts_at / ends_at   → built
--   daily 03:00       generate_sessions(21)                       → built
--   daily 03:10       lock sessions 7 days after they end         → phase 5
--   daily 03:20       void expired subscriptions                  → phase 6
--   daily 04:00       purge payment proofs past purge_after       → phase 5
--
-- The other three are left to the phases that build the machinery they act on:
-- section 20 puts the 7 day lock and the proof purge in phase 5 and the
-- subscription expiry in phase 6. Scheduling them now would mean writing that
-- machinery now.
-- ─────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule replaces a job of the same name, so a `supabase db reset`
-- re-running this migration never leaves duplicates behind.

-- 5.5: in_progress and pending_review are derived from timestamps by a
-- scheduled job, not by client polling.
SELECT cron.schedule(
  'advance-session-states',
  '*/5 * * * *',
  $job$SELECT public.advance_session_states();$job$
);

-- 8.1: nightly at 03:00 Amman = 00:00 UTC. 21 days ahead while the player's
-- booking window is 5 days, deliberately.
SELECT cron.schedule(
  'generate-sessions',
  '0 0 * * *',
  $job$SELECT public.generate_sessions(21);$job$
);
