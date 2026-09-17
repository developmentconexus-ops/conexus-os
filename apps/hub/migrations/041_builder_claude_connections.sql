BEGIN;

DO $$ BEGIN
  CREATE ROLE claude_connection_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE SCHEMA IF NOT EXISTS claude_connection AUTHORIZATION claude_connection_owner;
REVOKE ALL ON SCHEMA claude_connection FROM PUBLIC;

SET LOCAL ROLE claude_connection_owner;

CREATE TABLE claude_connection.connection (
  connection_id uuid PRIMARY KEY,
  owner_account_id uuid NOT NULL,
  label text NOT NULL CHECK (label ~ '\\S' AND length(label) <= 120),
  state text NOT NULL CHECK (state IN ('ACTIVE', 'REVOKED')),
  current_generation bigint NOT NULL CHECK (current_generation > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);

CREATE TABLE claude_connection.binding (
  connection_id uuid NOT NULL REFERENCES claude_connection.connection(connection_id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'USER')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  PRIMARY KEY (connection_id, account_id, workspace_id)
);

CREATE TABLE claude_connection.preference (
  account_id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES claude_connection.connection(connection_id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE claude_connection.authorization (
  authorization_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  state_digest bytea NOT NULL UNIQUE,
  pkce_verifier text NOT NULL CHECK (length(pkce_verifier) BETWEEN 43 AND 128),
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'EXCHANGING', 'COMPLETED', 'FAILED')),
  consumed_at timestamptz
);

RESET ROLE;

GRANT USAGE ON SCHEMA iam, project TO claude_connection_owner;
GRANT SELECT ON iam.workspace_membership, project.project TO claude_connection_owner;

SET LOCAL ROLE claude_connection_owner;

CREATE OR REPLACE FUNCTION claude_connection.start_authorization(
  p_authorization_id uuid, p_account_id uuid, p_state_digest bytea,
  p_pkce_verifier text, p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_state_digest IS NULL OR octet_length(p_state_digest) <> 32
    OR p_pkce_verifier !~ '^[A-Za-z0-9_-]{43,128}$'
    OR p_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  INSERT INTO claude_connection.authorization(
    authorization_id, account_id, state_digest, pkce_verifier, expires_at, status
  ) VALUES (p_authorization_id, p_account_id, p_state_digest, p_pkce_verifier, p_expires_at, 'PENDING');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.consume_authorization(
  p_account_id uuid, p_state_digest bytea
) RETURNS TABLE(authorization_id uuid, pkce_verifier text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RETURN QUERY
  UPDATE claude_connection.authorization AS authorization_row
  SET status = 'EXCHANGING', consumed_at = clock_timestamp()
  WHERE authorization_row.account_id = p_account_id
    AND authorization_row.state_digest = p_state_digest
    AND authorization_row.status = 'PENDING'
    AND authorization_row.expires_at > clock_timestamp()
  RETURNING authorization_row.authorization_id, authorization_row.pkce_verifier;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.complete_authorization(p_authorization_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH completed AS (
    UPDATE claude_connection.authorization
    SET status = 'COMPLETED'
    WHERE authorization_id = p_authorization_id AND status = 'EXCHANGING'
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM completed);
$$;

CREATE OR REPLACE FUNCTION claude_connection.fail_authorization(p_authorization_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH failed AS (
    UPDATE claude_connection.authorization
    SET status = 'FAILED'
    WHERE authorization_id = p_authorization_id AND status = 'EXCHANGING'
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM failed);
$$;

CREATE OR REPLACE FUNCTION claude_connection.publish_connection(
  p_account_id uuid, p_connection_id uuid, p_label text, p_generation bigint
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_generation <= 0 OR p_label !~ '\\S' OR length(p_label) > 120 THEN RETURN false; END IF;
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

CREATE OR REPLACE FUNCTION claude_connection.list_connections(p_account_id uuid)
RETURNS TABLE(connection_id uuid, label text, state text, current_generation bigint,
  owner_account_id uuid, workspace_id uuid, role text, revoked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT visible.connection_id, visible.label, visible.state, visible.current_generation,
    visible.owner_account_id, visible.workspace_id, visible.role, visible.revoked_at
  FROM (
    SELECT DISTINCT ON (connection_row.connection_id, binding.workspace_id)
      connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      binding.workspace_id, binding.role, connection_row.revoked_at, connection_row.created_at
    FROM claude_connection.connection AS connection_row
    JOIN claude_connection.binding AS binding ON binding.connection_id = connection_row.connection_id
    JOIN iam.workspace_membership AS membership
      ON membership.account_id = p_account_id AND membership.workspace_id = binding.workspace_id
    WHERE binding.account_id = p_account_id AND binding.revoked_at IS NULL
    ORDER BY connection_row.connection_id, binding.workspace_id, binding.created_at DESC
  ) AS visible
  ORDER BY visible.created_at;
$$;

CREATE OR REPLACE FUNCTION claude_connection.select_connection(p_account_id uuid, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM claude_connection.connection AS connection_row
    JOIN claude_connection.binding AS binding ON binding.connection_id = connection_row.connection_id
    JOIN iam.workspace_membership AS membership
      ON membership.account_id = p_account_id AND membership.workspace_id = binding.workspace_id
    WHERE binding.account_id = p_account_id AND binding.connection_id = p_connection_id
      AND binding.revoked_at IS NULL AND connection_row.state = 'ACTIVE'
  ) THEN RETURN false; END IF;
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
BEGIN
  IF NOT EXISTS (SELECT 1 FROM claude_connection.connection WHERE connection_id = p_connection_id AND owner_account_id = p_owner_account_id AND state = 'ACTIVE')
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
BEGIN
  UPDATE claude_connection.connection
  SET state = 'REVOKED', revoked_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE connection_id = p_connection_id AND owner_account_id = p_account_id AND state = 'ACTIVE';
  DELETE FROM claude_connection.preference WHERE connection_id = p_connection_id;
  UPDATE claude_connection.binding SET revoked_at = clock_timestamp()
  WHERE connection_id = p_connection_id AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.admit_for_project(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(connection_id uuid, generation bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT connection_row.connection_id, connection_row.current_generation
  FROM claude_connection.preference AS preference
  JOIN claude_connection.connection AS connection_row ON connection_row.connection_id = preference.connection_id
  JOIN claude_connection.binding AS binding ON binding.connection_id = connection_row.connection_id
  JOIN project.project AS project_row ON project_row.workspace_id = binding.workspace_id AND project_row.project_id = p_project_id
  WHERE preference.account_id = p_account_id AND binding.account_id = p_account_id
    AND binding.revoked_at IS NULL AND connection_row.state = 'ACTIVE';
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.read_current_generation(p_connection_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT current_generation FROM claude_connection.connection
  WHERE connection_id = p_connection_id AND state = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION claude_connection.advance_generation(
  p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH advanced AS (
    UPDATE claude_connection.connection
    SET current_generation = p_next_generation, updated_at = clock_timestamp()
    WHERE connection_id = p_connection_id AND state = 'ACTIVE'
      AND current_generation = p_expected_generation
      AND p_next_generation = p_expected_generation + 1
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM advanced);
$$;

RESET ROLE;
SET LOCAL ROLE builder_owner;

ALTER TABLE builder.builder_run
  ADD COLUMN claude_connection_id uuid,
  ADD COLUMN claude_credential_generation bigint,
  ADD CONSTRAINT builder_run_claude_snapshot_check CHECK (
    (claude_connection_id IS NULL) = (claude_credential_generation IS NULL)
  );

CREATE OR REPLACE FUNCTION builder.create_builder_run(
  p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text,
  p_trigger_message_id text, p_mode text, p_builder_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
  selected_connection_id uuid; selected_generation bigint;
BEGIN
  PERFORM iam.ensure_project_builder_grant(p_account_id, p_project_id);
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  SELECT connection_id, generation INTO selected_connection_id, selected_generation FROM claude_connection.admit_for_project(p_account_id, p_project_id);
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, claude_connection_id, claude_credential_generation)
  VALUES (p_builder_run_id, p_project_id, p_account_id, NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_mode, working.working_source_revision, working.working_version, working.working_version, selected_connection_id, selected_generation)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(
  p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_application_build(run_row.account_id, run_row.project_id)) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision OR working.working_version <> run_row.base_working_version THEN RAISE EXCEPTION 'BUILDER_RUN_BASE_STALE'; END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', started_at = clock_timestamp(), model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  RETURN jsonb_build_object('builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id, 'state', 'RUNNING', 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'claudeConnectionId', run_row.claude_connection_id, 'claudeCredentialGeneration', run_row.claude_credential_generation);
END;
$$;

RESET ROLE;
SET LOCAL ROLE claude_connection_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA claude_connection FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA claude_connection FROM PUBLIC;
GRANT USAGE ON SCHEMA claude_connection TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;
GRANT EXECUTE ON FUNCTION claude_connection.start_authorization(uuid,uuid,bytea,text,timestamptz), claude_connection.consume_authorization(uuid,bytea), claude_connection.complete_authorization(uuid), claude_connection.fail_authorization(uuid), claude_connection.publish_connection(uuid,uuid,text,bigint), claude_connection.list_connections(uuid), claude_connection.select_connection(uuid,uuid), claude_connection.share_connection(uuid,uuid,uuid,uuid), claude_connection.revoke_connection(uuid,uuid), claude_connection.admit_for_project(uuid,uuid), claude_connection.read_current_generation(uuid), claude_connection.advance_generation(uuid,bigint,bigint) TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;

RESET ROLE;
SET LOCAL ROLE builder_owner;
GRANT EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid), builder.read_builder_run(uuid,uuid) TO hub_rb_ingress;

RESET ROLE;
COMMIT;
