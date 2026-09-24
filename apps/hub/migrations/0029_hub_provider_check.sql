BEGIN;

-- The Hub and every Preview it opened are checked against Keycloak through the same check as an
-- application session: at most every five minutes, a request refreshes the Hub session's sealed token. A
-- Preview request makes the check of the Hub session behind it, so a person disabled or signed out in
-- Keycloak loses the Hub and their Previews within five minutes.

-- The check is recorded by compare-and-set on the check time the request read. The answer is whether the
-- session is still open: a request that lost the race is served, one whose session ended meanwhile is not.
CREATE OR REPLACE FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE iam.host_session AS session
  SET provider_checked_at = p_now, provider_refresh_token = p_refresh_token
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    AND session.provider_checked_at = p_previous_checked_at;
  RETURN EXISTS (SELECT 1 FROM iam.host_session AS session WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL);
END;
$$;

DROP FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone);

-- A Preview session is valid only on its Preview's host, before its limit, and while the Hub session that
-- opened it is live. One whose Hub session ended, idled out or lost its Account is ended here. The Hub
-- session's sealed refresh token is handed out only when its five-minute Keycloak check is due.
CREATE FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, email text, display_name text, subject text, project_id uuid, source_revision text, artifact_revision_id uuid, artifact_digest text, manifest jsonb, expires_at timestamp with time zone, hub_digest bytea, hub_checked_at timestamp with time zone, due_hub_refresh_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  found_session iam.host_session%ROWTYPE;
  shown iam.preview%ROWTYPE;
BEGIN
  SELECT session.* INTO found_session FROM iam.host_session AS session
  WHERE session.token_digest = p_session_digest AND session.kind = 'PREVIEW' AND session.ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT preview.* INTO shown FROM iam.preview AS preview WHERE preview.preview_id = found_session.preview_id;
  IF shown.exact_host <> p_exact_host THEN
    RETURN;
  END IF;
  IF p_now >= found_session.absolute_expires_at THEN
    PERFORM iam.end_host_session(p_session_digest, 'EXPIRED');
    RETURN;
  END IF;
  IF NOT iam.hub_session_live(found_session.parent_digest, found_session.account_id, p_now) THEN
    PERFORM iam.end_host_session(p_session_digest, 'PARENT_ENDED');
    RETURN;
  END IF;
  RETURN QUERY
  SELECT person.account_id, person.email, person.display_name, person.external_subject, shown.project_id, shown.source_revision,
    shown.artifact_revision_id, shown.artifact_digest, shown.manifest, found_session.absolute_expires_at,
    hub.token_digest, hub.provider_checked_at,
    CASE WHEN hub.provider_checked_at <= p_now - interval '5 minutes' THEN hub.provider_refresh_token END
  FROM iam.account AS person, iam.host_session AS hub
  -- Checked again in the query that hands out the token: a Hub session a concurrent refusal ended after the
  -- check above has no token left, and must not read as a check that is not due.
  WHERE person.account_id = found_session.account_id AND hub.token_digest = found_session.parent_digest
    AND hub.ended_at IS NULL AND iam.hub_session_live(hub.token_digest, person.account_id, p_now);
END;
$$;

ALTER FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) TO hub_iam_runtime;

COMMIT;
