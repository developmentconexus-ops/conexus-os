BEGIN;

-- A Project's application and who may use it. An Owner of the Project's Workspace grants one person
-- by verified email. The grant is Conexus's own record and never read from Keycloak or a request.
-- Members of the Project's Workspace use the application through their membership, without a grant.

GRANT SELECT(name) ON TABLE project.project TO iam_owner;
GRANT SELECT(archived) ON TABLE project.project TO iam_owner;

-- One application per Project. Its slug is the host label, unique per installation and fixed once
-- set. `hub` and `preview-*` are reserved because cookies ignore ports: an application at those
-- labels would share a host with the Hub or a Preview.
CREATE TABLE iam.application (
    project_id uuid NOT NULL,
    slug text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT application_pkey PRIMARY KEY (project_id),
    CONSTRAINT application_slug_key UNIQUE (slug),
    CONSTRAINT application_project_id_fkey FOREIGN KEY (project_id) REFERENCES project.project(project_id),
    CONSTRAINT application_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.account(account_id),
    CONSTRAINT application_slug_check CHECK (
      slug ~ '^[a-z]([a-z0-9-]{0,38}[a-z0-9])?$' AND slug !~ '--' AND slug !~ '^preview-'
      AND slug <> ALL (ARRAY['hub', 'www', 'api', 'auth', 'admin', 'keycloak', 'static', 'app', 'preview']))
);

ALTER TABLE iam.application OWNER TO iam_owner;

CREATE TABLE iam.application_invitation (
    invitation_id uuid NOT NULL,
    project_id uuid NOT NULL,
    email text NOT NULL,
    invited_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT application_invitation_pkey PRIMARY KEY (invitation_id),
    CONSTRAINT application_invitation_project_email_key UNIQUE (project_id, email),
    CONSTRAINT application_invitation_project_id_fkey FOREIGN KEY (project_id) REFERENCES iam.application(project_id),
    CONSTRAINT application_invitation_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES iam.account(account_id),
    CONSTRAINT application_invitation_email_check CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+$'),
    CONSTRAINT application_invitation_expiry_check CHECK (expires_at > created_at)
);

ALTER TABLE iam.application_invitation OWNER TO iam_owner;

-- A tenure. A revoked row is kept as the record of who granted and who revoked, and when.
CREATE TABLE iam.application_grant (
    grant_id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    account_id uuid NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone,
    CONSTRAINT application_grant_pkey PRIMARY KEY (grant_id),
    CONSTRAINT application_grant_project_id_fkey FOREIGN KEY (project_id) REFERENCES iam.application(project_id),
    CONSTRAINT application_grant_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT application_grant_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES iam.account(account_id),
    CONSTRAINT application_grant_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES iam.account(account_id),
    CONSTRAINT application_grant_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CONSTRAINT application_grant_order_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

ALTER TABLE iam.application_grant OWNER TO iam_owner;

CREATE UNIQUE INDEX application_grant_open_key ON iam.application_grant USING btree (project_id, account_id) WHERE (revoked_at IS NULL);

-- "Caderno de Compras" becomes caderno-de-compras. Accents fold away, every other run of
-- characters becomes one hyphen, and a label that could collide with the platform gets `app-`.
CREATE FUNCTION iam.application_slug_base(p_project_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  WITH folded AS (
    SELECT btrim(regexp_replace(
      regexp_replace(lower(normalize(p_project_name, NFKD)), '[\u0300-\u036f]', '', 'g'),
      '[^a-z0-9]+', '-', 'g'), '-') AS label
  ), bounded AS (
    SELECT rtrim(left(label, 36), '-') AS label FROM folded
  )
  SELECT CASE
    WHEN label = '' THEN 'aplicativo'
    WHEN label !~ '^[a-z]' OR label ~ '^preview(-|$)'
      OR label = ANY (ARRAY['hub', 'www', 'api', 'auth', 'admin', 'keycloak', 'static', 'app']) THEN 'app-' || label
    ELSE label
  END
  FROM bounded;
$$;

ALTER FUNCTION iam.application_slug_base(p_project_name text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.application_slug_base(p_project_name text) FROM PUBLIC;

-- Only an Owner of the Project's Workspace administers its application. Someone who is not a
-- member is not told the Project exists.
CREATE FUNCTION iam.admit_application_owner(p_actor uuid, p_project_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  SELECT stored_project.workspace_id INTO owning_workspace_id
  FROM project.project AS stored_project
  JOIN iam.visible_workspaces(p_actor) AS visible ON visible.workspace_id = stored_project.workspace_id
  WHERE stored_project.project_id = p_project_id;
  IF owning_workspace_id IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM iam.admit_workspace(p_actor, owning_workspace_id, 'members.manage');
  RETURN owning_workspace_id;
END;
$$;

ALTER FUNCTION iam.admit_application_owner(p_actor uuid, p_project_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.admit_application_owner(p_actor uuid, p_project_id uuid) FROM PUBLIC;

-- The first grant settles the application's slug from the Project name: the base, then base-2,
-- base-3 and so on under the unique key. The invitation's natural key is (Project, email), so a
-- repeat answers the same invitation with a fresh expiry.
CREATE FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  base_slug text;
  candidate_slug text;
  attempt integer := 1;
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
  INSERT INTO iam.application_invitation (invitation_id, project_id, email, invited_by, expires_at)
  VALUES (p_invitation_id, p_project_id, lower(btrim(p_email)), p_actor, p_expires_at)
  ON CONFLICT (project_id, email) DO UPDATE
    SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at
  RETURNING iam.application_invitation.invitation_id INTO settled_invitation_id;
  RETURN settled_invitation_id;
END;
$$;

ALTER FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.grant_application_access(p_actor uuid, p_project_id uuid, p_invitation_id uuid, p_email text, p_expires_at timestamp with time zone) TO hub_iam_runtime;

-- One projection: the application row (its slug), the open grants and the invitations.
CREATE FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) RETURNS TABLE(kind text, entry_id uuid, account_id uuid, display_name text, email text, since timestamp with time zone, expires_at timestamp with time zone, slug text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  RETURN QUERY
  SELECT 'application'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, application.created_at, NULL::timestamptz, application.slug
  FROM iam.application AS application
  WHERE application.project_id = p_project_id
  UNION ALL
  SELECT 'grant'::text, access_grant.grant_id, grantee.account_id, grantee.display_name, grantee.email, access_grant.granted_at, NULL::timestamptz, NULL::text
  FROM iam.application_grant AS access_grant
  JOIN iam.account AS grantee ON grantee.account_id = access_grant.account_id
  WHERE access_grant.project_id = p_project_id AND access_grant.revoked_at IS NULL
  UNION ALL
  SELECT 'invitation'::text, invitation.invitation_id, NULL::uuid, NULL::text, invitation.email, invitation.created_at, invitation.expires_at, NULL::text
  FROM iam.application_invitation AS invitation
  WHERE invitation.project_id = p_project_id;
END;
$$;

ALTER FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.list_application_access(p_actor uuid, p_project_id uuid) TO hub_iam_runtime;

-- Both narrowings are scoped to the Project named in the request, so an entry of another Project
-- is not found rather than withdrawn.
CREATE FUNCTION iam.cancel_application_invitation(p_actor uuid, p_project_id uuid, p_invitation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  DELETE FROM iam.application_invitation AS invitation
  WHERE invitation.invitation_id = p_invitation_id AND invitation.project_id = p_project_id;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION iam.cancel_application_invitation(p_actor uuid, p_project_id uuid, p_invitation_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.cancel_application_invitation(p_actor uuid, p_project_id uuid, p_invitation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.cancel_application_invitation(p_actor uuid, p_project_id uuid, p_invitation_id uuid) TO hub_iam_runtime;

CREATE FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM iam.admit_application_owner(p_actor, p_project_id);
  UPDATE iam.application_grant AS access_grant
  SET revoked_at = clock_timestamp(), revoked_by = p_actor
  WHERE access_grant.grant_id = p_grant_id AND access_grant.project_id = p_project_id
    AND access_grant.revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.revoke_application_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) TO hub_iam_runtime;

COMMIT;
