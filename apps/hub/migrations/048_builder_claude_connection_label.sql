BEGIN;

SET LOCAL ROLE claude_connection_owner;

ALTER TABLE claude_connection.connection
  DROP CONSTRAINT IF EXISTS connection_label_check;

ALTER TABLE claude_connection.connection
  ADD CONSTRAINT connection_label_check
  CHECK (label ~ '[^[:space:]]' AND length(label) <= 120);

CREATE OR REPLACE FUNCTION claude_connection.publish_connection(
  p_account_id uuid, p_connection_id uuid, p_label text, p_generation bigint
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_generation <= 0 OR p_label !~ '[^[:space:]]' OR length(p_label) > 120 THEN RETURN false; END IF;
  INSERT INTO claude_connection.connection(connection_id, owner_account_id, label, state, current_generation)
  VALUES (p_connection_id, p_account_id, btrim(p_label), 'ACTIVE', p_generation);
  INSERT INTO claude_connection.binding(connection_id, account_id, workspace_id, role)
  SELECT p_connection_id, p_account_id, membership.workspace_id, 'OWNER'
  FROM iam.workspace_membership AS membership
  WHERE membership.account_id = p_account_id
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    DELETE FROM claude_connection.connection WHERE connection_id = p_connection_id;
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

RESET ROLE;
COMMIT;
