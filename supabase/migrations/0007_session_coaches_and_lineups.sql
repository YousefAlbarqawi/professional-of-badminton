-- ─────────────────────────────────────────────────────────
-- 0007  Assistant coaches on a session, and lineups
-- BUILD-SPEC section 6.2
-- ─────────────────────────────────────────────────────────

-- night_key is venue_id || session_date. One assistant coach present for both
-- Saturday sessions at Khalda costs 10 JD, not 20. D76.
CREATE TABLE session_coaches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  coach_id       uuid NOT NULL REFERENCES profiles(id),
  night_key      text NOT NULL,       -- venue_id || session_date, for per-day fee dedupe
  is_paid        boolean NOT NULL DEFAULT false,
  fee_share_fils integer NOT NULL DEFAULT 0,
  paid_at        timestamptz,
  added_by       uuid NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, coach_id)
);

CREATE TABLE rotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  rotation_index integer NOT NULL CHECK (rotation_index BETWEEN 1 AND 10),
  rule          rotation_rule NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, rotation_index)
);

CREATE TABLE court_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id   uuid NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
  court_number  integer NOT NULL CHECK (court_number >= 1),
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  team          integer NOT NULL CHECK (team IN (1,2)),
  is_locked     boolean NOT NULL DEFAULT false,
  UNIQUE (rotation_id, booking_id)
);
CREATE INDEX idx_assignments_rotation ON court_assignments(rotation_id, court_number);

CREATE TABLE rotation_sitouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_id   uuid NOT NULL REFERENCES rotations(id) ON DELETE CASCADE,
  booking_id    uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  UNIQUE (rotation_id, booking_id)
);

CREATE TABLE locked_courts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  court_number  integer NOT NULL,
  booking_ids   uuid[] NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, court_number)
);

CREATE TABLE pairing_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          pairing_rule_kind NOT NULL,
  player_a_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_b_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (player_a_id <> player_b_id)
);
CREATE UNIQUE INDEX idx_pairing_unique
  ON pairing_rules (LEAST(player_a_id,player_b_id), GREATEST(player_a_id,player_b_id));
