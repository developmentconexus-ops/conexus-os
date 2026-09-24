BEGIN;

-- A grant's tenure ends only when an Owner revokes it. Before 0024 a repeat grant to a person who
-- already held one opened a fresh invitation, revoking the grant left that invitation open, and the
-- person's next sign-in claimed it: the revoke did not hold. Now a repeat grant answers the open
-- grant and opens nothing, and revoking a grant withdraws every invitation to the grantee's email
-- on that application.
DROP FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone);

CREATE FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) RETURNS TABLE(kind text, entry_id uuid)
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
    SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at
  RETURNING iam.application_invitation.invitation_id INTO settled_invitation_id;
  RETURN QUERY SELECT 'invitation'::text, settled_invitation_id;
END;
$$;

ALTER FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) TO hub_iam_runtime;

CREATE OR REPLACE FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  grantee uuid;
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  UPDATE iam.application_grant AS access_grant
  SET revoked_at = clock_timestamp(), revoked_by = p_actor
  WHERE access_grant.grant_id = p_grant_id AND access_grant.project_id = p_project_id
    AND access_grant.revoked_at IS NULL
  RETURNING access_grant.account_id INTO grantee;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  DELETE FROM iam.application_invitation AS invitation
  USING iam.account AS person
  WHERE person.account_id = grantee AND invitation.project_id = p_project_id
    AND invitation.email = lower(btrim(person.email));
  IF NOT iam.has_application_access(grantee, p_project_id) THEN
    UPDATE iam.application_session AS session
    SET ended_at = clock_timestamp(), ended_reason = 'ACCESS_ENDED', provider_refresh_token = NULL
    WHERE session.account_id = grantee AND session.project_id = p_project_id AND session.ended_at IS NULL;
    DELETE FROM iam.application_handoff AS handoff WHERE handoff.account_id = grantee AND handoff.project_id = p_project_id;
  END IF;
  RETURN true;
END;
$$;

-- The Keycloak refresh token is sealed at rest with the installation's credential key (the
-- Factory's AES-256-GCM envelope), in the handoff and in the session, and the database refuses any
-- other value. Tokens written before 0024 are plaintext: their handoffs go and their sessions end, so
-- the person signs in again.
DELETE FROM iam.application_handoff;

ALTER TABLE iam.application_session DROP CONSTRAINT application_session_reason_check;
ALTER TABLE iam.application_session ADD CONSTRAINT application_session_reason_check CHECK (ended_reason IS NULL OR ended_reason = ANY (ARRAY[
  'SIGNED_OUT'::text, 'ACCESS_ENDED'::text, 'EXPIRED'::text, 'CUSTODY_CHANGED'::text,
  'PROVIDER_REFUSED'::text, 'PROVIDER_USER_DISABLED'::text, 'PROVIDER_SESSION_ENDED'::text]));

UPDATE iam.application_session
SET ended_at = clock_timestamp(), ended_reason = 'CUSTODY_CHANGED', provider_refresh_token = NULL
WHERE ended_at IS NULL;

ALTER TABLE iam.application_handoff ADD CONSTRAINT application_handoff_token_sealed_check CHECK (provider_refresh_token LIKE 'mastra:factory-secret:v1:%');
ALTER TABLE iam.application_session ADD CONSTRAINT application_session_token_sealed_check CHECK (provider_refresh_token IS NULL OR provider_refresh_token LIKE 'mastra:factory-secret:v1:%');

-- Keycloak rotates the refresh token and refuses a reused one, so exactly one request may spend a
-- session's token at a time. A request claims the due check first; the claim is released by storing
-- the rotated token, by ending the session, or by Keycloak being unreachable. A claim older than a
-- minute is taken over, since no refresh takes that long.
ALTER TABLE iam.application_session ADD COLUMN provider_check_claim uuid;
ALTER TABLE iam.application_session ADD COLUMN provider_check_claimed_at timestamp with time zone;
ALTER TABLE iam.application_session ADD CONSTRAINT application_session_claim_check CHECK ((provider_check_claim IS NULL) = (provider_check_claimed_at IS NULL));

-- Returns the sealed refresh token to the one request that won the claim, and NULL to every other.
CREATE FUNCTION iam.claim_provider_check(p_session_digest bytea, p_claim uuid, p_now timestamp with time zone) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  UPDATE iam.application_session AS session
  SET provider_check_claim = p_claim, provider_check_claimed_at = p_now
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    AND session.provider_checked_at <= p_now - interval '5 minutes'
    AND (session.provider_check_claim IS NULL OR session.provider_check_claimed_at <= p_now - interval '1 minute')
  RETURNING session.provider_refresh_token;
$$;

ALTER FUNCTION iam.claim_provider_check(p_session_digest bytea, p_claim uuid, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.claim_provider_check(p_session_digest bytea, p_claim uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.claim_provider_check(p_session_digest bytea, p_claim uuid, p_now timestamp with time zone) TO hub_iam_runtime;

-- The rotated token is stored in the same statement that releases the claim, and only by its holder.
DROP FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone);

CREATE FUNCTION iam.record_provider_check(p_session_digest bytea, p_claim uuid, p_refresh_token text, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE iam.application_session AS session
  SET provider_checked_at = p_now, provider_refresh_token = p_refresh_token,
    provider_check_claim = NULL, provider_check_claimed_at = NULL
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    AND session.provider_check_claim = p_claim;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION iam.record_provider_check(p_session_digest bytea, p_claim uuid, p_refresh_token text, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.record_provider_check(p_session_digest bytea, p_claim uuid, p_refresh_token text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.record_provider_check(p_session_digest bytea, p_claim uuid, p_refresh_token text, p_now timestamp with time zone) TO hub_iam_runtime;

-- Keycloak could not be asked: the token was not spent, so the next request may try again.
CREATE FUNCTION iam.release_provider_check(p_session_digest bytea, p_claim uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  UPDATE iam.application_session AS session
  SET provider_check_claim = NULL, provider_check_claimed_at = NULL
  WHERE session.token_digest = p_session_digest AND session.provider_check_claim = p_claim;
$$;

ALTER FUNCTION iam.release_provider_check(p_session_digest bytea, p_claim uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.release_provider_check(p_session_digest bytea, p_claim uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.release_provider_check(p_session_digest bytea, p_claim uuid) TO hub_iam_runtime;

-- Resolution no longer hands out the refresh token: only the holder of a claim receives it. It
-- takes no row lock either: every write to a session (ending it, claiming or recording a check) is
-- a guarded update of its own, so a request never waits behind another on the same session.
DROP FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone);

CREATE FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, email text, display_name text, subject text, provider_checked_at timestamp with time zone, absolute_expires_at timestamp with time zone)
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
    found_session.provider_checked_at, found_session.absolute_expires_at
  FROM iam.account AS person WHERE person.account_id = found_session.account_id;
END;
$$;

ALTER FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) TO hub_iam_runtime;

-- Provisioning answers the Account of the identity. Two callbacks for one new identity may both have
-- looked it up before either provisioned it; the one that finds it provisioned, and its invitation
-- already claimed, gets that Account instead of no access.
DROP FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text);

CREATE FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) RETURNS uuid
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
    RETURN NULL;
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

ALTER FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) TO hub_iam_runtime;

-- One statement reads one file of the served artifact: it resolves the served revision, checks
-- access, and takes only the requested element of the payload. A NULL revision means whatever is
-- served now (a page or asset); a revision pins the server tree one API request reads file by file.
-- A served artifact without the file answers its revision and no file; nothing served, no access or
-- a pinned revision no longer served answers no row.
DROP FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text);

CREATE FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) RETURNS TABLE(artifact_revision_id uuid, path text, media_type text, bytes bytea, sha256 text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT revision.artifact_revision_id, file->>'path', file->>'mediaType', decode(file->>'base64', 'base64'), file->>'sha256'
  FROM builder.served_preview_revision(p_project_id) AS served
  JOIN reg.artifact_revision AS revision ON revision.artifact_revision_id = served.artifact_revision_id
  JOIN reg.artifact AS artifact ON artifact.artifact_id = revision.artifact_id
  LEFT JOIN LATERAL jsonb_path_query_first(revision.payload, '$.files[*] ? (@.path == $path)', jsonb_build_object('path', p_path)) AS file ON true
  WHERE iam.has_application_access(p_account_id, p_project_id)
    AND artifact.project_id = p_project_id AND artifact.kind = 'application'
    AND revision.source_revision = served.source_revision AND revision.digest = served.artifact_digest
    AND revision.availability = 'AVAILABLE'
    AND (p_artifact_revision_id IS NULL OR revision.artifact_revision_id = p_artifact_revision_id);
$$;

ALTER FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) OWNER TO registry_owner;

REVOKE ALL ON FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) TO hub_builder_executor;

COMMIT;
