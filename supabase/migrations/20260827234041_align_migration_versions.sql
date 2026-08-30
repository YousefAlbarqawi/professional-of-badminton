-- ─────────────────────────────────────────────────────────
-- Bookkeeping only. No schema change, and a no-op on any database that has
-- not already been through what it describes.
--
-- ── Why this file has a timestamp and its neighbours have numbers ──
-- Every other migration here is numbered `0001..`, and `supabase db push`
-- matches a local file to a remote row on exactly that leading version. 0042
-- and 0043 were applied to `pob-prod` through the Supabase management API
-- rather than through `db push`, because the CLI's direct database connection
-- was not reachable from the machine the work was done on, and the API stamps
-- its own timestamp version instead of reading one from a filename.
--
-- The two statements below are what put those two rows back under this
-- repository's numbering, so `db push` sees them as applied instead of
-- offering to run them again.
--
-- The API records a migration *after* running its query, so the run that
-- executed these statements could not delete its own row — it tried, and the
-- delete found nothing yet. Rather than chase that with another migration that
-- would leave another row behind, the row it left is claimed by this file: the
-- version in the filename is that row's version, so local and remote now
-- correspond one to one, with nothing pending on either side.
--
-- ── Replaying this ────────────────────────────────────────
-- On a fresh database — `supabase db reset`, or a new environment — 0042 and
-- 0043 are applied from their own files under their own numbers, so both
-- UPDATEs match no rows and change nothing. That is the intended behaviour and
-- the reason this file carries the two statements rather than a comment about
-- them: it is honest about what ran against production, and safe everywhere
-- else.
-- ─────────────────────────────────────────────────────────

UPDATE supabase_migrations.schema_migrations
SET version = '0042'
WHERE version = '20260827233915'
  AND name = 'remove_rotation';

UPDATE supabase_migrations.schema_migrations
SET version = '0043'
WHERE version = '20260827234019'
  AND name = 'session_cost_overrides';
