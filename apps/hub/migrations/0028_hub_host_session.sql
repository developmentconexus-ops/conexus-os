BEGIN;

-- The Hub session joins iam.host_session as kind HUB: the Hub cookie, its CSRF digest, its sliding idle
-- limit of 30 minutes inside an absolute 8 hours, and the sealed Keycloak refresh token of the sign-in, so
-- the Hub asks Keycloak at most every five minutes through the same check as an application session.
-- iam.session goes. Its open sessions hold no refresh token and cannot be checked, so they end: each person
-- signs in once again (operator decision 4). The Previews they opened end with them.

ALTER TABLE iam.handoff DROP CONSTRAINT handoff_parent_digest_fkey;
ALTER TABLE iam.host_session DROP CONSTRAINT host_session_parent_digest_fkey;
DELETE FROM iam.handoff WHERE kind = 'PREVIEW';
DELETE FROM iam.host_session WHERE kind = 'PREVIEW';
DELETE FROM iam.preview;

ALTER TABLE iam.host_session ADD COLUMN csrf_digest bytea;
ALTER TABLE iam.host_session ADD COLUMN idle_expires_at timestamp with time zone;

ALTER TABLE iam.host_session DROP CONSTRAINT host_session_kind_check;
ALTER TABLE iam.host_session DROP CONSTRAINT host_session_application_check;
ALTER TABLE iam.host_session DROP CONSTRAINT host_session_preview_check;
ALTER TABLE iam.host_session ADD CONSTRAINT host_session_kind_check CHECK (kind = ANY (ARRAY['HUB'::text, 'APPLICATION'::text, 'PREVIEW'::text]));
ALTER TABLE iam.host_session ADD CONSTRAINT host_session_hub_check CHECK (kind <> 'HUB' OR (csrf_digest IS NOT NULL
  AND idle_expires_at IS NOT NULL AND idle_expires_at <= absolute_expires_at
  AND absolute_expires_at = started_at + interval '8 hours' AND provider_checked_at >= started_at
  AND (ended_at IS NULL) = (provider_refresh_token IS NOT NULL)
  AND project_id IS NULL AND preview_id IS NULL AND parent_digest IS NULL));
ALTER TABLE iam.host_session ADD CONSTRAINT host_session_application_check CHECK (kind <> 'APPLICATION' OR (project_id IS NOT NULL
  AND absolute_expires_at = started_at + interval '8 hours' AND provider_checked_at >= started_at
  AND (ended_at IS NULL) = (provider_refresh_token IS NOT NULL)
  AND preview_id IS NULL AND parent_digest IS NULL AND csrf_digest IS NULL AND idle_expires_at IS NULL));
ALTER TABLE iam.host_session ADD CONSTRAINT host_session_preview_check CHECK (kind <> 'PREVIEW' OR (preview_id IS NOT NULL AND parent_digest IS NOT NULL
  AND absolute_expires_at > started_at AND absolute_expires_at <= started_at + interval '15 minutes'
  AND project_id IS NULL AND provider_refresh_token IS NULL AND provider_checked_at IS NULL
  AND csrf_digest IS NULL AND idle_expires_at IS NULL));

-- A Preview and its entry handoff point to the Hub session that opened it.
ALTER TABLE iam.host_session ADD CONSTRAINT host_session_parent_digest_fkey FOREIGN KEY (parent_digest) REFERENCES iam.host_session(token_digest);
ALTER TABLE iam.handoff ADD CONSTRAINT handoff_parent_digest_fkey FOREIGN KEY (parent_digest) REFERENCES iam.host_session(token_digest);

CREATE INDEX host_session_open_children ON iam.host_session USING btree (parent_digest) WHERE (parent_digest IS NOT NULL AND ended_at IS NULL);

CREATE OR REPLACE FUNCTION iam.hub_session_live(p_session_digest bytea, p_account_id uuid, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM iam.host_session AS hub JOIN iam.account AS person ON person.account_id = hub.account_id
    WHERE hub.token_digest = p_session_digest AND hub.kind = 'HUB' AND hub.account_id = p_account_id AND hub.ended_at IS NULL
      AND p_now < hub.idle_expires_at AND p_now < hub.absolute_expires_at AND person.active
      AND iam.account_access_scope(person.account_id) = 'CONTROL_PLANE');
$$;

DROP TABLE iam.session;

-- Opens a Hub session for an active Control Plane Account. An Account born from an application invitation,
-- and in no Workspace, never holds one.
CREATE FUNCTION iam.open_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  is_active boolean;
BEGIN
  SELECT person.active INTO is_active FROM iam.account AS person WHERE person.account_id = p_account_id FOR UPDATE;
  IF NOT FOUND OR NOT is_active THEN
    RETURN 'ACCOUNT_INACTIVE';
  END IF;
  IF iam.account_access_scope(p_account_id) <> 'CONTROL_PLANE' THEN
    RETURN 'IDENTITY_NOT_ELIGIBLE';
  END IF;
  INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, csrf_digest, idle_expires_at,
    provider_refresh_token, provider_checked_at)
  VALUES (p_session_digest, 'HUB', p_account_id, p_now, p_now + interval '8 hours', p_csrf_digest, p_now + interval '30 minutes',
    p_refresh_token, p_now);
  RETURN 'OPENED';
END;
$$;

ALTER FUNCTION iam.open_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.open_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.open_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) TO hub_iam_runtime;

-- A Hub request: the session is open, inside its idle and absolute limits, of an active Control Plane
-- Account, and carries the CSRF token when one is given. The same statement slides the idle limit. One found
-- past a limit is ended here. The sealed refresh token is handed out only when the five-minute Keycloak check
-- is due.
CREATE FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, issuer text, subject text, display_name text, email text, provider_checked_at timestamp with time zone, due_provider_refresh_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  found_session iam.host_session%ROWTYPE;
BEGIN
  SELECT session.* INTO found_session FROM iam.host_session AS session
  WHERE session.token_digest = p_session_digest AND session.kind = 'HUB' AND session.ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF p_now >= found_session.idle_expires_at OR p_now >= found_session.absolute_expires_at THEN
    PERFORM iam.end_host_session(p_session_digest, 'EXPIRED');
    RETURN;
  END IF;
  IF p_csrf_digest IS NOT NULL AND p_csrf_digest <> found_session.csrf_digest THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.account AS person WHERE person.account_id = found_session.account_id AND person.active
    AND iam.account_access_scope(person.account_id) = 'CONTROL_PLANE') THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH slid AS (
    UPDATE iam.host_session AS session
    SET idle_expires_at = least(p_now + interval '30 minutes', session.absolute_expires_at)
    WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    RETURNING session.account_id, session.provider_checked_at, session.provider_refresh_token
  )
  SELECT person.account_id, person.issuer, person.external_subject, person.display_name, person.email, slid.provider_checked_at,
    CASE WHEN slid.provider_checked_at <= p_now - interval '5 minutes' THEN slid.provider_refresh_token END
  FROM slid JOIN iam.account AS person ON person.account_id = slid.account_id;
END;
$$;

ALTER FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_now timestamp with time zone) TO hub_iam_runtime;

-- Ending a session ends the Previews it opened and withdraws their entry handoffs.
CREATE OR REPLACE FUNCTION iam.end_host_session(p_session_digest bytea, p_reason text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  DELETE FROM iam.handoff AS handoff WHERE handoff.parent_digest = p_session_digest;
  UPDATE iam.host_session AS session
  SET ended_at = clock_timestamp(),
    ended_reason = CASE WHEN session.token_digest = p_session_digest THEN p_reason ELSE 'PARENT_ENDED' END,
    provider_refresh_token = NULL
  WHERE (session.token_digest = p_session_digest OR session.parent_digest = p_session_digest) AND session.ended_at IS NULL;
$$;

COMMIT;
