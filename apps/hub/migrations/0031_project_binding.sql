BEGIN;

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

CREATE UNIQUE INDEX project_binding_open_name_key ON connector.project_binding USING btree (project_id, environment, name) WHERE (unbound_at IS NULL);
CREATE UNIQUE INDEX project_binding_open_connection_key ON connector.project_binding USING btree (project_id, environment, connection_id) WHERE (unbound_at IS NULL);

INSERT INTO connector.project_binding (binding_id, workspace_id, project_id, environment, connection_id, name, bound_by, bound_at)
SELECT DISTINCT ON (open_grant.project_id, open_grant.environment, open_grant.connection_id)
  open_grant.grant_id, open_grant.workspace_id, open_grant.project_id, open_grant.environment, open_grant.connection_id, 'erp', open_grant.granted_by, open_grant.granted_at
FROM connector.project_grant AS open_grant
WHERE open_grant.revoked_at IS NULL
ORDER BY open_grant.project_id, open_grant.environment, open_grant.connection_id, open_grant.granted_at, open_grant.grant_id;

INSERT INTO connector.project_binding (binding_id, workspace_id, project_id, environment, connection_id, name, bound_by, bound_at, unbound_by, unbound_at)
SELECT revoked_grant.grant_id, revoked_grant.workspace_id, revoked_grant.project_id, revoked_grant.environment, revoked_grant.connection_id, 'erp',
  revoked_grant.granted_by, revoked_grant.granted_at, revoked_grant.revoked_by, revoked_grant.revoked_at
FROM connector.project_grant AS revoked_grant
WHERE revoked_grant.revoked_at IS NOT NULL;

DROP INDEX connector.connection_open_key;
ALTER TABLE connector.connection DROP CONSTRAINT connection_connector_id_check;
ALTER TABLE connector.connection ADD CONSTRAINT connection_connector_id_check CHECK (connector_id ~ '^[a-z][a-z0-9-]{0,39}$'::text);

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

CREATE FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) RETURNS TABLE(kind text, binding_id uuid, name text, connection_id uuid, connector_id text, label text, bound_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  owning_workspace_id := connector.admit_project_owner(p_actor, p_project_id);
  RETURN QUERY
  SELECT entry.kind, entry.binding_id, entry.name, entry.connection_id, entry.connector_id, entry.label, entry.bound_at
  FROM (
    SELECT 'binding'::text AS kind, open_binding.binding_id, open_binding.name, connection.connection_id, connection.connector_id, connection.label, open_binding.bound_at
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
  ) AS entry
  ORDER BY entry.kind = 'binding' DESC, entry.name, entry.label, entry.connection_id;
END;
$$;

ALTER FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) TO hub_iam_runtime;

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
  SELECT stored.workspace_id, stored.disabled_at INTO connection_workspace_id, connection_disabled_at
  FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id FOR SHARE;
  IF connection_workspace_id IS NULL OR connection_workspace_id <> owning_workspace_id OR connection_disabled_at IS NOT NULL THEN
    RAISE EXCEPTION 'CONNECTOR_CONNECTION_NOT_AVAILABLE' USING ERRCODE = 'P0002';
  END IF;
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
