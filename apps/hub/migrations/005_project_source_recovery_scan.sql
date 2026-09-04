BEGIN;

SET LOCAL ROLE project_owner;

CREATE OR REPLACE FUNCTION project.claim_abandoned_create_project_attempt(
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
  IF p_expired_before IS NULL
    OR p_expired_before > statement_timestamp()
    OR receipt.created_at > p_expired_before THEN
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

CREATE FUNCTION project.claim_abandoned_create_project_attempt(
  p_expired_before timestamptz,
  p_limit integer
) RETURNS TABLE(
  account_id uuid,
  workspace_id uuid,
  key_digest text,
  request_digest text,
  project_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_expired_before IS NULL OR p_expired_before > statement_timestamp() THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_SCAN_CUTOFF_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 16 THEN
    RAISE EXCEPTION 'PRJ03_ABANDONED_SCAN_LIMIT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT operation_receipt.operation_id,
      operation_receipt.account_id,
      operation_receipt.workspace_id,
      operation_receipt.key_digest,
      operation_receipt.request_digest,
      operation_receipt.reserved_project_id,
      operation_receipt.created_at
    FROM project.operation_idempotency AS operation_receipt
    WHERE operation_receipt.operation_id = 'PRJ-03'
      AND operation_receipt.outcome = 'RESERVED'
      AND operation_receipt.response_status IS NULL
      AND operation_receipt.response_digest IS NULL
      AND operation_receipt.response_body IS NULL
      AND operation_receipt.completed_at IS NULL
      AND operation_receipt.created_at <= p_expired_before
      AND NOT EXISTS (
        SELECT 1
        FROM project.project AS stored_project
        WHERE stored_project.project_id = operation_receipt.reserved_project_id
      )
    ORDER BY operation_receipt.created_at,
      operation_receipt.account_id,
      operation_receipt.workspace_id,
      operation_receipt.key_digest
    FOR UPDATE OF operation_receipt SKIP LOCKED
    LIMIT p_limit
  ), deleted AS (
    DELETE FROM project.operation_idempotency AS operation_receipt
    USING candidates
    WHERE operation_receipt.operation_id = candidates.operation_id
      AND operation_receipt.account_id = candidates.account_id
      AND operation_receipt.workspace_id = candidates.workspace_id
      AND operation_receipt.key_digest = candidates.key_digest
    RETURNING operation_receipt.account_id,
      operation_receipt.workspace_id,
      operation_receipt.key_digest,
      operation_receipt.request_digest,
      operation_receipt.reserved_project_id
  )
  SELECT deleted.account_id,
    deleted.workspace_id,
    deleted.key_digest,
    deleted.request_digest,
    deleted.reserved_project_id
  FROM deleted
  JOIN candidates
    ON candidates.operation_id = 'PRJ-03'
    AND candidates.account_id = deleted.account_id
    AND candidates.workspace_id = deleted.workspace_id
    AND candidates.key_digest = deleted.key_digest
  ORDER BY candidates.created_at,
    deleted.account_id,
    deleted.workspace_id,
    deleted.key_digest;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.claim_abandoned_create_project_attempt(uuid, uuid, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.claim_abandoned_create_project_attempt(timestamptz, integer) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION project.claim_abandoned_create_project_attempt(uuid, uuid, text, text, uuid, timestamptz) TO hub_prj03_command;
GRANT EXECUTE ON FUNCTION project.claim_abandoned_create_project_attempt(timestamptz, integer) TO hub_prj03_command;

COMMIT;
