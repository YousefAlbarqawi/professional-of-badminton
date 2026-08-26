-- ─────────────────────────────────────────────────────────
-- 0032  Table and function privileges for the API roles
-- BUILD-SPEC section 7
--
-- ── Why this migration exists ─────────────────────────────
-- Section 7 opens with "Enable RLS on every table. Default deny", and every
-- migration from 0002 onwards does exactly that. What none of them does is
-- GRANT anything: phases 1 to 5 relied on the platform's default privileges
-- to give `authenticated` and `service_role` their table access, which is the
-- Supabase convention and was true of the Postgres image in use at the time.
--
-- It is no longer true. On `supabase/postgres:17.6.1.159` the default ACL for
-- objects created by `postgres` in `public` grants those roles TRUNCATE,
-- REFERENCES and TRIGGER and nothing else, so a table created by a migration
-- is unreadable by anybody through PostgREST — "permission denied for table
-- packages", whatever the policies say. RLS was never the thing that was
-- missing; the grant underneath it was.
--
-- ── Privileges and policies are different questions ───────
-- A GRANT says which roles may attempt an operation. A policy says which rows
-- they get. Section 7 is entirely about the second, and this migration is
-- entirely about the first, so nothing here widens what anybody can see: every
-- table below already has RLS enabled and a default deny underneath it, and
-- the policies in 0012 remain the only thing that lets a row through.
--
-- ── anon is granted, and RLS is what refuses it ───────────
-- The obvious alternative is to grant `anon` nothing and let a missing
-- privilege stop it a step earlier than a policy would. That is not what phase
-- 1 built, and the difference is observable: with the grant, a table returns an
-- empty set; without it, a permission error. `supabase/tests/anonymous.test.ts`
-- asserts *both* shapes deliberately — "a test that accepted either would pass
-- against a table that had accidentally been granted and returned rows on a
-- different day" — tables empty, views refused, because 0010 revokes the views
-- from `anon` outright and every policy in 0012 is scoped TO authenticated.
--
-- So `anon` is granted the same table access as everybody else and section 7's
-- default deny is what actually stops it. That keeps the security boundary in
-- one place, which is 7's opening claim, and keeps phase 1's distinction
-- between "no policy matched" and "no privilege" meaningful.
--
-- ── Functions, and why only `service_role` ────────────────
-- The same default went missing for functions, and it bites in a place that is
-- easy to misread: `guard_profile_privileged_fields` (0009) calls `is_staff()`,
-- and a trigger function is executed as the *invoking* role. A service-role
-- write to `profiles` therefore failed with "permission denied for function
-- is_staff" rather than with anything about profiles. The RLS policies reach
-- the same helpers the same way.
--
-- `authenticated` needs nothing here: every RPC it calls carries an explicit
-- GRANT already, and the helpers were granted to it in 0009. `anon` needs
-- nothing by design. Only `service_role` was relying on the platform default,
-- and every REVOKE in this repository names `PUBLIC`, `anon` and
-- `authenticated` and never names `service_role` — so granting it EXECUTE on
-- the schema restores exactly what those migrations assumed and narrows
-- nothing they intended. It is also not a boundary: the service key bypasses
-- RLS and can issue arbitrary SQL, so a function grant costs it nothing it did
-- not already have.
--
-- ── The default privileges are set too ────────────────────
-- So that a table or function added by a later migration does not have to
-- remember this. ALTER DEFAULT PRIVILEGES applies to objects created by the
-- role that runs it, which is `postgres` — the role every migration in this
-- repository runs as.
-- ─────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

-- `audit_log` is the one table with a sequence. Its rows are written by
-- SECURITY DEFINER triggers owned by postgres, so nothing below needs the
-- sequence today; it is granted so that a future INSERT through PostgREST
-- fails on its policy rather than on a privilege, which is the error the
-- author would want to read.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 0010's revokes have to be re-stated, because `ON ALL TABLES` covers views and
-- this migration runs after it. The four report and balance views stay closed
-- to the anonymous role for the reason 0010 gives, and anonymous.test.ts
-- asserts that they answer with an error rather than an empty set.
REVOKE ALL ON v_player_credit_balance FROM anon;
REVOKE ALL ON v_player_total_balance  FROM anon;
REVOKE ALL ON v_session_occupancy     FROM anon;
REVOKE ALL ON v_session_financials    FROM anon;
