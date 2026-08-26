-- ─────────────────────────────────────────────────────────
-- 0008  Announcements, device tokens, audit log
-- BUILD-SPEC section 6.2
-- ─────────────────────────────────────────────────────────

CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body        text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  language    text NOT NULL CHECK (language IN ('ar','en')),
  author_id   uuid NOT NULL REFERENCES profiles(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  push_sent_at timestamptz,
  is_deleted  boolean NOT NULL DEFAULT false
);

CREATE TABLE device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  platform    text NOT NULL CHECK (platform IN ('ios','android')),
  locale      text NOT NULL DEFAULT 'ar',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES profiles(id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id, created_at DESC);
