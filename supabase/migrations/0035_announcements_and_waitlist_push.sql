-- ─────────────────────────────────────────────────────────
-- 0035  Announcements, and the waiting list finally being told
-- BUILD-SPEC 14.11, 15.11, 8.4, section 18, D69, D70, D28
--
-- Two triggers, and this file contains both of them. There is no third writer
-- of `push_jobs` anywhere in the schema, which is how D70 is enforced rather
-- than merely intended.
-- ─────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────
-- publish_announcement(body, language)
-- BUILD-SPEC 15.11 and D69
--
-- "One message to everyone, in whichever language the author types. Not a dual
-- language form. Sends a push." So there is one body and one language column,
-- and the language is the author's statement about what he typed rather than
-- anything derived — 14.11 asks the *reader's* screen to detect direction from
-- the content, which is a rendering decision made on the phone and not a
-- column.
--
-- The announcement and its push job are written together. 15.11 says
-- "publishing sends a push to every registered device immediately", and an
-- announcement that exists with no job behind it is an announcement nobody was
-- told about — the one failure mode this whole phase is meant to prevent. One
-- transaction, so either both rows exist or neither does.
--
-- `recipient_ids` is NULL: every registered device, which is what 15.11 says
-- and what the confirmation dialog counts.
--
-- The preview is section 18's "first 120 characters of the body", cut here so
-- the sender and the notification agree on what was sent even if the body is
-- later soft deleted.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION publish_announcement(
  p_body     text,
  p_language text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_body    text;
  v_id      uuid;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  v_body := trim(COALESCE(p_body, ''));
  IF length(v_body) = 0 OR length(v_body) > 2000 THEN
    RAISE EXCEPTION 'invalid_announcement_body';
  END IF;
  IF p_language NOT IN ('ar','en') THEN
    RAISE EXCEPTION 'invalid_language';
  END IF;

  INSERT INTO announcements (body, language, author_id)
  VALUES (v_body, p_language, auth.uid())
  RETURNING id INTO v_id;

  PERFORM enqueue_push_job(
    'announcement', NULL, v_id, NULL,
    jsonb_build_object(
      'preview',  left(v_body, 120),
      'language', p_language
    )
  );

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- delete_announcement(id)
-- BUILD-SPEC 15.11: "Announcements can be soft deleted, which does not recall
-- the push."
--
-- The second half is the interesting one, and it is honoured by omission: this
-- function does not touch `push_jobs`, `push_deliveries` or `push_sent_at`. A
-- notification already on somebody's lock screen cannot be recalled by anyone,
-- and pretending otherwise would be worse than saying so. What the soft delete
-- does is take the message out of 14.11's list; what it cannot do is unsay it.
--
-- Deliberately not a DELETE. 7.3's player policy is `is_deleted = false`, so
-- the row stops being readable the moment this runs, and the coach keeps a
-- record of what was sent.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_announcement(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE announcements SET is_deleted = true WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'announcement_not_found'; END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- notify_waitlist(session), replacing 0022's version
-- BUILD-SPEC 8.4, D27, D28, and assumption A39 closed
--
-- 0022 implemented steps 1, 2, 3 and 5 and stopped short of step 4 — "insert a
-- push job row for each, then call the send-push edge function" — because
-- there was no push job table and no edge function. Both exist now, so step 4
-- lands and A39 is closed.
--
-- Everything else is unchanged, and step 1 is still the first thing that
-- happens. D28: a spot freed 40 minutes before start enqueues nothing, so
-- there is no row for the drain to find and nothing to send. The silence is a
-- property of this function, not of the sender.
--
-- The audience is frozen here: the players stamped by this call, and nobody
-- else. A player who joins the list after the spot has already been claimed is
-- not in the array, so he is not told about a spot that no longer exists.
--
-- The payload carries the venue in both languages and the start time, because
-- section 18's body is "{{venue}}, {{time}}" rendered in the *device's*
-- language, and because the coach may edit the session between the enqueue and
-- the send. What was true when the spot opened is what gets sent.
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_waitlist(p_session_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_session    session_instances;
  v_venue      venues;
  v_taken      integer;
  v_recipients uuid[];
BEGIN
  SELECT * INTO v_session FROM session_instances WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Step 1. D28. Before anything else is read.
  IF now() > v_session.starts_at - interval '1 hour' THEN RETURN 0; END IF;

  -- A cancelled session has no spot to offer either.
  IF v_session.status <> 'scheduled' THEN RETURN 0; END IF;

  -- Step 2
  SELECT COUNT(*) INTO v_taken FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed';
  IF v_taken >= v_session.capacity THEN RETURN 0; END IF;

  -- Steps 3 and 5. No ordering: D27 says everyone is notified at once and the
  -- first to press reserve wins.
  WITH stamped AS (
    UPDATE waitlist_entries
    SET notified_at = now()
    WHERE session_id = p_session_id
      AND left_at IS NULL
    RETURNING player_id
  )
  SELECT array_agg(player_id) INTO v_recipients FROM stamped;

  IF v_recipients IS NULL OR cardinality(v_recipients) = 0 THEN RETURN 0; END IF;

  -- Step 4
  SELECT * INTO v_venue FROM venues WHERE id = v_session.venue_id;

  PERFORM enqueue_push_job(
    'waitlist_spot', p_session_id, NULL, v_recipients,
    jsonb_build_object(
      'venueEn',  COALESCE(v_venue.name_en, ''),
      'venueAr',  COALESCE(v_venue.name_ar, ''),
      'startsAt', to_char(v_session.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );

  RETURN cardinality(v_recipients);
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_waitlist(uuid)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION publish_announcement(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION delete_announcement(uuid)      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION notify_waitlist(uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION publish_announcement(text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION delete_announcement(uuid)         TO authenticated;
