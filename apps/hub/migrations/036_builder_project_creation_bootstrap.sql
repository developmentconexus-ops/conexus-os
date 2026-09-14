BEGIN;

SET LOCAL ROLE builder_owner;
GRANT USAGE ON SCHEMA builder TO project_owner;
GRANT INSERT ON builder.project_working_state TO project_owner;
RESET ROLE;

SET LOCAL ROLE project_owner;

CREATE OR REPLACE FUNCTION project.create_project_with_source(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_project_id uuid,
  p_name text,
  p_source_mode text,
  p_source_revision text,
  p_project_revision text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM project.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
    AND operation_receipt.request_digest = p_request_digest
    AND operation_receipt.reserved_project_id = p_project_id
    AND operation_receipt.outcome = 'RESERVED'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_RECEIPT_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO project.project (
    project_id, workspace_id, name, source_mode, source_revision, project_revision
  ) VALUES (
    p_project_id, p_workspace_id, p_name, p_source_mode, p_source_revision, p_project_revision
  );

  INSERT INTO builder.project_working_state(project_id, working_source_revision)
  VALUES (p_project_id, p_source_revision);
END;
$$;

RESET ROLE;
COMMIT;
