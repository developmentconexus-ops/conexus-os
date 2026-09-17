BEGIN;

SET LOCAL ROLE iam_owner;

CREATE OR REPLACE FUNCTION iam.establish_project_creator_grant(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_project_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM project.operation_idempotency AS operation_receipt
  JOIN project.project AS stored_project
    ON stored_project.project_id = operation_receipt.reserved_project_id
    AND stored_project.workspace_id = operation_receipt.workspace_id
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
    AND operation_receipt.request_digest = p_request_digest
    AND operation_receipt.reserved_project_id = p_project_id
    AND operation_receipt.outcome = 'RESERVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_RECEIPT_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO iam.account_project_grant (
    account_id, project_id, can_read, can_manage,
    can_read_connection, can_manage_connection, can_qualify_connection,
    can_bind_brain, can_use_connection
  ) VALUES (p_account_id, p_project_id, true, true, true, true, true, true, true);

  INSERT INTO iam.project_builder_grant (account_id, project_id, can_build, can_read_source)
  VALUES (p_account_id, p_project_id, true, true)
  ON CONFLICT DO NOTHING;
END;
$$;

INSERT INTO iam.project_builder_grant (account_id, project_id, can_build, can_read_source)
SELECT receipt.account_id, receipt.reserved_project_id, true, true
FROM project.operation_idempotency AS receipt
JOIN project.project AS stored_project ON stored_project.project_id = receipt.reserved_project_id
  AND stored_project.workspace_id = receipt.workspace_id
WHERE receipt.operation_id = 'PRJ-03' AND receipt.outcome = 'SUCCEEDED'
ON CONFLICT DO NOTHING;

RESET ROLE;
COMMIT;
