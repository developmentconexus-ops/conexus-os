BEGIN;

DO $$ BEGIN
  CREATE ROLE workspace_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_ws01_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_s2_read LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS workspace AUTHORIZATION workspace_owner;
REVOKE ALL ON SCHEMA workspace FROM PUBLIC;
REVOKE ALL ON SCHEMA iam FROM PUBLIC;
GRANT USAGE ON SCHEMA workspace, iam TO hub_ws01_command, hub_s2_read;

SET LOCAL ROLE workspace_owner;

CREATE TABLE IF NOT EXISTS workspace.workspace (
  workspace_id uuid PRIMARY KEY,
  name text NOT NULL CHECK (name ~ '\S'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS workspace.operation_idempotency (
  operation_id text NOT NULL CHECK (operation_id = 'WS-01'),
  account_id uuid NOT NULL,
  key_digest text NOT NULL CHECK (key_digest ~ '^[a-f0-9]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  reserved_workspace_id uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('RESERVED', 'SUCCEEDED')),
  response_status integer,
  response_digest text CHECK (response_digest ~ '^[a-f0-9]{64}$'),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (operation_id, account_id, key_digest),
  CHECK (
    (outcome = 'RESERVED' AND response_status IS NULL AND response_digest IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (outcome = 'SUCCEEDED' AND response_status IS NOT NULL AND response_digest IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION workspace.reserve_or_replay_create_workspace(
  p_account_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_candidate_workspace_id uuid
) RETURNS TABLE(state text, workspace_id uuid, response_status integer, response_body jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt workspace.operation_idempotency%ROWTYPE;
BEGIN
  INSERT INTO workspace.operation_idempotency (
    operation_id, account_id, key_digest, request_digest, reserved_workspace_id, outcome
  ) VALUES (
    'WS-01', p_account_id, p_key_digest, p_request_digest, p_candidate_workspace_id, 'RESERVED'
  ) ON CONFLICT (operation_id, account_id, key_digest) DO NOTHING;

  SELECT * INTO STRICT receipt
  FROM workspace.operation_idempotency AS operation_receipt
  WHERE operation_receipt.operation_id = 'WS-01'
    AND operation_receipt.account_id = p_account_id
    AND operation_receipt.key_digest = p_key_digest
  FOR UPDATE;

  IF receipt.request_digest <> p_request_digest THEN
    RETURN QUERY SELECT 'CONFLICT'::text, receipt.reserved_workspace_id, NULL::integer, NULL::jsonb;
  ELSIF receipt.outcome = 'SUCCEEDED' THEN
    RETURN QUERY SELECT 'REPLAY'::text, receipt.reserved_workspace_id, receipt.response_status, receipt.response_body;
  ELSE
    RETURN QUERY SELECT 'RESERVED'::text, receipt.reserved_workspace_id, NULL::integer, NULL::jsonb;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION workspace.create_workspace(p_workspace_id uuid, p_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO workspace.workspace (workspace_id, name) VALUES (p_workspace_id, p_name);
$$;

CREATE OR REPLACE FUNCTION workspace.complete_create_workspace_receipt(
  p_account_id uuid,
  p_key_digest text,
  p_response_status integer,
  p_response_digest text,
  p_response_body jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE workspace.operation_idempotency
  SET outcome = 'SUCCEEDED', response_status = p_response_status,
      response_digest = p_response_digest, response_body = p_response_body,
      completed_at = clock_timestamp()
  WHERE operation_id = 'WS-01' AND account_id = p_account_id
    AND key_digest = p_key_digest AND outcome = 'RESERVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WS01_RECEIPT_NOT_RESERVED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION workspace.list_workspace_summaries(p_workspace_ids uuid[])
RETURNS TABLE(workspace_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_workspace.workspace_id, stored_workspace.name
  FROM workspace.workspace AS stored_workspace
  WHERE stored_workspace.workspace_id = ANY(p_workspace_ids);
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA workspace FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION workspace.reserve_or_replay_create_workspace(uuid, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION workspace.create_workspace(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION workspace.complete_create_workspace_receipt(uuid, text, integer, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION workspace.list_workspace_summaries(uuid[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA workspace TO iam_owner;
GRANT REFERENCES ON workspace.workspace TO iam_owner;

RESET ROLE;
SET LOCAL ROLE iam_owner;

CREATE TABLE IF NOT EXISTS iam.workspace_membership (
  account_id uuid NOT NULL REFERENCES iam.account(account_id),
  workspace_id uuid NOT NULL REFERENCES workspace.workspace(workspace_id) ON DELETE RESTRICT,
  can_create_project boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, workspace_id)
);

CREATE OR REPLACE FUNCTION iam.establish_workspace_creator_access(p_account_id uuid, p_workspace_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO iam.workspace_membership (account_id, workspace_id, can_create_project)
  VALUES (p_account_id, p_workspace_id, true);
$$;

CREATE OR REPLACE FUNCTION iam.list_workspace_memberships(p_account_id uuid)
RETURNS TABLE(workspace_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT membership.workspace_id
  FROM iam.workspace_membership AS membership
  WHERE membership.account_id = p_account_id;
$$;

REVOKE ALL ON iam.workspace_membership FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.establish_workspace_creator_access(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.list_workspace_memberships(uuid) FROM PUBLIC;

RESET ROLE;

GRANT EXECUTE ON FUNCTION workspace.reserve_or_replay_create_workspace(uuid, text, text, uuid) TO hub_ws01_command;
GRANT EXECUTE ON FUNCTION workspace.create_workspace(uuid, text) TO hub_ws01_command;
GRANT EXECUTE ON FUNCTION iam.establish_workspace_creator_access(uuid, uuid) TO hub_ws01_command;
GRANT EXECUTE ON FUNCTION workspace.complete_create_workspace_receipt(uuid, text, integer, text, jsonb) TO hub_ws01_command;

GRANT EXECUTE ON FUNCTION iam.list_workspace_memberships(uuid) TO hub_s2_read;
GRANT EXECUTE ON FUNCTION workspace.list_workspace_summaries(uuid[]) TO hub_s2_read;

REVOKE ALL ON ALL TABLES IN SCHEMA workspace FROM hub_ws01_command, hub_s2_read;
REVOKE ALL ON iam.workspace_membership FROM hub_ws01_command, hub_s2_read;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_ws01_command, hub_s2_read', current_database());
END $$;

COMMIT;
