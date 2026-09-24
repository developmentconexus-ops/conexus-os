BEGIN;

-- A Connector Definition lives in Hub source (apps/hub/src/connectors/). This migration holds only
-- what Conexus itself must remember: a Workspace's Connection to one Connector, and which Project may
-- use which of its capabilities. The credential leaves PostgreSQL only as ciphertext; the broker opens
-- it in the Hub process, never here.

DO $$ BEGIN
  CREATE ROLE "connector_owner" NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA connector AUTHORIZATION connector_owner;

GRANT USAGE ON SCHEMA connector TO hub_iam_runtime;

-- The target of the composite foreign keys below. project_id is already unique on its own; this adds
-- no rule on data, only a second key shaped to carry workspace_id alongside it.
ALTER TABLE project.project ADD CONSTRAINT project_project_id_workspace_id_key UNIQUE (project_id, workspace_id);

-- Every function below reads workspace_id, project_id or archived through a query predicate, so the
-- owning role needs real column privilege: SECURITY DEFINER runs its body as connector_owner, not as
-- whichever account applies this migration. Resolving a schema-qualified name also needs USAGE on
-- that schema, not only EXECUTE or SELECT on the object inside it.
GRANT USAGE ON SCHEMA iam TO connector_owner;
GRANT USAGE ON SCHEMA project TO connector_owner;
GRANT USAGE ON SCHEMA workspace TO connector_owner;
GRANT SELECT(project_id) ON TABLE project.project TO connector_owner;
GRANT SELECT(workspace_id) ON TABLE project.project TO connector_owner;
GRANT SELECT(archived) ON TABLE project.project TO connector_owner;
GRANT REFERENCES ON TABLE project.project TO connector_owner;
GRANT REFERENCES ON TABLE workspace.workspace TO connector_owner;
GRANT ALL ON FUNCTION iam.is_installation_administrator(p_account_id uuid) TO connector_owner;
GRANT ALL ON FUNCTION iam.visible_workspaces(p_account_id uuid) TO connector_owner;
GRANT ALL ON FUNCTION iam.admit_workspace(p_account_id uuid, p_workspace_id uuid, p_action iam.action) TO connector_owner;

-- A Workspace's Connection to one Connector. connection_id is chosen by the client, so a retried
-- create answers the same row instead of a duplicate. Connections are immutable: rotating a
-- credential is disable-then-create (connector-token-cache never outlives a credential this way), so
-- there is no update path and no revision column. There is no column for an MGE user or password, and
-- none is ever accepted: credential_sealed only ever holds a sealed envelope of the gateway
-- credential Q4 admits (client id, client secret and X-Token).
CREATE TABLE connector.connection (
    connection_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    connector_id text NOT NULL,
    label text NOT NULL,
    credential_sealed text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    disabled_by uuid,
    disabled_at timestamp with time zone,
    CONSTRAINT connection_pkey PRIMARY KEY (connection_id),
    CONSTRAINT connection_connection_id_workspace_id_key UNIQUE (connection_id, workspace_id),
    CONSTRAINT connection_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT,
    CONSTRAINT connection_created_by_fkey FOREIGN KEY (created_by) REFERENCES iam.account(account_id),
    CONSTRAINT connection_disabled_by_fkey FOREIGN KEY (disabled_by) REFERENCES iam.account(account_id),
    CONSTRAINT connection_connector_id_check CHECK (connector_id = ANY (ARRAY['sankhya'::text])),
    CONSTRAINT connection_label_check CHECK (length(btrim(label)) >= 1 AND length(label) <= 200),
    CONSTRAINT connection_credential_sealed_check CHECK (credential_sealed LIKE 'mastra:factory-secret:v1:%'),
    CONSTRAINT connection_disabled_attribution_check CHECK ((disabled_at IS NULL) = (disabled_by IS NULL)),
    CONSTRAINT connection_disabled_order_check CHECK (disabled_at IS NULL OR disabled_at >= created_at)
);

ALTER TABLE connector.connection OWNER TO connector_owner;

REVOKE ALL ON TABLE connector.connection FROM PUBLIC;

-- One open Connection per Workspace and Connector: a second Sankhya Connection is a create conflict,
-- never a silent second row, until the first is disabled.
CREATE UNIQUE INDEX connection_open_key ON connector.connection USING btree (workspace_id, connector_id) WHERE (disabled_at IS NULL);

-- A Project's authorized use of one capability of one Connection. The two composite foreign keys
-- share workspace_id with project.project and connector.connection, so a grant whose Project and
-- Connection sit in different Workspaces cannot be written (P7): the row itself is unrepresentable,
-- not merely refused by a check. environment and capability_kind are narrow CHECKs today; Q5 widens
-- environment and inbound events widen capability_kind, each in their own migration.
CREATE TABLE connector.project_grant (
    grant_id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    environment text NOT NULL,
    connection_id uuid NOT NULL,
    capability_kind text NOT NULL,
    capability_id text NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone,
    CONSTRAINT project_grant_pkey PRIMARY KEY (grant_id),
    CONSTRAINT project_grant_project_workspace_fkey FOREIGN KEY (project_id, workspace_id) REFERENCES project.project(project_id, workspace_id) ON DELETE RESTRICT,
    CONSTRAINT project_grant_connection_workspace_fkey FOREIGN KEY (connection_id, workspace_id) REFERENCES connector.connection(connection_id, workspace_id) ON DELETE RESTRICT,
    CONSTRAINT project_grant_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES iam.account(account_id),
    CONSTRAINT project_grant_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES iam.account(account_id),
    CONSTRAINT project_grant_environment_check CHECK (environment = 'preview'::text),
    CONSTRAINT project_grant_capability_kind_check CHECK (capability_kind = 'operation'::text),
    CONSTRAINT project_grant_capability_id_check CHECK (length(btrim(capability_id)) >= 1 AND length(capability_id) <= 200),
    CONSTRAINT project_grant_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
    CONSTRAINT project_grant_order_check CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

ALTER TABLE connector.project_grant OWNER TO connector_owner;

REVOKE ALL ON TABLE connector.project_grant FROM PUBLIC;

-- One open grant per Project, environment and capability: a second Owner request for the same
-- capability answers the grant that already exists rather than opening a second one.
CREATE UNIQUE INDEX project_grant_open_key ON connector.project_grant USING btree (project_id, environment, capability_kind, capability_id) WHERE (revoked_at IS NULL);

-- Only an installation administrator administers a Workspace's Connections. Every admin-facing
-- function below calls this first, so the refusal is the same 42501 NOT_ADMITTED shape every other
-- installation-administrator check in the product uses.
CREATE FUNCTION connector.admit_installation_administrator(p_actor uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF NOT iam.is_installation_administrator(p_actor) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
END;
$$;

ALTER FUNCTION connector.admit_installation_administrator(p_actor uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.admit_installation_administrator(p_actor uuid) FROM PUBLIC;

-- Only an Owner of the Project's Workspace administers its grants. A Project a non-member cannot see
-- is not disclosed to exist (P0002), mirroring iam.admit_application_owner exactly.
CREATE FUNCTION connector.admit_project_owner(p_actor uuid, p_project_id uuid) RETURNS uuid
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
    RAISE EXCEPTION 'CONNECTOR_PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM iam.admit_workspace(p_actor, owning_workspace_id, 'members.manage');
  RETURN owning_workspace_id;
END;
$$;

ALTER FUNCTION connector.admit_project_owner(p_actor uuid, p_project_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.admit_project_owner(p_actor uuid, p_project_id uuid) FROM PUBLIC;

CREATE FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) RETURNS TABLE(connection_id uuid, connector_id text, label text, created_at timestamp with time zone, disabled_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM connector.admit_installation_administrator(p_actor);
  RETURN QUERY
  SELECT stored.connection_id, stored.connector_id, stored.label, stored.created_at, stored.disabled_at
  FROM connector.connection AS stored
  WHERE stored.workspace_id = p_workspace_id
  ORDER BY stored.created_at;
END;
$$;

ALTER FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) TO hub_iam_runtime;

-- Idempotent on connection_id: a retry with the same fields answers the same row; a retry with a
-- different Workspace, Connector or label is a conflict rather than a silent overwrite. The
-- credential is never returned.
CREATE FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_credential_sealed text) RETURNS TABLE(connection_id uuid, connector_id text, label text, created_at timestamp with time zone, disabled_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  existing connector.connection%ROWTYPE;
BEGIN
  PERFORM connector.admit_installation_administrator(p_actor);
  SELECT * INTO existing FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id;
  IF FOUND THEN
    IF existing.workspace_id <> p_workspace_id OR existing.connector_id <> p_connector_id OR existing.label <> p_label THEN
      RAISE EXCEPTION 'CONNECTOR_CONNECTION_CONFLICT';
    END IF;
  ELSE
    INSERT INTO connector.connection (connection_id, workspace_id, connector_id, label, credential_sealed, created_by)
    VALUES (p_connection_id, p_workspace_id, p_connector_id, p_label, p_credential_sealed, p_actor);
  END IF;
  RETURN QUERY
  SELECT stored.connection_id, stored.connector_id, stored.label, stored.created_at, stored.disabled_at
  FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id;
END;
$$;

ALTER FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_credential_sealed text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_credential_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_credential_sealed text) TO hub_iam_runtime;

-- Idempotent and narrowing: disabling an already-disabled Connection still answers true, and the row
-- is kept as the record of who disabled it and when.
CREATE FUNCTION connector.disable_connection(p_actor uuid, p_workspace_id uuid, p_connection_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM connector.admit_installation_administrator(p_actor);
  UPDATE connector.connection AS stored
  SET disabled_at = clock_timestamp(), disabled_by = p_actor
  WHERE stored.connection_id = p_connection_id AND stored.workspace_id = p_workspace_id AND stored.disabled_at IS NULL;
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id AND stored.workspace_id = p_workspace_id);
END;
$$;

ALTER FUNCTION connector.disable_connection(p_actor uuid, p_workspace_id uuid, p_connection_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.disable_connection(p_actor uuid, p_workspace_id uuid, p_connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.disable_connection(p_actor uuid, p_workspace_id uuid, p_connection_id uuid) TO hub_iam_runtime;

-- One projection: the Project's open grants and, beside them, the (Connection, operation) pairs it
-- could still grant. The operation ids come from the caller because the Definition lives in
-- TypeScript, not in this schema.
CREATE FUNCTION connector.list_project_grants(p_actor uuid, p_project_id uuid, p_operation_ids text[]) RETURNS TABLE(kind text, grant_id uuid, connection_id uuid, connector_id text, capability_id text, granted_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  owning_workspace_id := connector.admit_project_owner(p_actor, p_project_id);
  RETURN QUERY
  SELECT 'grant'::text, open_grant.grant_id, open_grant.connection_id, connection.connector_id, open_grant.capability_id, open_grant.granted_at
  FROM connector.project_grant AS open_grant
  JOIN connector.connection AS connection ON connection.connection_id = open_grant.connection_id
  WHERE open_grant.project_id = p_project_id AND open_grant.environment = 'preview' AND open_grant.capability_kind = 'operation' AND open_grant.revoked_at IS NULL
  UNION ALL
  SELECT 'grantable'::text, NULL::uuid, connection.connection_id, connection.connector_id, candidate.operation_id, NULL::timestamptz
  FROM connector.connection AS connection
  CROSS JOIN unnest(p_operation_ids) AS candidate(operation_id)
  WHERE connection.workspace_id = owning_workspace_id AND connection.disabled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM connector.project_grant AS open_grant
      WHERE open_grant.project_id = p_project_id AND open_grant.connection_id = connection.connection_id
        AND open_grant.environment = 'preview' AND open_grant.capability_kind = 'operation'
        AND open_grant.capability_id = candidate.operation_id AND open_grant.revoked_at IS NULL
    )
  ORDER BY 1, 5;
END;
$$;

ALTER FUNCTION connector.list_project_grants(p_actor uuid, p_project_id uuid, p_operation_ids text[]) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_project_grants(p_actor uuid, p_project_id uuid, p_operation_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_project_grants(p_actor uuid, p_project_id uuid, p_operation_ids text[]) TO hub_iam_runtime;

-- A Connection of another Workspace, or a disabled one, answers the same non-disclosing P0002 as an
-- invisible Project: an Owner learns only that the capability cannot be granted, never why. An open
-- grant for the same capability answers that grant rather than opening a second one.
CREATE FUNCTION connector.grant_capability(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_operation_id text) RETURNS TABLE(grant_id uuid, connection_id uuid, connector_id text, capability_id text, granted_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
  connection_workspace_id uuid;
  connection_disabled_at timestamp with time zone;
  settled_grant_id uuid;
BEGIN
  owning_workspace_id := connector.admit_project_owner(p_actor, p_project_id);
  SELECT stored.workspace_id, stored.disabled_at INTO connection_workspace_id, connection_disabled_at
  FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id;
  IF connection_workspace_id IS NULL OR connection_workspace_id <> owning_workspace_id OR connection_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION 'CONNECTOR_CONNECTION_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;
  SELECT open_grant.grant_id INTO settled_grant_id
  FROM connector.project_grant AS open_grant
  WHERE open_grant.project_id = p_project_id AND open_grant.environment = 'preview' AND open_grant.capability_kind = 'operation'
    AND open_grant.capability_id = p_operation_id AND open_grant.revoked_at IS NULL;
  IF settled_grant_id IS NULL THEN
    INSERT INTO connector.project_grant (workspace_id, project_id, environment, connection_id, capability_kind, capability_id, granted_by)
    VALUES (owning_workspace_id, p_project_id, 'preview', p_connection_id, 'operation', p_operation_id, p_actor)
    RETURNING connector.project_grant.grant_id INTO settled_grant_id;
  END IF;
  RETURN QUERY
  SELECT stored.grant_id, stored.connection_id, connection.connector_id, stored.capability_id, stored.granted_at
  FROM connector.project_grant AS stored
  JOIN connector.connection AS connection ON connection.connection_id = stored.connection_id
  WHERE stored.grant_id = settled_grant_id;
END;
$$;

ALTER FUNCTION connector.grant_capability(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_operation_id text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.grant_capability(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_operation_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.grant_capability(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_operation_id text) TO hub_iam_runtime;

-- Scoped to the named Project, like iam.revoke_application_grant: a grant id of another Project is
-- not found rather than withdrawn. Idempotent: revoking twice answers false the second time.
CREATE FUNCTION connector.revoke_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM connector.admit_project_owner(p_actor, p_project_id);
  UPDATE connector.project_grant AS stored
  SET revoked_at = clock_timestamp(), revoked_by = p_actor
  WHERE stored.grant_id = p_grant_id AND stored.project_id = p_project_id AND stored.revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION connector.revoke_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.revoke_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.revoke_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid) TO hub_iam_runtime;

-- The broker's three calls. None takes an actor: authority for a broker call is the Consumer's scope
-- the Hub already resolved, never a re-admission here. A row comes back only when the grant is open,
-- the Connection is enabled and the Project is not archived; otherwise the broker sees no row and
-- answers NOT_GRANTED without disclosing which of the three failed.
CREATE FUNCTION connector.resolve_grant(p_project_id uuid, p_environment text, p_capability_kind text, p_capability_id text) RETURNS TABLE(grant_id uuid, connection_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT open_grant.grant_id, open_grant.connection_id
  FROM connector.project_grant AS open_grant
  JOIN connector.connection AS connection ON connection.connection_id = open_grant.connection_id
  JOIN project.project AS bound_project ON bound_project.project_id = open_grant.project_id
  WHERE open_grant.project_id = p_project_id AND open_grant.environment = p_environment
    AND open_grant.capability_kind = p_capability_kind AND open_grant.capability_id = p_capability_id
    AND open_grant.revoked_at IS NULL AND connection.disabled_at IS NULL AND NOT bound_project.archived;
$$;

ALTER FUNCTION connector.resolve_grant(p_project_id uuid, p_environment text, p_capability_kind text, p_capability_id text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.resolve_grant(p_project_id uuid, p_environment text, p_capability_kind text, p_capability_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.resolve_grant(p_project_id uuid, p_environment text, p_capability_kind text, p_capability_id text) TO hub_iam_runtime;

-- Sealed text or NULL: the broker opens the envelope, this function never has to.
CREATE FUNCTION connector.read_connection_credential(p_connection_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.credential_sealed FROM connector.connection AS stored
  WHERE stored.connection_id = p_connection_id AND stored.disabled_at IS NULL;
$$;

ALTER FUNCTION connector.read_connection_credential(p_connection_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.read_connection_credential(p_connection_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.read_connection_credential(p_connection_id uuid) TO hub_iam_runtime;

CREATE FUNCTION connector.list_granted_capabilities(p_project_id uuid, p_environment text) RETURNS TABLE(capability_kind text, capability_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT open_grant.capability_kind, open_grant.capability_id
  FROM connector.project_grant AS open_grant
  JOIN connector.connection AS connection ON connection.connection_id = open_grant.connection_id
  JOIN project.project AS bound_project ON bound_project.project_id = open_grant.project_id
  WHERE open_grant.project_id = p_project_id AND open_grant.environment = p_environment
    AND open_grant.revoked_at IS NULL AND connection.disabled_at IS NULL AND NOT bound_project.archived
  ORDER BY open_grant.capability_id;
$$;

ALTER FUNCTION connector.list_granted_capabilities(p_project_id uuid, p_environment text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_granted_capabilities(p_project_id uuid, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_granted_capabilities(p_project_id uuid, p_environment text) TO hub_iam_runtime;

COMMIT;
