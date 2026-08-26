-- ─────────────────────────────────────────────────────────
-- 0034  The push outbox, and the device tokens that feed it
-- BUILD-SPEC 8.4 step 4, 8.7 (send-push), section 18, D70
--
-- ── Why there are two new tables ──────────────────────────
-- 8.4 step 4 says to "insert a push job row for each, then call the send-push
-- edge function". Section 6 defines no push job table, so this migration adds
-- one, recorded in the repo copy of section 6.2 and as assumption A66 under
-- the section 0 rule 4 procedure.
--
-- `push_jobs` is the outbox: one row per event that section 18 permits, with
-- the audience frozen at enqueue time. `push_deliveries` is one row per token
-- the job was actually sent to, and it exists for exactly one reason — section
-- 18's "dead tokens returned by Expo's receipt API are deleted". A receipt
-- names a *ticket*, not a token, and Expo advises waiting minutes before
-- asking for it, so the ticket-to-token mapping has to outlive the request
-- that created it. Without this table a receipt is unactionable.
--
-- ── Why the outbox is the authority on who gets what ──────
-- The edge function is invoked by an ordinary signed-in client — the coach who
-- just published, or the player whose cancellation freed a spot. It is
-- therefore given no say in what it sends: it drains rows the database wrote.
-- D28's one hour rule lives in `notify_waitlist` (0035) and nowhere else, and
-- no payload from a phone can route around it. The worst a hostile caller can
-- do is make an already-decided push happen sooner.
--
-- ── D70 is a constraint on this table ─────────────────────
-- `push_job_kind` has exactly two values and there is no third. A booking
-- confirmation, a reminder, a cancellation or an expiry warning has nowhere to
-- go: it cannot be enqueued, so it cannot be sent. If a later phase needs a
-- third trigger, the enum is where the argument has to be had.
-- ─────────────────────────────────────────────────────────

CREATE TYPE push_job_kind AS ENUM ('waitlist_spot', 'announcement');

CREATE TABLE push_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           push_job_kind NOT NULL,
  -- What the notification is about. Exactly one is set, and it is also the
  -- deep link target: session detail for a waitlist spot, announcement detail
  -- for an announcement (section 18).
  session_id      uuid REFERENCES session_instances(id) ON DELETE CASCADE,
  announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE,
  -- The audience, frozen when the job was written. NULL means every registered
  -- device, which is what an announcement is (15.11). A waitlist job carries
  -- the players `notify_waitlist` stamped and nobody else, so a player who
  -- joins the list a second later is not told about a spot that was already
  -- gone when he joined.
  recipient_ids  uuid[],
  -- Everything the payload needs that would otherwise be a join at send time,
  -- captured now: the venue in both languages, the start, the body preview.
  -- A session whose time the coach edits after the spot opened must not change
  -- the notification already on its way.
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at     timestamptz,
  sent_at        timestamptz,
  attempts       integer NOT NULL DEFAULT 0,
  device_count   integer NOT NULL DEFAULT 0,
  last_error     text,
  CHECK (
    (kind = 'waitlist_spot' AND session_id IS NOT NULL AND announcement_id IS NULL)
    OR (kind = 'announcement' AND announcement_id IS NOT NULL AND session_id IS NULL)
  )
);
CREATE INDEX idx_push_jobs_pending ON push_jobs(created_at) WHERE sent_at IS NULL;

CREATE TABLE push_deliveries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES push_jobs(id) ON DELETE CASCADE,
  token        text NOT NULL,
  ticket_id    text,
  -- 'sent' means Expo accepted the ticket. 'failed' means it did not, and the
  -- token may already be gone. 'settled' means the receipt came back clean.
  status       text NOT NULL CHECK (status IN ('sent','failed','settled')),
  error_code   text,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  checked_at   timestamptz
);
-- The receipt sweep reads exactly this: accepted tickets nobody has asked
-- about yet.
CREATE INDEX idx_push_deliveries_unchecked ON push_deliveries(sent_at)
  WHERE checked_at IS NULL AND ticket_id IS NOT NULL;
CREATE INDEX idx_push_deliveries_job ON push_deliveries(job_id);

-- Nobody but the service role has any business here. RLS is on with no
-- policies at all, which is section 7's default deny, and the grants are
-- revoked as well so the answer is the same whichever layer is asked first.
-- A player must not be able to read who else is on a waiting list, and 0032's
-- default privileges would otherwise have handed him the SELECT to try.
ALTER TABLE push_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_jobs       FROM anon, authenticated;
REVOKE ALL ON push_deliveries FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────
-- register_device_token(token, platform, locale)
-- BUILD-SPEC section 18: "Tokens registered on login and refreshed on every
-- cold start, stored in device_tokens", and "language for the payload comes
-- from the device row, not the sender".
--
-- An RPC rather than the upsert 7.3's policy table would allow, for one
-- reason: `device_tokens.token` is UNIQUE across the whole table, so the row a
-- new sign-in collides with may belong to somebody else. That happens on a
-- shared phone, and on a reinstall where the OS hands the same token back. The
-- update policy is `player_id = auth.uid()`, which refuses precisely the row
-- that has to move — and refusing it would leave the previous owner receiving
-- notifications on a phone that is no longer his.
--
-- So the conflict is resolved here, under a definer, by reassigning the token
-- to the caller. The caller is always `auth.uid()`; there is no player id
-- argument, and the function cannot be used to register a token for anybody
-- else.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION register_device_token(
  p_token    text,
  p_platform text,
  p_locale   text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'invalid_push_token';
  END IF;
  IF p_platform NOT IN ('ios','android') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  INSERT INTO device_tokens (player_id, token, platform, locale)
  VALUES (auth.uid(), trim(p_token), p_platform,
          CASE WHEN p_locale IN ('ar','en') THEN p_locale ELSE 'ar' END)
  ON CONFLICT (token) DO UPDATE
    SET player_id    = EXCLUDED.player_id,
        platform     = EXCLUDED.platform,
        locale       = EXCLUDED.locale,
        last_seen_at = now();
END;
$$;

-- ─────────────────────────────────────────────────────────
-- enqueue_push_job(kind, session, announcement, recipients, payload)
--
-- Internal. Every caller is a security definer function in this schema, and
-- there are exactly two of them (0035). It is not granted to anybody.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enqueue_push_job(
  p_kind            push_job_kind,
  p_session_id      uuid,
  p_announcement_id uuid,
  p_recipient_ids   uuid[],
  p_payload         jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_job_id uuid;
BEGIN
  INSERT INTO push_jobs (kind, session_id, announcement_id, recipient_ids, payload)
  VALUES (p_kind, p_session_id, p_announcement_id, p_recipient_ids, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- claim_push_jobs(limit)
-- BUILD-SPEC 8.7: send-push "takes a list of player ids and a payload, looks
-- up device tokens".
--
-- The lookup happens here rather than in the edge function so that the tokens
-- and the claim are one transaction. FOR UPDATE SKIP LOCKED means two
-- invocations racing — the coach publishing while a cancellation drains —
-- cannot both take the same job and send it twice.
--
-- A claim older than five minutes is reclaimable. That is a stalled function,
-- not a duplicate: the alternative is a job that is never sent because the
-- process that took it died between the claim and the send.
--
-- Recipients: NULL means every registered device (an announcement, 15.11);
-- otherwise every device belonging to the frozen recipient list. `locale` is
-- the device's, per section 18.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_push_jobs(p_limit integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_jobs jsonb;
BEGIN
  WITH claimed AS (
    SELECT id FROM push_jobs
    WHERE sent_at IS NULL
      AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes')
      AND attempts < 5
    ORDER BY created_at
    LIMIT GREATEST(COALESCE(p_limit, 5), 1)
    FOR UPDATE SKIP LOCKED
  ), marked AS (
    UPDATE push_jobs j
    SET claimed_at = now(), attempts = j.attempts + 1
    FROM claimed c WHERE j.id = c.id
    RETURNING j.*
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'jobId',          m.id,
      'kind',           m.kind,
      'sessionId',      m.session_id,
      'announcementId', m.announcement_id,
      'payload',        m.payload,
      'devices',        COALESCE(d.devices, '[]'::jsonb)
    ) ORDER BY m.created_at
  ), '[]'::jsonb)
  INTO v_jobs
  FROM marked m
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('token', dt.token, 'locale', dt.locale)) AS devices
    FROM device_tokens dt
    WHERE m.recipient_ids IS NULL OR dt.player_id = ANY (m.recipient_ids)
  ) d ON true;

  RETURN v_jobs;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- complete_push_job(job, tickets)
--
-- `p_tickets` is one object per token Expo was asked about:
--   { "token": "...", "ticketId": "...", "status": "ok"|"error",
--     "error": "DeviceNotRegistered" }
--
-- Two things happen. The deliveries are recorded, so the receipt sweep has
-- something to look up later. And any token Expo rejected outright as
-- `DeviceNotRegistered` is deleted now rather than at receipt time — section
-- 18 asks for dead tokens to go, and a ticket-level rejection is the same
-- death reported earlier. Every other error is kept: a rate limit or a
-- transient fault says nothing about whether the phone still exists.
--
-- A job with no tickets at all — nobody had a device — is still marked sent.
-- There is nothing to retry.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_push_job(
  p_job_id  uuid,
  p_tickets jsonb,
  p_error   text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_pruned integer := 0;
  v_count  integer := 0;
BEGIN
  IF p_tickets IS NOT NULL AND jsonb_typeof(p_tickets) = 'array' THEN
    INSERT INTO push_deliveries (job_id, token, ticket_id, status, error_code)
    SELECT p_job_id,
           t->>'token',
           NULLIF(t->>'ticketId', ''),
           CASE WHEN t->>'status' = 'ok' THEN 'sent' ELSE 'failed' END,
           NULLIF(t->>'error', '')
    FROM jsonb_array_elements(p_tickets) AS t
    WHERE COALESCE(t->>'token', '') <> '';
    GET DIAGNOSTICS v_count = ROW_COUNT;

    DELETE FROM device_tokens dt
    USING jsonb_array_elements(p_tickets) AS t
    WHERE dt.token = t->>'token'
      AND t->>'error' = 'DeviceNotRegistered';
    GET DIAGNOSTICS v_pruned = ROW_COUNT;
  END IF;

  UPDATE push_jobs
  SET sent_at      = now(),
      device_count = v_count,
      last_error   = p_error
  WHERE id = p_job_id;

  -- 15.11: the announcement records when its push went out. Section 6.2 gave
  -- `announcements.push_sent_at` a column and this is the only writer of it.
  UPDATE announcements a
  SET push_sent_at = now()
  FROM push_jobs j
  WHERE j.id = p_job_id
    AND j.announcement_id = a.id
    AND a.push_sent_at IS NULL;

  RETURN v_pruned;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- fail_push_job(job, error)
--
-- The send itself failed — Expo was unreachable, or answered with something
-- unusable. The claim is released so the next invocation picks the job up
-- again, up to `attempts < 5`. Nothing is recorded as delivered, because
-- nothing was.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fail_push_job(p_job_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE push_jobs
  SET claimed_at = NULL, last_error = left(COALESCE(p_error, 'unknown'), 500)
  WHERE id = p_job_id AND sent_at IS NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- pending_push_receipts(limit, min_age_seconds)
-- BUILD-SPEC section 18: "Dead tokens returned by Expo's receipt API are
-- deleted."
--
-- Expo does not have a receipt the instant it hands over a ticket, so this
-- deliberately ignores anything sent in the last few seconds and the sweep
-- runs at the *start* of the next invocation. In practice the announcement
-- that goes out on Thursday cleans up after the waitlist spot that went out on
-- Tuesday, and a scheduled drain closes the gap when nothing else pushes for a
-- while (recorded in OPEN-ITEMS.md).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pending_push_receipts(
  p_limit           integer DEFAULT 300,
  p_min_age_seconds integer DEFAULT 20
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ticketId', ticket_id, 'token', token)), '[]'::jsonb)
  FROM (
    SELECT ticket_id, token
    FROM push_deliveries
    WHERE checked_at IS NULL
      AND ticket_id IS NOT NULL
      AND status = 'sent'
      AND sent_at < now() - make_interval(secs => GREATEST(COALESCE(p_min_age_seconds, 20), 0))
    ORDER BY sent_at
    LIMIT GREATEST(COALESCE(p_limit, 300), 1)
  ) AS due;
$$;

-- ─────────────────────────────────────────────────────────
-- settle_push_receipts(results)
--
-- `p_results` is one object per ticket that came back:
--   { "ticketId": "...", "status": "ok"|"error", "error": "DeviceNotRegistered" }
--
-- Marks each delivery checked and deletes the tokens Expo says are gone. This
-- is the sentence in section 18 that the whole `push_deliveries` table exists
-- for. Returns how many tokens were pruned.
--
-- A ticket Expo has no answer for yet is simply absent from `p_results` and
-- stays unchecked, so it is asked about again next time.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION settle_push_receipts(p_results jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_pruned integer := 0;
BEGIN
  IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN RETURN 0; END IF;

  UPDATE push_deliveries d
  SET checked_at = now(),
      status     = CASE WHEN r->>'status' = 'ok' THEN 'settled' ELSE 'failed' END,
      error_code = COALESCE(NULLIF(r->>'error', ''), d.error_code)
  FROM jsonb_array_elements(p_results) AS r
  WHERE d.ticket_id = r->>'ticketId';

  DELETE FROM device_tokens dt
  USING jsonb_array_elements(p_results) AS r, push_deliveries d
  WHERE d.ticket_id = r->>'ticketId'
    AND dt.token = d.token
    AND r->>'error' = 'DeviceNotRegistered';
  GET DIAGNOSTICS v_pruned = ROW_COUNT;

  RETURN v_pruned;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- Who may call what
--
-- Everything that reads or writes the outbox is service role only, because
-- everything that reads or writes the outbox is the edge function running with
-- the service key. `register_device_token` is the one a phone calls, and the
-- only account it can register a token against is its own.
-- ─────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION enqueue_push_job(push_job_kind, uuid, uuid, uuid[], jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_push_jobs(integer)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION complete_push_job(uuid, jsonb, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fail_push_job(uuid, text)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION pending_push_receipts(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION settle_push_receipts(jsonb)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION register_device_token(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION claim_push_jobs(integer)               TO service_role;
GRANT EXECUTE ON FUNCTION complete_push_job(uuid, jsonb, text)   TO service_role;
GRANT EXECUTE ON FUNCTION fail_push_job(uuid, text)              TO service_role;
GRANT EXECUTE ON FUNCTION pending_push_receipts(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION settle_push_receipts(jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION register_device_token(text, text, text) TO authenticated;
