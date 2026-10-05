BEGIN;

-- One owner per session lifetime (spec 0014): iam.session_lifetimes() is the only place a duration is
-- written in live SQL, and the CHECKs hold shape only. The CSRF token goes with its column.
--
-- The owner is a composite with named fields, so a misspelt field fails when the function that reads it
-- is created. It is STABLE, not IMMUTABLE: an IMMUTABLE zero-argument call can be folded into a cached
-- plan of a PL/pgSQL reader, and a replacement would not reach a warm connection. The body is
-- SELECT ... rather than RETURN, because the catalog snapshot hashes prosrc, which is empty for RETURN.
CREATE TYPE iam.session_lifetime AS (
  hub_absolute interval, hub_idle interval, application_absolute interval, provider_recheck interval,
  preview interval, application_handoff interval, preview_handoff interval);
ALTER TYPE iam.session_lifetime OWNER TO iam_owner;
CREATE FUNCTION iam.session_lifetimes() RETURNS iam.session_lifetime
    LANGUAGE sql STABLE PARALLEL SAFE
    AS $$ SELECT ROW(interval '8 hours', interval '30 minutes', interval '8 hours', interval '5 minutes', interval '15 minutes', interval '60 seconds', interval '30 seconds')::iam.session_lifetime $$;
ALTER FUNCTION iam.session_lifetimes() OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.session_lifetimes() FROM PUBLIC;

-- Shape only: dates in order, idle <= absolute, the pairing clauses. No duration, no function call.
ALTER TABLE iam.host_session
  DROP CONSTRAINT host_session_hub_check,
  DROP CONSTRAINT host_session_application_check,
  DROP CONSTRAINT host_session_preview_check;
ALTER TABLE iam.host_session DROP COLUMN csrf_digest;
ALTER TABLE iam.host_session
  ADD CONSTRAINT host_session_hub_check CHECK (kind <> 'HUB' OR (
    idle_expires_at IS NOT NULL AND idle_expires_at <= absolute_expires_at
    AND absolute_expires_at > started_at
    AND provider_checked_at >= started_at
    AND (ended_at IS NULL) = (provider_refresh_token IS NOT NULL)
    AND project_id IS NULL AND preview_id IS NULL AND parent_digest IS NULL)),
  ADD CONSTRAINT host_session_application_check CHECK (kind <> 'APPLICATION' OR (
    project_id IS NOT NULL
    AND absolute_expires_at > started_at
    AND provider_checked_at >= started_at
    AND (ended_at IS NULL) = (provider_refresh_token IS NOT NULL)
    AND preview_id IS NULL AND parent_digest IS NULL AND idle_expires_at IS NULL)),
  ADD CONSTRAINT host_session_preview_check CHECK (kind <> 'PREVIEW' OR (
    preview_id IS NOT NULL AND parent_digest IS NOT NULL
    AND absolute_expires_at > started_at
    AND project_id IS NULL AND provider_refresh_token IS NULL AND provider_checked_at IS NULL
    AND idle_expires_at IS NULL));
ALTER TABLE iam.preview
  DROP CONSTRAINT preview_lifetime_check,
  ADD CONSTRAINT preview_lifetime_check CHECK (expires_at > opened_at);
ALTER TABLE iam.handoff
  DROP CONSTRAINT handoff_ttl_check,
  ADD CONSTRAINT handoff_ttl_check CHECK (expires_at > minted_at);

DROP FUNCTION iam.open_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone);
DROP FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_csrf_digest bytea, p_now timestamp with time zone);
DROP FUNCTION iam.end_hub_session(p_session_digest bytea, p_csrf_digest bytea);

CREATE FUNCTION iam.open_hub_session(p_session_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  INSERT INTO iam.host_session (token_digest, kind, account_id, started_at, absolute_expires_at, idle_expires_at,
    provider_refresh_token, provider_checked_at)
  VALUES (p_session_digest, 'HUB', p_account_id, p_now, p_now + (iam.session_lifetimes()).hub_absolute, p_now + (iam.session_lifetimes()).hub_idle,
    p_refresh_token, p_now);
  RETURN 'OPENED';
END;
$function$;
CREATE FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_now timestamp with time zone)
 RETURNS TABLE(account_id uuid, issuer text, subject text, display_name text, email text, provider_checked_at timestamp with time zone, due_provider_refresh_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  IF NOT EXISTS (SELECT 1 FROM iam.account AS person WHERE person.account_id = found_session.account_id AND person.active
    AND iam.account_access_scope(person.account_id) = 'CONTROL_PLANE') THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH slid AS (
    UPDATE iam.host_session AS session
    SET idle_expires_at = least(p_now + (iam.session_lifetimes()).hub_idle, session.absolute_expires_at)
    WHERE session.token_digest = p_session_digest AND session.ended_at IS NULL
    RETURNING session.account_id, session.provider_checked_at, session.provider_refresh_token
  )
  SELECT person.account_id, person.issuer, person.external_subject, person.display_name, person.email, slid.provider_checked_at,
    CASE WHEN slid.provider_checked_at <= p_now - (iam.session_lifetimes()).provider_recheck THEN slid.provider_refresh_token END
  FROM slid JOIN iam.account AS person ON person.account_id = slid.account_id;
END;
$function$;
CREATE FUNCTION iam.end_hub_session(p_session_digest bytea)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  sealed text;
BEGIN
  SELECT session.provider_refresh_token INTO sealed FROM iam.host_session AS session
  WHERE session.token_digest = p_session_digest AND session.kind = 'HUB' AND session.ended_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM iam.end_host_session(p_session_digest, 'SIGNED_OUT');
  RETURN sealed;
END;
$function$;
ALTER FUNCTION iam.open_hub_session(p_session_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.open_hub_session(p_session_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.open_hub_session(p_session_digest bytea, p_account_id uuid, p_refresh_token text, p_now timestamp with time zone) TO hub_iam_runtime;
ALTER FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_now timestamp with time zone) OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.resolve_hub_session(p_session_digest bytea, p_now timestamp with time zone) TO hub_iam_runtime;
ALTER FUNCTION iam.end_hub_session(p_session_digest bytea) OWNER TO iam_owner;
REVOKE ALL ON FUNCTION iam.end_hub_session(p_session_digest bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.end_hub_session(p_session_digest bytea) TO hub_iam_runtime;

CREATE OR REPLACE FUNCTION iam.resolve_application_session(p_session_digest bytea, p_project_id uuid, p_now timestamp with time zone)
 RETURNS TABLE(account_id uuid, email text, display_name text, subject text, provider_checked_at timestamp with time zone, due_provider_refresh_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
    CASE WHEN found_session.provider_checked_at <= p_now - (iam.session_lifetimes()).provider_recheck THEN found_session.provider_refresh_token END
  FROM iam.account AS person WHERE person.account_id = found_session.account_id;
END;
$function$;
CREATE OR REPLACE FUNCTION iam.resolve_preview_session(p_session_digest bytea, p_exact_host text, p_now timestamp with time zone)
 RETURNS TABLE(account_id uuid, email text, display_name text, subject text, project_id uuid, source_revision text, artifact_revision_id uuid, artifact_digest text, manifest jsonb, expires_at timestamp with time zone, hub_digest bytea, hub_checked_at timestamp with time zone, due_hub_refresh_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
    CASE WHEN hub.provider_checked_at <= p_now - (iam.session_lifetimes()).provider_recheck THEN hub.provider_refresh_token END
  FROM iam.account AS person, iam.host_session AS hub
  -- Checked again in the query that hands out the token: a Hub session a concurrent refusal ended after the
  -- check above has no token left, and must not read as a check that is not due.
  WHERE person.account_id = found_session.account_id AND hub.token_digest = found_session.parent_digest
    AND hub.ended_at IS NULL AND iam.hub_session_live(hub.token_digest, person.account_id, p_now);
END;
$function$;
CREATE OR REPLACE FUNCTION iam.redeem_handoff(p_kind text, p_handoff_digest bytea, p_project_id uuid, p_exact_host text, p_binding_digest bytea, p_session_digest bytea, p_now timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
    CASE redeemed.kind WHEN 'APPLICATION' THEN redeemed.minted_at + (iam.session_lifetimes()).application_absolute
      ELSE least(p_now + (iam.session_lifetimes()).preview, (SELECT preview.expires_at FROM iam.preview AS preview WHERE preview.preview_id = redeemed.preview_id)) END,
    redeemed.project_id, redeemed.provider_refresh_token,
    CASE redeemed.kind WHEN 'APPLICATION' THEN redeemed.minted_at END,
    redeemed.preview_id, redeemed.parent_digest
  FROM redeemed
  RETURNING absolute_expires_at;
$function$;
CREATE OR REPLACE FUNCTION iam.mint_application_handoff(p_account_id uuid, p_project_id uuid, p_handoff_digest bytea, p_binding_digest bytea, p_refresh_token text, p_authenticated_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN
    RETURN false;
  END IF;
  INSERT INTO iam.handoff (handoff_digest, kind, account_id, project_id, binding_digest, provider_refresh_token, minted_at, expires_at)
  VALUES (p_handoff_digest, 'APPLICATION', p_account_id, p_project_id, p_binding_digest, p_refresh_token, p_authenticated_at, p_authenticated_at + (iam.session_lifetimes()).application_handoff);
  RETURN true;
END;
$function$;
CREATE OR REPLACE FUNCTION iam.open_preview(p_hub_session_digest bytea, p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_artifact_digest text, p_exact_host text, p_manifest jsonb, p_handoff_digest bytea, p_now timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  opened uuid := gen_random_uuid();
BEGIN
  IF NOT iam.hub_session_live(p_hub_session_digest, p_account_id, p_now) THEN
    RETURN NULL;
  END IF;
  INSERT INTO iam.preview (preview_id, account_id, project_id, source_revision, artifact_revision_id, artifact_digest, exact_host, manifest, opened_at, expires_at)
  VALUES (opened, p_account_id, p_project_id, p_source_revision, p_artifact_revision_id, p_artifact_digest, p_exact_host, p_manifest, p_now, p_now + (iam.session_lifetimes()).preview);
  INSERT INTO iam.handoff (handoff_digest, kind, account_id, preview_id, parent_digest, minted_at, expires_at)
  VALUES (p_handoff_digest, 'PREVIEW', p_account_id, opened, p_hub_session_digest, p_now, p_now + (iam.session_lifetimes()).preview_handoff);
  RETURN p_now + (iam.session_lifetimes()).preview;
END;
$function$;
COMMIT;
