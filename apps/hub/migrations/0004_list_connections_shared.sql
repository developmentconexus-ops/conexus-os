BEGIN;

-- An owner row's workspace_id is a Workspace the owner can see, which is a Workspace the connection
-- COULD be shared with, not one it IS shared with: the owner branch cross joins visible_workspaces
-- and never reads workspace_share. Settings read that id as a share and offered to withdraw one that
-- did not exist. `shared` says which of the two it is. A returned column cannot be added in place,
-- so the function is dropped and recreated with the same body, owner and grants.
DROP FUNCTION model_connection.list_connections(p_account_id uuid);

CREATE FUNCTION model_connection.list_connections(p_account_id uuid) RETURNS TABLE(connection_id uuid, label text, state text, current_generation bigint, owner_account_id uuid, workspace_id uuid, role text, revoked_at timestamp with time zone, provider_id text, credential_kind text, selected boolean, shared boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT visible.connection_id, visible.label, visible.state, visible.current_generation,
    visible.owner_account_id, visible.workspace_id, visible.role, visible.revoked_at,
    visible.provider_id, visible.credential_kind,
    EXISTS (
      SELECT 1 FROM model_connection.preference AS chosen
      WHERE chosen.account_id = p_account_id
        AND chosen.connection_id = visible.connection_id) AS selected,
    visible.shared
  FROM (
    SELECT connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      viewer.workspace_id, 'OWNER'::text AS role, connection_row.revoked_at,
      connection_row.provider_id, connection_row.credential_kind, connection_row.created_at,
      EXISTS (
        SELECT 1 FROM model_connection.workspace_share AS owned_share
        WHERE owned_share.connection_id = connection_row.connection_id
          AND owned_share.workspace_id = viewer.workspace_id) AS shared
    FROM model_connection.connection AS connection_row
    CROSS JOIN iam.visible_workspaces(p_account_id) AS viewer
    WHERE connection_row.owner_account_id = p_account_id
    UNION ALL
    SELECT connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      share.workspace_id, 'USER'::text AS role, connection_row.revoked_at,
      connection_row.provider_id, connection_row.credential_kind, connection_row.created_at,
      true AS shared
    FROM model_connection.connection AS connection_row
    JOIN model_connection.workspace_share AS share
      ON share.connection_id = connection_row.connection_id
    JOIN iam.visible_workspaces(p_account_id) AS viewer
      ON viewer.workspace_id = share.workspace_id
    WHERE connection_row.owner_account_id <> p_account_id
      AND share.workspace_id IN (
        SELECT owner_visible.workspace_id
        FROM iam.visible_workspaces(connection_row.owner_account_id) AS owner_visible)
  ) AS visible
  ORDER BY visible.created_at, visible.connection_id, visible.workspace_id;
$$;

ALTER FUNCTION model_connection.list_connections(p_account_id uuid) OWNER TO model_connection_owner;

REVOKE ALL ON FUNCTION model_connection.list_connections(p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION model_connection.list_connections(p_account_id uuid) TO builder_owner;
GRANT ALL ON FUNCTION model_connection.list_connections(p_account_id uuid) TO hub_model_connection;
GRANT ALL ON FUNCTION model_connection.list_connections(p_account_id uuid) TO hub_builder_executor;
GRANT ALL ON FUNCTION model_connection.list_connections(p_account_id uuid) TO hub_builder_ingress;

COMMIT;
