BEGIN;

-- A claim ages by the database clock, which every Hub shares. With the Hub's own clock, a Hub whose
-- clock ran a minute ahead took over a claim still in flight, and both spent the same rotating token.
-- The check falls due by the Hub's clock, as before, because provider_checked_at is written from it.
CREATE OR REPLACE FUNCTION iam.claim_provider_check(p_session_digest bytea, p_claim uuid, p_now timestamp with time zone) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  UPDATE iam.application_session AS session
  SET provider_check_claim = p_claim, provider_check_claimed_at = clock_timestamp()
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    AND session.provider_checked_at <= p_now - interval '5 minutes'
    AND (session.provider_check_claim IS NULL OR session.provider_check_claimed_at <= clock_timestamp() - interval '1 minute')
  RETURNING session.provider_refresh_token;
$$;

COMMIT;
