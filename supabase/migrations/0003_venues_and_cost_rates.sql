-- ─────────────────────────────────────────────────────────
-- 0003  Venues and effective-dated cost rates
-- BUILD-SPEC section 6.2
--
-- Effective dating is not optional. Court rents and prices will change, and
-- without it every historical profit report silently rewrites itself when a
-- rate is edited.
-- ─────────────────────────────────────────────────────────

CREATE TABLE venues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en       text NOT NULL,
  name_ar       text NOT NULL,
  area_en       text NOT NULL,
  area_ar       text NOT NULL,
  court_count   integer NOT NULL CHECK (court_count BETWEEN 1 AND 20),
  google_maps_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venue_night_costs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id           uuid NOT NULL REFERENCES venues(id),
  weekday            integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  court_cost_fils    integer NOT NULL CHECK (court_cost_fils >= 0),
  effective_from     date NOT NULL,
  effective_to       date,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE UNIQUE INDEX idx_night_cost_active
  ON venue_night_costs(venue_id, weekday, effective_from);

CREATE TABLE consumable_costs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type       session_type NOT NULL,
  water_cost_fils    integer NOT NULL CHECK (water_cost_fils >= 0),
  effective_from     date NOT NULL,
  effective_to       date,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coach_fee_rates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_fee_fils     integer NOT NULL CHECK (daily_fee_fils >= 0),
  effective_from     date NOT NULL,
  effective_to       date,
  created_at         timestamptz NOT NULL DEFAULT now()
);
