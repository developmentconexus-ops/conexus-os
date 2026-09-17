BEGIN;

SET LOCAL ROLE claude_connection_owner;

CREATE OR REPLACE FUNCTION claude_connection.select_connection(p_account_id uuid, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  SELECT connection_row.* INTO selected
  FROM claude_connection.connection AS connection_row
  JOIN claude_connection.binding AS binding ON binding.connection_id = connection_row.connection_id
  JOIN iam.workspace_membership AS membership ON membership.account_id = p_account_id AND membership.workspace_id = binding.workspace_id
  WHERE binding.account_id = p_account_id AND binding.connection_id = p_connection_id
    AND binding.revoked_at IS NULL AND connection_row.state = 'ACTIVE'
  FOR UPDATE OF connection_row;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO claude_connection.preference(account_id, connection_id)
  VALUES (p_account_id, p_connection_id)
  ON CONFLICT (account_id) DO UPDATE SET connection_id = EXCLUDED.connection_id, updated_at = clock_timestamp();
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.share_connection(
  p_owner_account_id uuid, p_connection_id uuid, p_account_id uuid, p_workspace_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM claude_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR selected.owner_account_id <> p_owner_account_id OR selected.state <> 'ACTIVE'
    OR NOT EXISTS (SELECT 1 FROM iam.workspace_membership WHERE account_id = p_owner_account_id AND workspace_id = p_workspace_id)
    OR NOT EXISTS (SELECT 1 FROM iam.workspace_membership WHERE account_id = p_account_id AND workspace_id = p_workspace_id) THEN RETURN false; END IF;
  INSERT INTO claude_connection.binding(connection_id, account_id, workspace_id, role)
  VALUES (p_connection_id, p_account_id, p_workspace_id, 'USER')
  ON CONFLICT (connection_id, account_id, workspace_id) DO UPDATE SET revoked_at = NULL;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.revoke_connection(p_account_id uuid, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM claude_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR selected.owner_account_id <> p_account_id THEN RETURN false; END IF;
  IF selected.state = 'REVOKED' THEN RETURN true; END IF;
  UPDATE claude_connection.connection
  SET state = 'REVOKED', revoked_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE connection_id = p_connection_id;
  DELETE FROM claude_connection.preference WHERE connection_id = p_connection_id;
  UPDATE claude_connection.binding SET revoked_at = clock_timestamp()
  WHERE connection_id = p_connection_id AND revoked_at IS NULL;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.admit_for_project(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(connection_id uuid, generation bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT connection_row.connection_id, connection_row.current_generation
  FROM claude_connection.preference AS preference
  JOIN claude_connection.connection AS connection_row ON connection_row.connection_id = preference.connection_id
  JOIN claude_connection.binding AS binding ON binding.connection_id = connection_row.connection_id
  JOIN project.project AS project_row ON project_row.workspace_id = binding.workspace_id AND project_row.project_id = p_project_id
  WHERE preference.account_id = p_account_id AND binding.account_id = p_account_id
    AND binding.revoked_at IS NULL AND connection_row.state = 'ACTIVE'
  ORDER BY preference.updated_at DESC
  LIMIT 1;
END;
$$;

RESET ROLE;

GRANT EXECUTE ON FUNCTION claude_connection.select_connection(uuid,uuid),
  claude_connection.share_connection(uuid,uuid,uuid,uuid),
  claude_connection.revoke_connection(uuid,uuid),
  claude_connection.admit_for_project(uuid,uuid)
  TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;

RESET ROLE;
COMMIT;
