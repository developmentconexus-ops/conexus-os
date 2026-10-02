BEGIN;

-- Signing out of the Hub still needs only the session and its CSRF token, never Keycloak: the session and
-- its Previews end here whatever Keycloak later answers. The sealed refresh token is handed back, once, so
-- the Hub can then ask Keycloak to end the sign-in's SSO session. NULL when no open Hub session ended.
DROP FUNCTION iam.end_hub_session(p_session_digest bytea, p_csrf_digest bytea);

CREATE FUNCTION iam.end_hub_session(p_session_digest bytea, p_csrf_digest bytea) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  sealed text;
BEGIN
  SELECT session.provider_refresh_token INTO sealed FROM iam.host_session AS session
  WHERE session.token_digest = p_session_digest AND session.kind = 'HUB' AND session.ended_at IS NULL
    AND session.csrf_digest = p_csrf_digest
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM iam.end_host_session(p_session_digest, 'SIGNED_OUT');
  RETURN sealed;
END;
$$;

ALTER FUNCTION iam.end_hub_session(p_session_digest bytea, p_csrf_digest bytea) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.end_hub_session(p_session_digest bytea, p_csrf_digest bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.end_hub_session(p_session_digest bytea, p_csrf_digest bytea) TO hub_iam_runtime;

COMMIT;
