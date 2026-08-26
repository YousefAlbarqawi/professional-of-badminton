-- ─────────────────────────────────────────────────────────
-- 0006  Balances, packages, subscriptions, credit ledger
-- BUILD-SPEC sections 6.2 and 11
-- ─────────────────────────────────────────────────────────

CREATE TABLE balance_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id   uuid REFERENCES bookings(id) ON DELETE SET NULL,
  session_id   uuid REFERENCES session_instances(id) ON DELETE SET NULL,
  amount_fils  integer NOT NULL,   -- positive = owed to coach, negative = settlement
  note         text,
  created_by   uuid NOT NULL REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_balance_player ON balance_entries(player_id, created_at DESC);

-- per_visit_fils rounds rather than truncating. Section 6.2's integer division
-- yields 4166 for the 30-visit package while sections 5.3 and 11.1 both state
-- 4167, and section 12.2 rule 1 requires credit revenue to be valued at the
-- per-visit rate exactly. Resolved in favour of 5.3 and 11.1; see CONFLICTS
-- FOUND C2 in BUILD-SPEC.md.
CREATE TABLE packages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en           text NOT NULL,
  name_ar           text NOT NULL,
  visit_count       integer NOT NULL CHECK (visit_count > 0),
  price_fils        integer NOT NULL CHECK (price_fils >= 0),
  duration_months   integer NOT NULL CHECK (duration_months > 0),
  per_visit_fils    integer GENERATED ALWAYS AS
                      (round(price_fils::numeric / visit_count)::integer) STORED,
  display_order     integer NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true
);

CREATE TABLE player_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id        uuid NOT NULL REFERENCES packages(id),
  granted_visits    integer NOT NULL CHECK (granted_visits > 0),
  per_visit_fils    integer NOT NULL,          -- snapshot of package rate
  starts_on         date NOT NULL,
  expires_on        date NOT NULL,
  is_voided         boolean NOT NULL DEFAULT false,
  granted_by        uuid NOT NULL REFERENCES profiles(id),
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on > starts_on)
);
CREATE INDEX idx_subs_player_active ON player_subscriptions(player_id, expires_on)
  WHERE is_voided = false;

-- The credit balance of a subscription is always the sum of this ledger.
-- There is no cached counter column anywhere.
CREATE TABLE credit_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   uuid NOT NULL REFERENCES player_subscriptions(id) ON DELETE CASCADE,
  player_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delta             integer NOT NULL CHECK (delta <> 0),   -- +n grant, -1 booking, +1 refund
  reason            credit_reason NOT NULL,
  booking_id        uuid REFERENCES bookings(id) ON DELETE SET NULL,
  note              text,
  created_by        uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_txn_sub ON credit_transactions(subscription_id);
CREATE INDEX idx_credit_txn_player ON credit_transactions(player_id, created_at DESC);

ALTER TABLE bookings
  ADD CONSTRAINT fk_booking_credit_txn
  FOREIGN KEY (credit_txn_id) REFERENCES credit_transactions(id) ON DELETE SET NULL;
