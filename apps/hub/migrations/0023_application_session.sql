BEGIN;

-- An Account born from an application invitation is app-only: it never holds a Hub session while it
-- belongs to no Workspace. Every other Account, and an app-only one that later claims a Workspace
-- invitation, is a Control Plane Account. The scope is derived here, never stored as a flag.
ALTER TABLE iam.account ADD COLUMN origin text DEFAULT 'CONTROL_PLANE' NOT NULL;
ALTER TABLE iam.account ADD CONSTRAINT account_origin_check CHECK (origin = ANY (ARRAY['CONTROL_PLANE'::text, 'APPLICATION_INVITATION'::text]));

CREATE FUNCTION iam.account_access_scope(p_account_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN stored_account.origin = 'CONTROL_PLANE' OR EXISTS (
      SELECT 1 FROM iam.workspace_membership AS membership WHERE membership.account_id = stored_account.account_id)
    THEN 'CONTROL_PLANE'
    ELSE 'APPLICATION_ONLY'
  END
  FROM iam.account AS stored_account
  WHERE stored_account.account_id = p_account_id;
$$;

ALTER FUNCTION iam.account_access_scope(p_account_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.account_access_scope(p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.account_access_scope(p_account_id uuid) TO hub_iam_runtime;

-- Who may use an application right now: an active Account with an open grant for it, or a current
-- member of the Project's Workspace. The Project must not be archived. Every application request
-- asks again, so a revoked grant or a removed membership stops the person at their next request.
CREATE FUNCTION iam.has_application_access(p_account_id uuid, p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.application AS application
    JOIN project.project AS stored_project ON stored_project.project_id = application.project_id
    JOIN iam.account AS person ON person.account_id = p_account_id AND person.active
    WHERE application.project_id = p_project_id
      AND NOT stored_project.archived
      AND (EXISTS (
          SELECT 1 FROM iam.application_grant AS access_grant
          WHERE access_grant.project_id = application.project_id
            AND access_grant.account_id = person.account_id
            AND access_grant.revoked_at IS NULL)
        OR EXISTS (
          SELECT 1 FROM iam.workspace_membership AS membership
          WHERE membership.workspace_id = stored_project.workspace_id
            AND membership.account_id = person.account_id)));
$$;

ALTER FUNCTION iam.has_application_access(p_account_id uuid, p_project_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.has_application_access(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.has_application_access(p_account_id uuid, p_project_id uuid) TO registry_owner;

CREATE FUNCTION iam.application_by_slug(p_slug text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT application.project_id FROM iam.application AS application WHERE application.slug = p_slug;
$$;

ALTER FUNCTION iam.application_by_slug(p_slug text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.application_by_slug(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.application_by_slug(p_slug text) TO hub_iam_runtime;

CREATE FUNCTION iam.application_slug(p_project_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT application.slug FROM iam.application AS application WHERE application.project_id = p_project_id;
$$;

ALTER FUNCTION iam.application_slug(p_project_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.application_slug(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.application_slug(p_project_id uuid) TO hub_iam_runtime;

-- A sign-in that began at an application host returns there. The return is stored with the OIDC
-- transaction and never read from the callback.
ALTER TABLE iam.oidc_transaction ADD COLUMN application_project_id uuid;
ALTER TABLE iam.oidc_transaction ADD COLUMN sign_in_binding_digest bytea;
ALTER TABLE iam.oidc_transaction ADD CONSTRAINT oidc_transaction_application_project_id_fkey FOREIGN KEY (application_project_id) REFERENCES iam.application(project_id);
ALTER TABLE iam.oidc_transaction ADD CONSTRAINT oidc_transaction_return_check CHECK ((application_project_id IS NULL) = (sign_in_binding_digest IS NULL));

-- The Hub callback hands the application host a one-use proof of this sign-in: bound to the Account
-- and the application, to the browser that started it (the binding), and to sixty seconds.
-- Redemption is DELETE ... RETURNING, so a second redemption finds nothing.
CREATE TABLE iam.application_handoff (
    handoff_digest bytea NOT NULL,
    account_id uuid NOT NULL,
    project_id uuid NOT NULL,
    sign_in_binding_digest bytea NOT NULL,
    provider_refresh_token text NOT NULL,
    authenticated_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT application_handoff_pkey PRIMARY KEY (handoff_digest),
    CONSTRAINT application_handoff_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT application_handoff_project_id_fkey FOREIGN KEY (project_id) REFERENCES iam.application(project_id),
    CONSTRAINT application_handoff_ttl_check CHECK (expires_at > authenticated_at AND expires_at <= authenticated_at + interval '60 seconds')
);

ALTER TABLE iam.application_handoff OWNER TO iam_owner;

-- One person in one application through one opaque cookie on that application's host. The Keycloak
-- refresh token stays here, server side, so the Hub can ask Keycloak again at most every five
-- minutes; an ended session no longer holds it.
CREATE TABLE iam.application_session (
    token_digest bytea NOT NULL,
    account_id uuid NOT NULL,
    project_id uuid NOT NULL,
    provider_refresh_token text,
    authenticated_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    provider_checked_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    ended_reason text,
    CONSTRAINT application_session_pkey PRIMARY KEY (token_digest),
    CONSTRAINT application_session_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT application_session_project_id_fkey FOREIGN KEY (project_id) REFERENCES iam.application(project_id),
    CONSTRAINT application_session_absolute_check CHECK (absolute_expires_at = authenticated_at + interval '8 hours'),
    CONSTRAINT application_session_check_order CHECK (provider_checked_at >= authenticated_at),
    CONSTRAINT application_session_end_check CHECK ((ended_at IS NULL) = (ended_reason IS NULL)),
    CONSTRAINT application_session_token_custody_check CHECK ((ended_at IS NULL) = (provider_refresh_token IS NOT NULL)),
    CONSTRAINT application_session_reason_check CHECK (ended_reason IS NULL OR ended_reason = ANY (ARRAY['SIGNED_OUT'::text, 'ACCESS_ENDED'::text, 'PROVIDER_REFUSED'::text, 'EXPIRED'::text]))
);

ALTER TABLE iam.application_session OWNER TO iam_owner;

CREATE INDEX application_session_open_person ON iam.application_session USING btree (project_id, account_id) WHERE (ended_at IS NULL);

-- An identity with no Account signs in at an application only from an open application invitation
-- to its verified email. Its display name is the provider's name claim, else the email.
CREATE FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  normalized_email text := lower(btrim(p_verified_email));
BEGIN
  IF p_verified_email IS NULL OR NOT EXISTS (
    SELECT 1 FROM iam.application_invitation AS invitation
    WHERE invitation.email = normalized_email AND invitation.expires_at > clock_timestamp())
  THEN
    RETURN false;
  END IF;
  INSERT INTO iam.account (account_id, issuer, external_subject, display_name, email, origin)
  VALUES (p_account_id, p_issuer, p_subject, coalesce(nullif(btrim(p_display_name), ''), normalized_email), normalized_email, 'APPLICATION_INVITATION')
  ON CONFLICT (issuer, external_subject) DO NOTHING;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.provision_application_account(p_account_id uuid, p_issuer text, p_subject text, p_verified_email text, p_display_name text) TO hub_iam_runtime;

CREATE FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text) RETURNS integer
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
    RETURNING invitation.project_id, invitation.invited_by
  ), granted AS (
    INSERT INTO iam.application_grant (project_id, account_id, granted_by)
    SELECT claimed.project_id, p_account_id, claimed.invited_by FROM claimed
    ON CONFLICT (project_id, account_id) WHERE revoked_at IS NULL DO NOTHING
    RETURNING iam.application_grant.grant_id
  )
  SELECT count(*) FROM claimed INTO claimed_count;
  RETURN claimed_count;
END;
$$;

ALTER FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.claim_application_invitations(p_account_id uuid, p_verified_email text) TO hub_iam_runtime;

CREATE FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM iam.application_handoff AS stale WHERE stale.expires_at <= clock_timestamp();
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN
    RETURN false;
  END IF;
  INSERT INTO iam.application_handoff (handoff_digest, account_id, project_id, sign_in_binding_digest, provider_refresh_token, authenticated_at, expires_at)
  VALUES (p_handoff_digest, p_account_id, p_project_id, p_binding_digest, p_refresh_token, p_authenticated_at, p_authenticated_at + interval '60 seconds');
  RETURN true;
END;
$$;

ALTER FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) TO hub_iam_runtime;

-- The handoff is gone after this call whatever it answers, so an attempt on the wrong host or with
-- the wrong binding burns it. The session token is minted by the Hub at redemption; no value the
-- browser held before sign-in has a row.
CREATE FUNCTION iam.redeem_application_handoff(p_handoff_digest bytea, p_project_id uuid, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  redeemed iam.application_handoff%ROWTYPE;
BEGIN
  DELETE FROM iam.application_handoff AS handoff WHERE handoff.handoff_digest = p_handoff_digest
  RETURNING handoff.* INTO redeemed;
  IF NOT FOUND OR redeemed.project_id <> p_project_id OR redeemed.sign_in_binding_digest <> p_binding_digest
    OR p_now >= redeemed.expires_at OR NOT iam.has_application_access(redeemed.account_id, redeemed.project_id)
  THEN
    RETURN NULL;
  END IF;
  INSERT INTO iam.application_session (token_digest, account_id, project_id, provider_refresh_token, authenticated_at, absolute_expires_at, provider_checked_at)
  VALUES (p_session_digest, redeemed.account_id, redeemed.project_id, redeemed.provider_refresh_token,
    redeemed.authenticated_at, redeemed.authenticated_at + interval '8 hours', redeemed.authenticated_at);
  RETURN redeemed.authenticated_at + interval '8 hours';
END;
$$;

ALTER FUNCTION iam.redeem_application_handoff(p_handoff_digest bytea, p_project_id uuid, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.redeem_application_handoff(p_handoff_digest bytea, p_project_id uuid, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.redeem_application_handoff(p_handoff_digest bytea, p_project_id uuid, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) TO hub_iam_runtime;

CREATE FUNCTION iam.end_application_session(p_session_digest bytea, p_reason text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  UPDATE iam.application_session AS session
  SET ended_at = clock_timestamp(), ended_reason = p_reason, provider_refresh_token = NULL
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL;
$$;

ALTER FUNCTION iam.end_application_session(p_session_digest bytea, p_reason text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.end_application_session(p_session_digest bytea, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.end_application_session(p_session_digest bytea, p_reason text) TO hub_iam_runtime;

-- A session is valid only on its own application's host, before its absolute limit, and while the
-- person still has access. A session past its limit or without access is ended here, so its refresh
-- token is dropped at the first request that finds it so.
CREATE FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, email text, display_name text, subject text, provider_checked_at timestamp with time zone, absolute_expires_at timestamp with time zone, provider_refresh_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  found_session iam.application_session%ROWTYPE;
BEGIN
  SELECT session.* INTO found_session FROM iam.application_session AS session
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
  FOR UPDATE;
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
    found_session.provider_checked_at, found_session.absolute_expires_at, found_session.provider_refresh_token
  FROM iam.account AS person WHERE person.account_id = found_session.account_id;
END;
$$;

ALTER FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) TO hub_iam_runtime;

-- Compare-and-set on the previous check time: of two requests that both found the check due, only
-- one stores its rotated refresh token.
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

-- Revoking a grant also ends the person's open sessions and handoffs for the application at once,
-- unless their Workspace membership still gives them access.
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
  IF NOT iam.has_application_access(grantee, p_project_id) THEN
    UPDATE iam.application_session AS session
    SET ended_at = clock_timestamp(), ended_reason = 'ACCESS_ENDED', provider_refresh_token = NULL
    WHERE session.account_id = grantee AND session.project_id = p_project_id AND session.ended_at IS NULL;
    DELETE FROM iam.application_handoff AS handoff WHERE handoff.account_id = grantee AND handoff.project_id = p_project_id;
  END IF;
  RETURN true;
END;
$$;

-- The artifact an application host serves: the Project's last good Preview until Q5 publishes.
CREATE FUNCTION builder.served_preview_revision(p_project_id uuid) RETURNS TABLE(source_revision text, artifact_revision_id uuid, artifact_digest text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT working.last_preview_source_revision, working.last_preview_artifact_revision_id, working.last_preview_artifact_digest
  FROM builder.project_working_state AS working
  WHERE working.project_id = p_project_id AND working.last_preview_source_revision IS NOT NULL;
$$;

ALTER FUNCTION builder.served_preview_revision(p_project_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.served_preview_revision(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.served_preview_revision(p_project_id uuid) TO registry_owner;

-- The served artifact's manifest, for an Account with access to the application only. Access is the
-- application's (a grant or a membership), not Project visibility, so an app-only Account reads it.
CREATE FUNCTION reg.get_served_application(p_account_id uuid, p_project_id uuid) RETURNS TABLE(artifact_revision_id uuid, artifact_digest text, source_revision text, entry_path text, files jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  served record;
  revision_row reg.artifact_revision%ROWTYPE;
BEGIN
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN RETURN; END IF;
  SELECT pointer.* INTO served FROM builder.served_preview_revision(p_project_id) AS pointer;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT revision.* INTO revision_row
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application'
    AND revision.artifact_revision_id = served.artifact_revision_id
    AND revision.source_revision = served.source_revision
    AND revision.digest = served.artifact_digest
    AND revision.availability = 'AVAILABLE';
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, revision_row.source_revision,
    revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object('path', value->>'path', 'mediaType', value->>'mediaType')
      ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS files_list(value));
END;
$$;

ALTER FUNCTION reg.get_served_application(p_account_id uuid, p_project_id uuid) OWNER TO registry_owner;

REVOKE ALL ON FUNCTION reg.get_served_application(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.get_served_application(p_account_id uuid, p_project_id uuid) TO hub_builder_executor;

CREATE FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) RETURNS TABLE(path text, media_type text, bytes bytea, sha256 text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  served record;
  revision_row reg.artifact_revision%ROWTYPE;
BEGIN
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN RETURN; END IF;
  SELECT pointer.* INTO served FROM builder.served_preview_revision(p_project_id) AS pointer;
  IF NOT FOUND OR served.artifact_revision_id <> p_artifact_revision_id THEN RETURN; END IF;
  SELECT revision.* INTO revision_row
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application'
    AND revision.artifact_revision_id = served.artifact_revision_id
    AND revision.digest = served.artifact_digest
    AND revision.availability = 'AVAILABLE';
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT file->>'path', file->>'mediaType', decode(file->>'base64', 'base64'), file->>'sha256'
  FROM jsonb_array_elements(revision_row.payload->'files') AS files_list(file)
  WHERE file->>'path' = p_path;
END;
$$;

ALTER FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) OWNER TO registry_owner;

REVOKE ALL ON FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.read_served_application_file(p_account_id uuid, p_project_id uuid, p_artifact_revision_id uuid, p_path text) TO hub_builder_executor;

COMMIT;
