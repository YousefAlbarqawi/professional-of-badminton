-- ─────────────────────────────────────────────────────────
-- 0005  Bookings, waiting list, payment proofs
-- BUILD-SPEC section 6.2
-- ─────────────────────────────────────────────────────────

CREATE TABLE bookings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  attendee_kind      attendee_kind NOT NULL,
  player_id          uuid REFERENCES profiles(id),   -- null for guests
  guest_name         text,                           -- null for players
  guest_tier         tier,
  tier_snapshot      tier,                           -- tier at booking time, for the engine
  status             booking_status NOT NULL DEFAULT 'confirmed',
  source             booking_source NOT NULL DEFAULT 'self',
  payment_method     payment_method NOT NULL,
  payment_status     payment_status NOT NULL DEFAULT 'unpaid',
  expected_fils      integer NOT NULL CHECK (expected_fils >= 0),  -- price snapshot
  paid_fils          integer NOT NULL DEFAULT 0 CHECK (paid_fils >= 0),
  credit_txn_id      uuid,                           -- set when payment_method='credit'
  is_coach_slot      boolean NOT NULL DEFAULT false,
  booked_at          timestamptz NOT NULL DEFAULT now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid REFERENCES profiles(id),
  settled_at         timestamptz,
  created_by         uuid REFERENCES profiles(id),
  note               text,
  CHECK (
    (attendee_kind = 'guest' AND guest_name IS NOT NULL AND player_id IS NULL)
    OR (attendee_kind <> 'guest' AND player_id IS NOT NULL AND guest_name IS NULL)
  ),
  CHECK (paid_fils <= expected_fils OR expected_fils = 0)
);

CREATE UNIQUE INDEX idx_one_active_booking_per_player
  ON bookings(session_id, player_id)
  WHERE status = 'confirmed' AND player_id IS NOT NULL;
CREATE INDEX idx_bookings_session ON bookings(session_id) WHERE status = 'confirmed';
CREATE INDEX idx_bookings_player  ON bookings(player_id, booked_at DESC);

CREATE TABLE waitlist_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES session_instances(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  left_at      timestamptz,
  notified_at  timestamptz,
  UNIQUE (session_id, player_id)
);
CREATE INDEX idx_waitlist_active ON waitlist_entries(session_id) WHERE left_at IS NULL;

CREATE TABLE payment_proofs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_size_bytes integer NOT NULL CHECK (file_size_bytes <= 10485760),
  mime_type    text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  purge_after  date NOT NULL DEFAULT (current_date + interval '365 days')
);
