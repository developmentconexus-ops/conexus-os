BEGIN;

-- One handoff and one host session serve application hosts and Preview hosts. A Preview no longer lives in
-- the Hub process: its launch facts, its entry handoff and its session are rows, so a Preview survives a Hub
-- restart and any Hub serves it. The application tables of 0023 go; their open sessions end, and each person
-- signs in once again.

-- What one Preview launch shows: written once, when the Hub opens it for a developer, and never changed.
CREATE TABLE iam.preview (
    preview_id uuid NOT NULL,
    account_id uuid NOT NULL,
    project_id uuid NOT NULL,
    source_revision text NOT NULL,
    artifact_revision_id uuid NOT NULL,
    artifact_digest text NOT NULL,
    exact_host text NOT NULL,
    manifest jsonb NOT NULL,
    opened_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT preview_pkey PRIMARY KEY (preview_id),
    CONSTRAINT preview_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT preview_host_check CHECK (exact_host LIKE 'preview-' || artifact_revision_id::text || '.%'),
    CONSTRAINT preview_manifest_check CHECK (manifest->>'entryPath' = 'index.html' AND jsonb_typeof(manifest->'files') = 'array'),
    CONSTRAINT preview_lifetime_check CHECK (expires_at = opened_at + interval '15 minutes')
);

ALTER TABLE iam.preview OWNER TO iam_owner;

-- A one-use proof the Hub hands a browser for exactly one host. An application handoff names the
-- application, the digest of a binding only the browser that started the sign-in holds, and the sealed
-- Keycloak refresh token of that sign-in; it lives 60 seconds. A Preview handoff names the Preview and the
-- Hub session that opened it; it lives 30 seconds and is presented by the Hub's own page.
CREATE TABLE iam.handoff (
    handoff_digest bytea NOT NULL,
    kind text NOT NULL,
    account_id uuid NOT NULL,
    project_id uuid,
    binding_digest bytea,
    provider_refresh_token text,
    preview_id uuid,
    parent_digest bytea,
    minted_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT handoff_pkey PRIMARY KEY (handoff_digest),
    CONSTRAINT handoff_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT handoff_project_id_fkey FOREIGN KEY (project_id) REFERENCES iam.application(project_id),
    CONSTRAINT handoff_preview_id_fkey FOREIGN KEY (preview_id) REFERENCES iam.preview(preview_id),
    CONSTRAINT handoff_parent_digest_fkey FOREIGN KEY (parent_digest) REFERENCES iam.session(token_digest),
    CONSTRAINT handoff_kind_check CHECK (kind = ANY (ARRAY['APPLICATION'::text, 'PREVIEW'::text])),
    CONSTRAINT handoff_application_check CHECK (kind <> 'APPLICATION' OR (project_id IS NOT NULL AND binding_digest IS NOT NULL
      AND provider_refresh_token IS NOT NULL AND preview_id IS NULL AND parent_digest IS NULL)),
    CONSTRAINT handoff_preview_check CHECK (kind <> 'PREVIEW' OR (preview_id IS NOT NULL AND parent_digest IS NOT NULL
      AND project_id IS NULL AND binding_digest IS NULL AND provider_refresh_token IS NULL)),
    CONSTRAINT handoff_token_sealed_check CHECK (provider_refresh_token IS NULL OR provider_refresh_token LIKE 'mastra:factory-secret:v1:%'),
    CONSTRAINT handoff_ttl_check CHECK (expires_at > minted_at AND expires_at <= minted_at +
      CASE kind WHEN 'PREVIEW' THEN interval '30 seconds' ELSE interval '60 seconds' END)
);

ALTER TABLE iam.handoff OWNER TO iam_owner;

CREATE UNIQUE INDEX handoff_one_per_preview ON iam.handoff USING btree (preview_id) WHERE (preview_id IS NOT NULL);

-- One person on one host through one opaque cookie. An application session keeps the sealed Keycloak
-- refresh token while open, so the Hub can ask Keycloak again at most every five minutes, and lasts eight
-- hours from sign-in. A Preview session holds no token: it lives while the Hub session that opened it
-- does, for at most fifteen minutes.
CREATE TABLE iam.host_session (
    token_digest bytea NOT NULL,
    kind text NOT NULL,
    account_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    absolute_expires_at timestamp with time zone NOT NULL,
    project_id uuid,
    provider_refresh_token text,
    provider_checked_at timestamp with time zone,
    preview_id uuid,
    parent_digest bytea,
    ended_at timestamp with time zone,
    ended_reason text,
    CONSTRAINT host_session_pkey PRIMARY KEY (token_digest),
    CONSTRAINT host_session_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT host_session_project_id_fkey FOREIGN KEY (project_id) REFERENCES iam.application(project_id),
    CONSTRAINT host_session_preview_id_fkey FOREIGN KEY (preview_id) REFERENCES iam.preview(preview_id),
    CONSTRAINT host_session_parent_digest_fkey FOREIGN KEY (parent_digest) REFERENCES iam.session(token_digest),
    CONSTRAINT host_session_kind_check CHECK (kind = ANY (ARRAY['APPLICATION'::text, 'PREVIEW'::text])),
    CONSTRAINT host_session_application_check CHECK (kind <> 'APPLICATION' OR (project_id IS NOT NULL
      AND absolute_expires_at = started_at + interval '8 hours' AND provider_checked_at >= started_at
      AND (ended_at IS NULL) = (provider_refresh_token IS NOT NULL) AND preview_id IS NULL AND parent_digest IS NULL)),
    CONSTRAINT host_session_preview_check CHECK (kind <> 'PREVIEW' OR (preview_id IS NOT NULL AND parent_digest IS NOT NULL
      AND absolute_expires_at > started_at AND absolute_expires_at <= started_at + interval '15 minutes'
      AND project_id IS NULL AND provider_refresh_token IS NULL AND provider_checked_at IS NULL)),
    CONSTRAINT host_session_token_sealed_check CHECK (provider_refresh_token IS NULL OR provider_refresh_token LIKE 'mastra:factory-secret:v1:%'),
    CONSTRAINT host_session_end_check CHECK ((ended_at IS NULL) = (ended_reason IS NULL)),
    CONSTRAINT host_session_reason_check CHECK (ended_reason IS NULL OR ended_reason = ANY (ARRAY[
      'SIGNED_OUT'::text, 'ACCESS_ENDED'::text, 'EXPIRED'::text, 'CUSTODY_CHANGED'::text, 'PARENT_ENDED'::text,
      'PROVIDER_REFUSED'::text, 'PROVIDER_USER_DISABLED'::text, 'PROVIDER_SESSION_ENDED'::text]))
);

ALTER TABLE iam.host_session OWNER TO iam_owner;

CREATE INDEX host_session_open_application ON iam.host_session USING btree (project_id, account_id) WHERE (kind = 'APPLICATION' AND ended_at IS NULL);

-- A Hub session that opens a Preview must be open, unexpired, of an active Control Plane Account.
CREATE FUNCTION iam.hub_session_live(p_session_digest bytea, p_account_id uuid, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM iam.session AS hub JOIN iam.account AS person ON person.account_id = hub.account_id
    WHERE hub.token_digest = p_session_digest AND hub.account_id = p_account_id AND hub.revoked_at IS NULL
      AND p_now < hub.idle_expires_at AND p_now < hub.absolute_expires_at AND person.active
      AND iam.account_access_scope(person.account_id) = 'CONTROL_PLANE');
$$;

ALTER FUNCTION iam.hub_session_live(p_session_digest bytea, p_account_id uuid, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.hub_session_live(p_session_digest bytea, p_account_id uuid, p_now timestamp with time zone) FROM PUBLIC;

-- The old handoff and session go with their functions. Their open rows end: every person signs in again.
DROP FUNCTION iam.redeem_application_handoff(p_handoff_digest bytea, p_project_id uuid, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone);
DROP FUNCTION iam.end_application_session(p_session_digest bytea, p_reason text);
DROP FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone);
DROP FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone);
DROP FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone);
DROP TABLE iam.application_handoff;
DROP TABLE iam.application_session;

CREATE FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM iam.handoff AS stale WHERE stale.expires_at <= clock_timestamp();
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN
    RETURN false;
  END IF;
  INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
  VALUES (p_handoff_digest, 'APPLICATION', p_account_id, p_project_id, p_binding_digest, p_refresh_token, p_authenticated_at, p_authenticated_at + interval '60 seconds');
  RETURN true;
END;
$$;

ALTER FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone) TO hub_iam_runtime;

-- Opens a Preview for the developer behind a live Hub session and mints its entry handoff. NULL when the
-- Hub session cannot open it. The Hub has already checked the developer may see the artifact.
CREATE FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  opened uuid := gen_random_uuid();
BEGIN
  DELETE FROM iam.handoff AS stale WHERE stale.expires_at <= clock_timestamp();
  IF NOT iam.hub_session_live(p_hub_session_digest, p_account_id, p_now) THEN
    RETURN NULL;
  END IF;
  INSERT INTO iam.preview (preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at)
  VALUES (opened, p_account_id, p_project_id, p_source_revision, p_artifact_revision_id, p_artifact_digest, p_exact_host, p_manifest, p_now, p_now + interval '15 minutes');
  INSERT INTO iam.handoff (handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at)
  VALUES (p_handoff_digest, 'PREVIEW', p_account_id, opened, p_hub_session_digest, p_now, p_now + interval '30 seconds');
  RETURN p_now + interval '30 seconds';
END;
$$;

ALTER FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone) TO hub_iam_runtime;

-- Redeems a handoff on the host it was minted for. Every check is in the DELETE's condition: the kind,
-- the target (the application's Project or the Preview's host), the binding, the lifetime, and access
-- (the application grant or membership; for a Preview, its live Hub session). A presentation that fails
-- any check deletes nothing, so the handoff still redeems on its own host inside its lifetime; one that
-- passes consumes it in the statement that opens the session. Of two concurrent redemptions, one opens a
-- session and the other finds nothing.
CREATE FUNCTION iam.redeem_handoff(p_kind text, p_handoff_digest bytea, p_project_id uuid, p_exact_host text, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  WITH redeemed AS (
    DELETE FROM iam.handoff AS handoff
    WHERE handoff.handoff_digest = p_handoff_digest AND handoff.kind = p_kind AND p_now < handoff.expires_at
      AND CASE handoff.kind
        WHEN 'APPLICATION' THEN handoff.project_id = p_project_id AND handoff.binding_digest = p_binding_digest
          AND iam.has_application_access(handoff.account_id, handoff.project_id)
        WHEN 'PREVIEW' THEN EXISTS (
          SELECT 1 FROM iam.preview AS preview
          WHERE preview.preview_id = handoff.preview_id AND preview.exact_host = p_exact_host AND p_now < preview.expires_at)
          AND iam.hub_session_live(handoff.parent_digest, handoff.account_id, p_now)
      END
    RETURNING handoff.*
  )
  INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, project_id,
    provider_refresh_token, provider_checked_at, preview_id, parent_digest)
  SELECT p_session_digest, redeemed.kind, redeemed.account_id,
    CASE redeemed.kind WHEN 'APPLICATION' THEN redeemed.minted_at ELSE p_now END,
    CASE redeemed.kind WHEN 'APPLICATION' THEN redeemed.minted_at + interval '8 hours'
      ELSE least(p_now + interval '15 minutes', (SELECT preview.expires_at FROM iam.preview AS preview WHERE preview.preview_id = redeemed.preview_id)) END,
    redeemed.project_id, redeemed.provider_refresh_token,
    CASE redeemed.kind WHEN 'APPLICATION' THEN redeemed.minted_at END,
    redeemed.preview_id, redeemed.parent_digest
  FROM redeemed
  RETURNING absolute_expires_at;
$$;

ALTER FUNCTION iam.redeem_handoff(p_kind text, p_handoff_digest bytea, p_project_id uuid, p_exact_host text, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.redeem_handoff(p_kind text, p_handoff_digest bytea, p_project_id uuid, p_exact_host text, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.redeem_handoff(p_kind text, p_handoff_digest bytea, p_project_id uuid, p_exact_host text, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone) TO hub_iam_runtime;

CREATE FUNCTION iam.end_host_session(p_session_digest bytea, p_reason text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  UPDATE iam.host_session AS session
  SET ended_at = clock_timestamp(), ended_reason = p_reason, provider_refresh_token = NULL
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL;
$$;

ALTER FUNCTION iam.end_host_session(p_session_digest bytea, p_reason text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.end_host_session(p_session_digest bytea, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.end_host_session(p_session_digest bytea, p_reason text) TO hub_iam_runtime;

-- An application session is valid only on its own application's host, before its limit, and while the
-- person has access; one found past its limit or without access is ended here. The sealed refresh token is
-- handed out only when the five-minute Keycloak check is due.
CREATE FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, email text, display_name text, subject text, provider_checked_at timestamp with time zone, due_provider_refresh_token text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  found_session iam.host_session%ROWTYPE;
BEGIN
  SELECT session.* INTO found_session FROM iam.host_session AS session
  WHERE session.token_digest = p_session_digest AND session.kind = 'APPLICATION' AND session.ended_at IS NULL;
  IF NOT FOUND OR found_session.project_id <> p_project_id THEN
    RETURN;
  END IF;
  IF p_now >= found_session.absolute_expires_at THEN
    PERFORM iam.end_host_session(p_session_digest, 'EXPIRED');
    RETURN;
  END IF;
  IF NOT iam.has_application_access(found_session.account_id, found_session.project_id) THEN
    PERFORM iam.end_host_session(p_session_digest, 'ACCESS_ENDED');
    RETURN;
  END IF;
  RETURN QUERY
  SELECT person.account_id, person.email, person.display_name, person.external_subject, found_session.provider_checked_at,
    CASE WHEN found_session.provider_checked_at <= p_now - interval '5 minutes' THEN found_session.provider_refresh_token END
  FROM iam.account AS person WHERE person.account_id = found_session.account_id;
END;
$$;

ALTER FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone) TO hub_iam_runtime;

-- A Preview session is valid only on its Preview's host, before its limit, and while the Hub session that
-- opened it is live. One whose Hub session ended, idled out or lost its Account is ended here.
CREATE FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) RETURNS TABLE(account_id uuid, email text, display_name text, project_id uuid, source_revision text, artifact_revision_id uuid, artifact_digest text, manifest jsonb, expires_at timestamp with time zone)
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
  SELECT person.account_id, person.email, person.display_name, shown.project_id, shown.source_revision,
    shown.artifact_revision_id, shown.artifact_digest, shown.manifest, found_session.absolute_expires_at
  FROM iam.account AS person WHERE person.account_id = found_session.account_id;
END;
$$;

ALTER FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone) TO hub_iam_runtime;

-- Compare-and-set on the check time the request read: of requests that found the same check due, one
-- stores its token and the others are still served, since their own refresh was answered too.
CREATE FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE iam.host_session AS session
  SET provider_checked_at = p_now, provider_refresh_token = p_refresh_token
  WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    AND session.provider_checked_at = p_previous_checked_at;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.record_provider_check(p_session_digest bytea, p_previous_checked_at timestamp with time zone, p_refresh_token text, p_now timestamp with time zone) TO hub_iam_runtime;

-- Revoking a grant also ends the person's open sessions and handoffs for the application at once, unless
-- their Workspace membership still gives them access.
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
    UPDATE iam.host_session AS session
    SET ended_at = clock_timestamp(), ended_reason = 'ACCESS_ENDED', provider_refresh_token = NULL
    WHERE session.kind = 'APPLICATION' AND session.account_id = grantee AND session.project_id = p_project_id
      AND session.ended_at IS NULL;
    DELETE FROM iam.handoff AS handoff
    WHERE handoff.kind = 'APPLICATION' AND handoff.account_id = grantee AND handoff.project_id = p_project_id;
  END IF;
  RETURN true;
END;
$$;

COMMIT;
