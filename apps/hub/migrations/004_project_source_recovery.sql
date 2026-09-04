BEGIN;

SET LOCAL ROLE project_owner;

CREATE FUNCTION project.claim_abandoned_create_project_attempt(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_project_id uuid,
  p_expired_before timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt project.operation_idempotency%ROWTYPE;
BEGIN
  SELECT * INTO receipt
  FROM project.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_RECEIPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.request_digest <> p_request_digest OR receipt.reserved_project_id <> p_project_id THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_RECEIPT_IDENTITY_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.outcome <> 'RESERVED'
    OR receipt.response_status IS NOT NULL
    OR receipt.response_digest IS NOT NULL
    OR receipt.response_body IS NOT NULL
    OR receipt.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_RECEIPT_TERMINAL' USING ERRCODE = 'P0001';
  END IF;
  IF p_expired_before IS NULL OR receipt.created_at > p_expired_before THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_RECEIPT_NOT_EXPIRED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM project.project AS stored_project
    WHERE stored_project.project_id = receipt.reserved_project_id
  ) THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_PROJECT_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM project.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = receipt.operation_id
    AND operation_receipt.account_id = receipt.account_id
    AND operation_receipt.workspace_id = receipt.workspace_id
    AND operation_receipt.key_digest = receipt.key_digest
    AND operation_receipt.request_digest = receipt.request_digest
    AND operation_receipt.reserved_project_id = receipt.reserved_project_id
    AND operation_receipt.outcome = 'RESERVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_RECEIPT_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  RETURN receipt.reserved_project_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.claim_abandoned_create_project_attempt(uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION project.claim_abandoned_create_project_attempt(uuid, uuid, text, text, uuid, timestamptz) TO hub_prj03_command;

COMMIT;
