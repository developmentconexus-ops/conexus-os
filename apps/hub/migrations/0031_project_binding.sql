BEGIN;

-- C-030: a Workspace owner binds a whole Connection to a Project under a Project-local name, such as
-- 'erp', and the binding is the whole grant. This replaces connector.project_grant, a grant per
-- operation, and lets a Workspace hold several open Connections of one integrator.

-- A Project binding. The two composite foreign keys share workspace_id with project.project and
-- connector.connection, so a binding whose Project and Connection sit in different Workspaces cannot
-- be written (P7). Unbinding keeps the row as the record of who bound and unbound it, and when.
CREATE TABLE connector.project_binding (
    binding_id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    project_id uuid NOT NULL,
    environment text NOT NULL,
    connection_id uuid NOT NULL,
    name text NOT NULL,
    bound_by uuid NOT NULL,
    bound_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    unbound_by uuid,
    unbound_at timestamp with time zone,
    CONSTRAINT project_binding_pkey PRIMARY KEY (binding_id),
    CONSTRAINT project_binding_project_workspace_fkey FOREIGN KEY (project_id, workspace_id) REFERENCES project.project(project_id, workspace_id) ON DELETE RESTRICT,
    CONSTRAINT project_binding_connection_workspace_fkey FOREIGN KEY (connection_id, workspace_id) REFERENCES connector.connection(connection_id, workspace_id) ON DELETE RESTRICT,
    CONSTRAINT project_binding_bound_by_fkey FOREIGN KEY (bound_by) REFERENCES iam.account(account_id),
    CONSTRAINT project_binding_unbound_by_fkey FOREIGN KEY (unbound_by) REFERENCES iam.account(account_id),
    CONSTRAINT project_binding_environment_check CHECK (environment = 'preview'::text),
    CONSTRAINT project_binding_name_check CHECK (name ~ '^[a-z][a-z0-9-]{0,39}$'::text),
    CONSTRAINT project_binding_unbinding_check CHECK ((unbound_at IS NULL) = (unbound_by IS NULL)),
    CONSTRAINT project_binding_order_check CHECK (unbound_at IS NULL OR unbound_at >= bound_at)
);

ALTER TABLE connector.project_binding OWNER TO connector_owner;

REVOKE ALL ON TABLE connector.project_binding FROM PUBLIC;

-- One open name names exactly one Connection, and one Connection reaches a Project under exactly
-- one open name.
CREATE UNIQUE INDEX project_binding_open_name_key ON connector.project_binding USING btree (project_id, environment, name) WHERE (unbound_at IS NULL);
CREATE UNIQUE INDEX project_binding_open_connection_key ON connector.project_binding USING btree (project_id, environment, connection_id) WHERE (unbound_at IS NULL);

-- Every open grant becomes one open binding named 'erp': connection_connector_id_check still admits
-- only Sankhya, an ERP, at this point. Several open grants of one Project, environment and
-- Connection collapse into one binding that keeps the earliest grant's id and attribution. No two
-- open bindings of a Project can both be named 'erp': connection_open_key kept one open Connection
-- per Workspace, and disabling a Connection revoked its grants, so a Project's open grants all
-- name one Connection.
INSERT INTO connector.project_binding (binding_id, workspace_id, project_id, environment, connection_id, name, bound_by, bound_at)
SELECT DISTINCT ON (open_grant.project_id, open_grant.environment, open_grant.connection_id)
  open_grant.grant_id, open_grant.workspace_id, open_grant.project_id, open_grant.environment, open_grant.connection_id, 'erp', open_grant.granted_by, open_grant.granted_at
FROM connector.project_grant AS open_grant
WHERE open_grant.revoked_at IS NULL
ORDER BY open_grant.project_id, open_grant.environment, open_grant.connection_id, open_grant.granted_at, open_grant.grant_id;

-- Every revoked grant becomes one unbound binding with its own id and attribution, so the history
-- of who granted and revoked what survives the grant table.
INSERT INTO connector.project_binding (binding_id, workspace_id, project_id, environment, connection_id, name, bound_by, bound_at, unbound_by, unbound_at)
SELECT revoked_grant.grant_id, revoked_grant.workspace_id, revoked_grant.project_id, revoked_grant.environment, revoked_grant.connection_id, 'erp',
  revoked_grant.granted_by, revoked_grant.granted_at, revoked_grant.revoked_by, revoked_grant.revoked_at
FROM connector.project_grant AS revoked_grant
WHERE revoked_grant.revoked_at IS NOT NULL;

-- The Hub's registry and the wire enum decide which integrators exist, so the table checks only the
-- shape of an integrator id, and a new integrator needs no migration of its own. A Workspace may hold
-- several open Connections of one integrator.
DROP INDEX connector.connection_open_key;
ALTER TABLE connector.connection DROP CONSTRAINT connection_connector_id_check;
ALTER TABLE connector.connection ADD CONSTRAINT connection_connector_id_check CHECK (connector_id ~ '^[a-z][a-z0-9-]{0,39}$'::text);

-- Disable is terminal, so the Connection's open bindings end with it, recording the administrator
-- as unbound_by: every open binding is then on an enabled Connection, and the Owner binds the
-- replacing Connection as a new binding instead of meeting the old one.
CREATE OR REPLACE FUNCTION connector.disable_connection(p_actor uuid, p_workspace_id uuid, p_connection_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM connector.admit_installation_administrator(p_actor);
  UPDATE connector.connection AS stored
  SET disabled_at = clock_timestamp(), disabled_by = p_actor
  WHERE stored.connection_id = p_connection_id AND stored.workspace_id = p_workspace_id AND stored.disabled_at IS NULL;
  IF FOUND THEN
    UPDATE connector.project_binding AS open_binding
    SET unbound_at = clock_timestamp(), unbound_by = p_actor
    WHERE open_binding.connection_id = p_connection_id AND open_binding.unbound_at IS NULL;
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id AND stored.workspace_id = p_workspace_id);
END;
$$;

CREATE OR REPLACE FUNCTION connector.purge_project(p_project_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  DELETE FROM connector.project_binding WHERE project_id = p_project_id;
$$;

DROP FUNCTION connector.list_project_grants(p_actor uuid, p_project_id uuid, p_operation_ids text[]);
DROP FUNCTION connector.grant_capability(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_operation_id text);
DROP FUNCTION connector.revoke_grant(p_actor uuid, p_project_id uuid, p_grant_id uuid);
DROP FUNCTION connector.resolve_grant(p_project_id uuid, p_environment text, p_capability_kind text, p_capability_id text);
DROP FUNCTION connector.list_granted_capabilities(p_project_id uuid, p_environment text);
DROP TABLE connector.project_grant;

-- One projection: the Project's open bindings and, beside them, the Workspace's enabled Connections
-- it has not bound. 'binding' sorts after 'bindable', so the descending kind lists bindings first.
CREATE FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) RETURNS TABLE(kind text, binding_id uuid, name text, connection_id uuid, connector_id text, label text, bound_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  owning_workspace_id := connector.admit_project_owner(p_actor, p_project_id);
  RETURN QUERY
  SELECT 'binding'::text, open_binding.binding_id, open_binding.name, connection.connection_id, connection.connector_id, connection.label, open_binding.bound_at
  FROM connector.project_binding AS open_binding
  JOIN connector.connection AS connection ON connection.connection_id = open_binding.connection_id
  WHERE open_binding.project_id = p_project_id AND open_binding.environment = 'preview' AND open_binding.unbound_at IS NULL
    AND connection.disabled_at IS NULL
  UNION ALL
  SELECT 'bindable'::text, NULL::uuid, NULL::text, connection.connection_id, connection.connector_id, connection.label, NULL::timestamptz
  FROM connector.connection AS connection
  WHERE connection.workspace_id = owning_workspace_id AND connection.disabled_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM connector.project_binding AS open_binding
      WHERE open_binding.project_id = p_project_id AND open_binding.environment = 'preview'
        AND open_binding.connection_id = connection.connection_id AND open_binding.unbound_at IS NULL
    )
  ORDER BY 1 DESC, 3, 6, 4;
END;
$$;

ALTER FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) TO hub_iam_runtime;

-- A Connection of another Workspace, a disabled one or a missing one answers the same non-disclosing
-- P0002 as an invisible Project: an Owner learns only that it cannot be bound, never why. The same
-- Connection already open under the same name answers that binding. The Connection open under
-- another name, or the name open on another Connection, is a conflict rather than a silent rebind.
CREATE FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) RETURNS TABLE(binding_id uuid, name text, connection_id uuid, connector_id text, label text, bound_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
  connection_workspace_id uuid;
  connection_disabled_at timestamp with time zone;
  settled_binding_id uuid;
BEGIN
  owning_workspace_id := connector.admit_project_owner(p_actor, p_project_id);
  -- FOR SHARE holds off a concurrent disable until this binding commits, so the disable then ends it.
  SELECT stored.workspace_id, stored.disabled_at INTO connection_workspace_id, connection_disabled_at
  FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id FOR SHARE;
  IF connection_workspace_id IS NULL OR connection_workspace_id <> owning_workspace_id OR connection_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION 'CONNECTOR_CONNECTION_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;
  -- ON CONFLICT DO NOTHING on either open key: a concurrent identical bind waits for the winner's
  -- commit, inserts nothing, and answers the winner's binding.
  INSERT INTO connector.project_binding (workspace_id, project_id, environment, connection_id, name, bound_by)
  VALUES (owning_workspace_id, p_project_id, 'preview', p_connection_id, p_name, p_actor)
  ON CONFLICT DO NOTHING
  RETURNING connector.project_binding.binding_id INTO settled_binding_id;
  IF settled_binding_id IS NULL THEN
    SELECT open_binding.binding_id INTO settled_binding_id
    FROM connector.project_binding AS open_binding
    WHERE open_binding.project_id = p_project_id AND open_binding.environment = 'preview'
      AND open_binding.connection_id = p_connection_id AND open_binding.name = p_name AND open_binding.unbound_at IS NULL;
    IF settled_binding_id IS NULL THEN
      RAISE EXCEPTION 'CONNECTOR_BINDING_CONFLICT';
    END IF;
  END IF;
  RETURN QUERY
  SELECT stored.binding_id, stored.name, connection.connection_id, connection.connector_id, connection.label, stored.bound_at
  FROM connector.project_binding AS stored
  JOIN connector.connection AS connection ON connection.connection_id = stored.connection_id
  WHERE stored.binding_id = settled_binding_id;
END;
$$;

ALTER FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) TO hub_iam_runtime;

-- Scoped to the named Project: a binding id of another Project is not found rather than ended.
-- Idempotent: unbinding twice answers false the second time, and the row stays as the record.
CREATE FUNCTION connector.unbind_connection(p_actor uuid, p_project_id uuid, p_binding_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM connector.admit_project_owner(p_actor, p_project_id);
  UPDATE connector.project_binding AS stored
  SET unbound_at = clock_timestamp(), unbound_by = p_actor
  WHERE stored.binding_id = p_binding_id AND stored.project_id = p_project_id AND stored.unbound_at IS NULL;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION connector.unbind_connection(p_actor uuid, p_project_id uuid, p_binding_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.unbind_connection(p_actor uuid, p_project_id uuid, p_binding_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.unbind_connection(p_actor uuid, p_project_id uuid, p_binding_id uuid) TO hub_iam_runtime;

-- The broker's read. It takes no actor: authority for a broker call is the consumer's scope the Hub
-- already resolved, never a re-admission here. A row comes back only for an open binding on an
-- enabled Connection of a Project that is not archived; otherwise the broker sees no row and answers
-- NOT_GRANTED without disclosing which of the three failed.
CREATE FUNCTION connector.list_bound_connections(p_project_id uuid, p_environment text) RETURNS TABLE(binding_id uuid, name text, connection_id uuid, connector_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT open_binding.binding_id, open_binding.name, open_binding.connection_id, connection.connector_id
  FROM connector.project_binding AS open_binding
  JOIN connector.connection AS connection ON connection.connection_id = open_binding.connection_id
  JOIN project.project AS bound_project ON bound_project.project_id = open_binding.project_id
  WHERE open_binding.project_id = p_project_id AND open_binding.environment = p_environment
    AND open_binding.unbound_at IS NULL AND connection.disabled_at IS NULL AND NOT bound_project.archived
  ORDER BY open_binding.name;
$$;

ALTER FUNCTION connector.list_bound_connections(p_project_id uuid, p_environment text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_bound_connections(p_project_id uuid, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_bound_connections(p_project_id uuid, p_environment text) TO hub_iam_runtime;

COMMIT;
