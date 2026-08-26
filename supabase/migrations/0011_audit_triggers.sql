-- ─────────────────────────────────────────────────────────
-- 0011  Audit triggers
-- BUILD-SPEC section 6.2: "Audit rows are written by triggers on bookings,
-- player_subscriptions, credit_transactions, balance_entries,
-- session_instances, and profiles (role, visibility, tier, custom rate
-- changes only)."
--
-- SECURITY DEFINER because audit_log has no INSERT policy for anyone. Rows
-- get there by trigger or not at all.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_entity_id uuid;
  v_before    jsonb;
  v_after     jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_before    := to_jsonb(OLD);
    v_after     := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id;
    v_before    := NULL;
    v_after     := to_jsonb(NEW);
  ELSE
    v_entity_id := NEW.id;
    v_before    := to_jsonb(OLD);
    v_after     := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, v_entity_id, v_before, v_after);

  RETURN NULL;   -- AFTER trigger, the return value is discarded
END;
$$;

CREATE TRIGGER trg_audit_bookings
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_audit_player_subscriptions
  AFTER INSERT OR UPDATE OR DELETE ON player_subscriptions
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_audit_credit_transactions
  AFTER INSERT OR UPDATE OR DELETE ON credit_transactions
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_audit_balance_entries
  AFTER INSERT OR UPDATE OR DELETE ON balance_entries
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER trg_audit_session_instances
  AFTER INSERT OR UPDATE OR DELETE ON session_instances
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- Profiles are audited only for the privileged fields. Nobody needs a log line
-- because a player corrected the spelling of his own surname.
CREATE TRIGGER trg_audit_profiles
  AFTER UPDATE ON profiles
  FOR EACH ROW
  WHEN (
    OLD.role       IS DISTINCT FROM NEW.role
    OR OLD.visibility IS DISTINCT FROM NEW.visibility
    OR OLD.tier       IS DISTINCT FROM NEW.tier
    OR OLD.custom_rate_standard_fils IS DISTINCT FROM NEW.custom_rate_standard_fils
    OR OLD.custom_rate_extended_fils IS DISTINCT FROM NEW.custom_rate_extended_fils
  )
  EXECUTE FUNCTION write_audit_log();
