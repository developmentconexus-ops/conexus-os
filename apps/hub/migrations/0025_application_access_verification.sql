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

-- A revoke is keyed by the Account, not by an email. Revoking withdrew the invitations to the
-- Account's stored email, but a sign-in claims by the address Keycloak verifies, which the stored
-- email need not be; an invitation to the verified address outlived the revoke. Now a revocation
-- voids every invitation to that application issued before it, for that Account, whatever address it
-- names: claiming one grants nothing. An invitation's created_at is when it was last issued, so an
-- Owner granting again after the revoke is honoured.
CREATE OR REPLACE FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  claimed_count integer;
BEGIN
  IF p_verified_email IS NULL THEN
    RETURN 0;
  END IF;
  WITH claimed AS (
    DELETE FROM iam.application_invitation AS invitation
    WHERE invitation.email = lower(btrim(p_verified_email))
      AND invitation.expires_at > clock_timestamp()
    RETURNING invitation.project_id, invitation.invited_by, invitation.created_at
  ), granted AS (
    INSERT INTO iam.application_grant (project_id, account_id, granted_by)
    SELECT claimed.project_id, p_account_id, claimed.invited_by FROM claimed
    WHERE NOT EXISTS (
      SELECT 1 FROM iam.application_grant AS revoked
      WHERE revoked.project_id = claimed.project_id AND revoked.account_id = p_account_id
        AND revoked.revoked_at >= claimed.created_at)
    ON CONFLICT (project_id, account_id) WHERE revoked_at IS NULL DO NOTHING
    RETURNING iam.application_grant.grant_id
  )
  SELECT count(*) FROM claimed INTO claimed_count;
  RETURN claimed_count;
END;
$$;

CREATE OR REPLACE FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) RETURNS TABLE(kind text, entry_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  normalized_email text := lower(btrim(p_email));
  base_slug text;
  candidate_slug text;
  attempt integer := 1;
  held_grant_id uuid;
  settled_invitation_id uuid;
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  IF NOT EXISTS (SELECT 1 FROM iam.application AS existing WHERE existing.project_id = p_project_id) THEN
    SELECT iam.application_slug_base(stored_project.name) INTO base_slug
    FROM project.project AS stored_project
    WHERE stored_project.project_id = p_project_id;
    candidate_slug := base_slug;
    LOOP
      INSERT INTO iam.application (project_id, slug, created_by)
      VALUES (p_project_id, candidate_slug, p_actor)
      ON CONFLICT DO NOTHING;
      EXIT WHEN EXISTS (SELECT 1 FROM iam.application AS settled WHERE settled.project_id = p_project_id);
      attempt := attempt + 1;
      candidate_slug := rtrim(left(base_slug, 40 - length('-' || attempt)), '-') || '-' || attempt;
    END LOOP;
  END IF;
  SELECT access_grant.grant_id INTO held_grant_id
  FROM iam.application_grant AS access_grant
  JOIN iam.account AS grantee ON grantee.account_id = access_grant.account_id
  WHERE access_grant.project_id = p_project_id AND access_grant.revoked_at IS NULL
    AND lower(btrim(grantee.email)) = normalized_email;
  IF FOUND THEN
    RETURN QUERY SELECT 'grant'::text, held_grant_id;
    RETURN;
  END IF;
  INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at)
  VALUES (p_invitation_id, p_project_id, normalized_email, p_actor, p_expires_at)
  ON CONFLICT (project_id, email) DO UPDATE
    SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at, created_at = clock_timestamp()
  RETURNING iam.application_invitation.invitation_id INTO settled_invitation_id;
  RETURN QUERY SELECT 'invitation'::text, settled_invitation_id;
END;
$$;

COMMIT;
