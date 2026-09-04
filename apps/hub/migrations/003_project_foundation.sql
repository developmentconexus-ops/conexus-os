BEGIN;

DO $$ BEGIN
  CREATE ROLE project_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_prj03_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS project AUTHORIZATION project_owner;
REVOKE ALL ON SCHEMA project FROM PUBLIC;
REVOKE ALL ON SCHEMA iam FROM PUBLIC;
REVOKE ALL ON SCHEMA workspace FROM PUBLIC;
GRANT USAGE ON SCHEMA project, iam TO hub_prj03_command;

SET LOCAL ROLE workspace_owner;
GRANT USAGE ON SCHEMA workspace TO project_owner;
GRANT REFERENCES ON workspace.workspace TO project_owner;
RESET ROLE;

SET LOCAL ROLE project_owner;

CREATE TABLE IF NOT EXISTS project.project (
  project_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name ~ '\S'),
  source_mode text NOT NULL CHECK (source_mode IN ('NEW', 'EXISTING_GIT')),
  source_revision text NOT NULL CHECK (source_revision ~ '\S'),
  project_revision text NOT NULL CHECK (project_revision ~ '\S'),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS project.operation_idempotency (
  operation_id text NOT NULL CHECK (operation_id = 'PRJ-03'),
  account_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  key_digest text NOT NULL CHECK (key_digest ~ '^[a-f0-9]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  reserved_project_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('RESERVED', 'SUCCEEDED')),
  response_status integer,
  response_digest text CHECK (response_digest ~ '^[a-f0-9]{64}$'),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (operation_id, account_id, workspace_id, key_digest),
  UNIQUE (reserved_project_id),
  CHECK (
    (outcome = 'RESERVED' AND response_status IS NULL AND response_digest IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (outcome = 'SUCCEEDED' AND response_status IS NOT NULL AND response_digest IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

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
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA project FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.reserve_or_replay_create_project(uuid, uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.lock_create_project_receipt(uuid, uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.create_project_with_source(uuid, uuid, text, text, uuid, text, text, text, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA project TO iam_owner;
GRANT REFERENCES ON project.project TO iam_owner;
GRANT SELECT (project_id, workspace_id) ON project.project TO iam_owner;
GRANT SELECT ON project.operation_idempotency TO iam_owner;

RESET ROLE;
SET LOCAL ROLE iam_owner;

CREATE TABLE IF NOT EXISTS iam.account_project_grant (
  account_id uuid NOT NULL REFERENCES iam.account(account_id),
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  can_read boolean NOT NULL CHECK (can_read),
  can_manage boolean NOT NULL CHECK (can_manage),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, project_id)
);

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

  INSERT INTO iam.account_project_grant (account_id, project_id, can_read, can_manage)
  VALUES (p_account_id, p_project_id, true, true);
END;
$$;

REVOKE ALL ON iam.account_project_grant FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.establish_project_creator_grant(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA iam TO project_owner;
GRANT SELECT ON iam.account_project_grant TO project_owner;

RESET ROLE;
SET LOCAL ROLE project_owner;

CREATE OR REPLACE FUNCTION project.complete_create_project_receipt(
  p_account_id uuid,
  p_workspace_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_project_id uuid,
  p_response_status integer,
  p_response_digest text,
  p_response_body jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM project.project AS stored_project
  JOIN iam.account_project_grant AS creator_grant
    ON creator_grant.project_id = stored_project.project_id
  WHERE stored_project.project_id = p_project_id
    AND stored_project.workspace_id = p_workspace_id
    AND creator_grant.account_id = p_account_id
    AND creator_grant.can_read
    AND creator_grant.can_manage;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_SETTLEMENT_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;

  UPDATE project.operation_idempotency
  SET outcome = 'SUCCEEDED', response_status = p_response_status,
      response_digest = p_response_digest, response_body = p_response_body,
      completed_at = clock_timestamp()
  WHERE operation_id = 'PRJ-03'
    AND account_id = p_account_id
    AND workspace_id = p_workspace_id
    AND key_digest = p_key_digest
    AND request_digest = p_request_digest
    AND reserved_project_id = p_project_id
    AND outcome = 'RESERVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ03_RECEIPT_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.complete_create_project_receipt(uuid, uuid, text, text, uuid, integer, text, jsonb) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION project.reserve_or_replay_create_project(uuid, uuid, text, text, uuid) TO hub_prj03_command;
GRANT EXECUTE ON FUNCTION project.lock_create_project_receipt(uuid, uuid, text, text, uuid) TO hub_prj03_command;
GRANT EXECUTE ON FUNCTION project.create_project_with_source(uuid, uuid, text, text, uuid, text, text, text, text) TO hub_prj03_command;
GRANT EXECUTE ON FUNCTION iam.establish_project_creator_grant(uuid, uuid, text, text, uuid) TO hub_prj03_command;
GRANT EXECUTE ON FUNCTION project.complete_create_project_receipt(uuid, uuid, text, text, uuid, integer, text, jsonb) TO hub_prj03_command;

COMMIT;
