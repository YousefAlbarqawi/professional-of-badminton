-- ─────────────────────────────────────────────────────────
-- 0001  Extensions and enums
-- BUILD-SPEC section 6.1
-- ─────────────────────────────────────────────────────────

-- Name search for the coach's "add player" flow. Section 6.2 creates this
-- after the index that depends on it; the order is reversed here because the
-- gin_trgm_ops operator class must exist before the index references it.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Tier is declared weakest first so that Postgres comparison operators work
-- naturally: 'A+'::tier > 'B'::tier is true.
CREATE TYPE user_role         AS ENUM ('player', 'assistant_coach', 'admin', 'coach');
CREATE TYPE visibility_level  AS ENUM ('level_0', 'level_1', 'level_2');
CREATE TYPE tier              AS ENUM ('C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+');
CREATE TYPE session_type      AS ENUM ('standard', 'extended');
CREATE TYPE session_status    AS ENUM ('scheduled','in_progress','pending_review','confirmed','locked','cancelled');
CREATE TYPE booking_status    AS ENUM ('confirmed','cancelled_by_player','cancelled_by_admin','settled');
CREATE TYPE booking_source    AS ENUM ('self','admin_added','waitlist_claim');
CREATE TYPE attendee_kind     AS ENUM ('player','guest','coach');
CREATE TYPE payment_method    AS ENUM ('cash','cliq','credit','free');
CREATE TYPE payment_status    AS ENUM ('unpaid','paid','partial','waived');
CREATE TYPE credit_reason     AS ENUM ('grant','booking','booking_refund','expiry','manual_adjustment','session_cancelled');
CREATE TYPE rotation_rule     AS ENUM ('rule_1_similar','rule_2_mixed');
CREATE TYPE pairing_rule_kind AS ENUM ('never_pair','always_pair');

-- Maintains the updated_at columns declared in section 6.2.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
