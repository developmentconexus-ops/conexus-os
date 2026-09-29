BEGIN;

-- A Connection reaches one system, fixed at creation: the company's production Sankhya or its sandbox.
-- Rows that exist before this migration were all created against the installation's single
-- production-or-sandbox origin; they are marked production. An operator whose existing Connection
-- points at the sandbox corrects it before this migration applies, or rebinds a new one.
ALTER TABLE connector.connection ADD COLUMN destination text;
UPDATE connector.connection SET destination = 'production';
ALTER TABLE connector.connection
  ALTER COLUMN destination SET NOT NULL,
  ADD CONSTRAINT connection_destination_check CHECK (destination IN ('production', 'sandbox'));

DROP FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid);
DROP FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_credential_sealed text, p_credential_digests text[]);
DROP FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid);
DROP FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text);
DROP FUNCTION connector.list_bound_connections(p_project_id uuid, p_environment text);

CREATE FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) RETURNS TABLE(connection_id uuid, connector_id text, label text, destination text, created_at timestamp with time zone, disabled_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  PERFORM connector.admit_installation_administrator(p_actor);
  RETURN QUERY
  SELECT stored.connection_id, stored.connector_id, stored.label, stored.destination, stored.created_at, stored.disabled_at
  FROM connector.connection AS stored
  WHERE stored.workspace_id = p_workspace_id
  ORDER BY stored.created_at;
END;
$$;

ALTER FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.list_connections(p_actor uuid, p_workspace_id uuid) TO hub_iam_runtime;

-- As before, plus the destination: a retry with the same id and another destination is a conflict, like another label.
CREATE FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_destination text, p_credential_sealed text, p_credential_digests text[]) RETURNS TABLE(connection_id uuid, connector_id text, label text, destination text, created_at timestamp with time zone, disabled_at timestamp with time zone, created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  inserted boolean;
  existing connector.connection%ROWTYPE;
BEGIN
  PERFORM connector.admit_installation_administrator(p_actor);
  BEGIN
    INSERT INTO connector.connection (connection_id, workspace_id, connector_id, label, destination, credential_sealed, credential_digest, created_by)
    VALUES (p_connection_id, p_workspace_id, p_connector_id, p_label, p_destination, p_credential_sealed, p_credential_digests[1], p_actor)
    ON CONFLICT DO NOTHING;
    inserted := FOUND;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'CONNECTOR_WORKSPACE_NOT_FOUND' USING ERRCODE = 'P0002';
  END;
  IF NOT inserted THEN
    SELECT * INTO existing FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id;
    IF NOT FOUND OR existing.workspace_id <> p_workspace_id OR existing.connector_id <> p_connector_id
       OR existing.label <> p_label OR existing.destination <> p_destination
       OR NOT existing.credential_digest = ANY (p_credential_digests) THEN
      RAISE EXCEPTION 'CONNECTOR_CONNECTION_CONFLICT';
    END IF;
  END IF;
  RETURN QUERY
  SELECT stored.connection_id, stored.connector_id, stored.label, stored.destination, stored.created_at, stored.disabled_at, inserted
  FROM connector.connection AS stored WHERE stored.connection_id = p_connection_id;
END;
$$;

ALTER FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_destination text, p_credential_sealed text, p_credential_digests text[]) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_destination text, p_credential_sealed text, p_credential_digests text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.create_connection(p_actor uuid, p_connection_id uuid, p_workspace_id uuid, p_connector_id text, p_label text, p_destination text, p_credential_sealed text, p_credential_digests text[]) TO hub_iam_runtime;

CREATE FUNCTION connector.list_project_bindings(p_actor uuid, p_project_id uuid) RETURNS TABLE(kind text, binding_id uuid, name text, connection_id uuid, connector_id text, label text, destination text, bound_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  owning_workspace_id := connector.admit_project_owner(p_actor, p_project_id);
  RETURN QUERY
  SELECT entry.kind, entry.binding_id, entry.name, entry.connection_id, entry.connector_id, entry.label, entry.destination, entry.bound_at
  FROM (
    SELECT 'binding'::text AS kind, open_binding.binding_id, open_binding.name, connection.connection_id, connection.connector_id, connection.label, connection.destination, open_binding.bound_at
    FROM connector.project_binding AS open_binding
    JOIN connector.connection AS connection ON connection.connection_id = open_binding.connection_id
    WHERE open_binding.project_id = p_project_id AND open_binding.environment = 'preview' AND open_binding.unbound_at IS NULL
      AND connection.disabled_at IS NULL
    UNION ALL
    SELECT 'bindable'::text, NULL::uuid, NULL::text, connection.connection_id, connection.connector_id, connection.label, connection.destination, NULL::timestamptz
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

CREATE FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) RETURNS TABLE(binding_id uuid, name text, connection_id uuid, connector_id text, label text, destination text, bound_at timestamp with time zone)
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
  SELECT stored.binding_id, stored.name, connection.connection_id, connection.connector_id, connection.label, connection.destination, stored.bound_at
  FROM connector.project_binding AS stored
  JOIN connector.connection AS connection ON connection.connection_id = stored.connection_id
  WHERE stored.binding_id = settled_binding_id;
END;
$$;

ALTER FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) OWNER TO connector_owner;

REVOKE ALL ON FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION connector.bind_connection(p_actor uuid, p_project_id uuid, p_connection_id uuid, p_name text) TO hub_iam_runtime;

CREATE FUNCTION connector.list_bound_connections(p_project_id uuid, p_environment text) RETURNS TABLE(binding_id uuid, name text, connection_id uuid, connector_id text, destination text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT open_binding.binding_id, open_binding.name, open_binding.connection_id, connection.connector_id, connection.destination
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
