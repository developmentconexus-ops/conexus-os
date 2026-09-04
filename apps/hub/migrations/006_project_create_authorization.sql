BEGIN;

SET LOCAL ROLE iam_owner;

CREATE FUNCTION iam.can_create_project(p_account_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.workspace_membership AS membership
    WHERE membership.account_id = p_account_id
      AND membership.workspace_id = p_workspace_id
      AND membership.can_create_project
  );
$$;

REVOKE EXECUTE ON FUNCTION iam.can_create_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.can_create_project(uuid, uuid) TO project_owner;

RESET ROLE;
SET LOCAL ROLE project_owner;

CREATE OR REPLACE FUNCTION project.reserve_or_replay_create_project(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_candidate_project_id uuid
) RETURNS TABLE(state text, project_id uuid, response_status integer, response_body jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt project.operation_idempotency%ROWTYPE;
  inserted_count integer;
BEGIN
  IF NOT iam.can_create_project(p_account_id, p_workspace_id) THEN
    RAISE EXCEPTION 'PRJ03_CREATE_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO project.operation_idempotency (
      operation_id, account_id, workspace_id, key_digest, request_digest, reserved_project_id, outcome
    ) VALUES (
      'PRJ-03', p_account_id, p_workspace_id, p_key_digest, p_request_digest, p_candidate_project_id, 'RESERVED'
    ) ON CONFLICT (operation_id, account_id, workspace_id, key_digest) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'PRJ03_PROJECT_ID_ALREADY_RESERVED' USING ERRCODE = 'P0001';
  END;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 1 AND EXISTS (
    SELECT 1 FROM project.project AS stored_project
    WHERE stored_project.project_id = p_candidate_project_id
  ) THEN
    RAISE EXCEPTION 'PRJ03_PROJECT_ID_ALREADY_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO STRICT receipt
  FROM project.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
  FOR UPDATE;

  IF receipt.request_digest <> p_request_digest THEN
    RETURN QUERY SELECT 'CONFLICT'::text, receipt.reserved_project_id, NULL::integer, NULL::jsonb;
  ELSIF receipt.outcome = 'SUCCEEDED' THEN
    RETURN QUERY SELECT 'REPLAY'::text, receipt.reserved_project_id, receipt.response_status, receipt.response_body;
  ELSE
    RETURN QUERY SELECT 'RESERVED'::text, receipt.reserved_project_id, NULL::integer, NULL::jsonb;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION project.lock_create_project_receipt(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_project_id uuid
) RETURNS TABLE(outcome text, project_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt project.operation_idempotency%ROWTYPE;
BEGIN
  IF NOT iam.can_create_project(p_account_id, p_workspace_id) THEN
    RAISE EXCEPTION 'PRJ03_CREATE_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO STRICT receipt
  FROM project.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = 'PRJ-03'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.workspace_id = p_workspace_id
    AND operation_receipt.key_digest = p_key_digest
  FOR UPDATE;

  IF receipt.request_digest <> p_request_digest OR receipt.reserved_project_id <> p_project_id THEN
    RAISE EXCEPTION 'PRJ03_RECEIPT_IDENTITY_MISMATCH' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT receipt.outcome, receipt.reserved_project_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.reserve_or_replay_create_project(uuid, uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.lock_create_project_receipt(uuid, uuid, text, text, uuid) FROM PUBLIC;

RESET ROLE;

COMMIT;
