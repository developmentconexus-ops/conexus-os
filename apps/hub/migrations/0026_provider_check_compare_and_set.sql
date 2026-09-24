BEGIN;

-- Keycloak no longer rotates refresh tokens (revokeRefreshToken is false in the Conexus realm), so a token
-- works any number of times and two requests may refresh at once. The claim protocol 0024 built
-- for rotation, and the clock correction of 0025, go. A due check is answered by whichever
-- request finds it: each asks Keycloak, each is served, and the first to record it stores its token.
ALTER TABLE iam.application_session DROP CONSTRAINT application_session_claim_check;

DROP FUNCTION iam.claim_provider_check(p_session_digest bytea, p_claim uuid, p_now timestamp with time zone);
DROP FUNCTION iam.release_provider_check(p_session_digest bytea, p_claim uuid);
DROP FUNCTION iam.record_provider_check(p_session_digest bytea, p_claim uuid, p_refresh_token text, p_now timestamp with time zone);

ALTER TABLE iam.application_session DROP COLUMN provider_check_claim;
ALTER TABLE iam.application_session DROP COLUMN provider_check_claimed_at;

-- Compare-and-set on the check time the request read: of requests that found the same check due,
-- one stores its token and the others are still served, since their own refresh was answered too.
CREATE FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE iam.application_session AS session
  SET provider_checked_at = p_now, provider_refresh_token = p_refresh_token
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    AND session.provider_checked_at = p_previous_checked_at;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) TO hub_iam_runtime;

-- Resolution hands out the sealed refresh token only when the five-minute check is due, so the
-- interval has one definition, here, and a request that is not due never reads the token.
DROP FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone);

CREATE FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, email text, display_name text, subject text, provider_checked_at timestamp with time zone, absolute_expires_at timestamp with time zone, due_provider_refresh_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  found_session iam.application_session%ROWTYPE;
BEGIN
  SELECT session.* INTO found_session FROM iam.application_session AS session
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL;
  IF NOT FOUND OR found_session.project_id <> p_project_id THEN
    RETURN;
  END IF;
  IF p_now >= found_session.absolute_expires_at THEN
    PERFORM iam.end_application_session(p_session_digest, 'EXPIRED');
    RETURN;
  END IF;
  IF NOT iam.has_application_access(found_session.account_id, found_session.project_id) THEN
    PERFORM iam.end_application_session(p_session_digest, 'ACCESS_ENDED');
    RETURN;
  END IF;
  RETURN QUERY
  SELECT person.account_id, person.email, person.display_name, person.external_subject,
    found_session.provider_checked_at, found_session.absolute_expires_at,
    CASE WHEN found_session.provider_checked_at <= p_now - interval '5 minutes' THEN found_session.provider_refresh_token END
  FROM iam.account AS person WHERE person.account_id = found_session.account_id;
END;
$$;

ALTER FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) TO hub_iam_runtime;

COMMIT;
