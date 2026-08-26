-- ─────────────────────────────────────────────────────────
-- 0004  Session templates and dated instances
-- BUILD-SPEC section 6.2
-- ─────────────────────────────────────────────────────────

CREATE TABLE session_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id       uuid NOT NULL REFERENCES venues(id),
  weekday        integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time     time NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes IN (90, 150)),
  session_type   session_type NOT NULL,
  price_fils     integer NOT NULL CHECK (price_fils >= 0),
  court_count    integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  rotation_count integer NOT NULL CHECK (rotation_count BETWEEN 1 AND 10),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, weekday, start_time)
);

-- The cost snapshot lives on the instance because the night cost must be
-- divided across that night's sessions, and that division depends on how many
-- sessions actually ran.
CREATE TABLE session_instances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid REFERENCES session_templates(id),   -- null = ad hoc
  venue_id          uuid NOT NULL REFERENCES venues(id),
  session_date      date NOT NULL,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  session_type      session_type NOT NULL,
  price_fils        integer NOT NULL CHECK (price_fils >= 0),
  court_count       integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  rotation_count    integer NOT NULL CHECK (rotation_count BETWEEN 1 AND 10),
  capacity          integer GENERATED ALWAYS AS (court_count * 4) STORED,
  status            session_status NOT NULL DEFAULT 'scheduled',
  has_manual_lineup boolean NOT NULL DEFAULT false,
  assistant_coach_count integer NOT NULL DEFAULT 0,
  -- cost snapshot, written at generation, recomputed only while status='scheduled'
  court_cost_share_fils integer NOT NULL DEFAULT 0,
  water_cost_fils       integer NOT NULL DEFAULT 0,
  coach_fee_share_fils  integer NOT NULL DEFAULT 0,
  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES profiles(id),
  cancellation_note text,
  reviewed_at       timestamptz,
  reviewed_by       uuid REFERENCES profiles(id),
  locked_at         timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (venue_id, starts_at)
);

CREATE INDEX idx_instances_date   ON session_instances(session_date);
CREATE INDEX idx_instances_status ON session_instances(status);
CREATE INDEX idx_instances_upcoming ON session_instances(starts_at)
  WHERE status IN ('scheduled','in_progress');

CREATE TRIGGER trg_session_templates_updated_at
  BEFORE UPDATE ON session_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_session_instances_updated_at
  BEFORE UPDATE ON session_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
