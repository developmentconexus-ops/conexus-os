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

-- A callback that finds no Account and then no invitation may have lost the race in between: the
-- winner provisioned the Account and claimed the invitation. The Account is looked up again before
-- answering none; the winner commits the Account before it claims, so a claimed invitation means a
-- committed Account.
CREATE OR REPLACE FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  normalized_email text := lower(btrim(p_verified_email));
  provisioned uuid;
BEGIN
  SELECT existing.account_id INTO provisioned FROM iam.account AS existing
  WHERE existing.issuer = p_issuer AND existing.external_subject = p_subject;
  IF FOUND THEN
    RETURN provisioned;
  END IF;
  IF p_verified_email IS NULL OR NOT EXISTS (
    SELECT 1 FROM iam.application_invitation AS invitation
    WHERE invitation.email = normalized_email AND invitation.expires_at > clock_timestamp())
  THEN
    SELECT existing.account_id INTO provisioned FROM iam.account AS existing
    WHERE existing.issuer = p_issuer AND existing.external_subject = p_subject;
    RETURN provisioned;
  END IF;
  INSERT INTO iam.account (account_id, issuer, external_subject, display_name, email, origin)
  VALUES (p_account_id, p_issuer, p_subject, coalesce(nullif(btrim(p_display_name), ''), normalized_email), normalized_email, 'APPLICATION_INVITATION')
  ON CONFLICT (issuer, external_subject) DO NOTHING
  RETURNING iam.account.account_id INTO provisioned;
  IF provisioned IS NULL THEN
    SELECT existing.account_id INTO provisioned FROM iam.account AS existing
    WHERE existing.issuer = p_issuer AND existing.external_subject = p_subject;
  END IF;
  RETURN provisioned;
END;
$$;

COMMIT;
