BEGIN;

-- Model connections stop being Claude accounts. An Account may hold an Anthropic OAuth
-- connection as before, or an API key for any provider Mastra's model router knows. Conexus
-- adds credential custody and a per-request hand-off; model selection stays Mastra-native.
--
-- The schema is renamed. Its owner role is not: claude_connection_owner is cluster-global and
-- 041 creates it inside a DO block that swallows duplicate_object, so a rename would break
-- replay on any cluster that holds a second install. The role rename belongs to a unit that
-- can take the whole cluster with it.

-- The encrypted credential blob lives at (connection_id, current_generation) in the credential
-- backend, outside this database. Nothing below may move a live connection off its generation,
-- so the pair is recorded before the change and compared after.
CREATE TEMP TABLE model_connection_custody_before ON COMMIT DROP AS
  SELECT connection_id, current_generation FROM claude_connection.connection;

ALTER SCHEMA claude_connection RENAME TO model_connection;

SET LOCAL ROLE claude_connection_owner;

-- Existing rows are the pilot's Anthropic OAuth connection. The defaults exist only to fill
-- them and are dropped immediately, so a future INSERT has to say what it is connecting to.
ALTER TABLE model_connection.connection
  ADD COLUMN provider_id text NOT NULL DEFAULT 'anthropic',
  ADD COLUMN credential_kind text NOT NULL DEFAULT 'OAUTH_TOKEN_SET';
ALTER TABLE model_connection.connection
  ALTER COLUMN provider_id DROP DEFAULT,
  ALTER COLUMN credential_kind DROP DEFAULT,
  ADD CONSTRAINT connection_provider_id_check CHECK (provider_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  ADD CONSTRAINT connection_credential_kind_check CHECK (credential_kind IN ('OAUTH_TOKEN_SET', 'API_KEY'));

-- One selected connection per provider, not one per Account: an Account that holds an Anthropic
-- account and an OpenAI key has a current choice for each.
ALTER TABLE model_connection.preference ADD COLUMN provider_id text;
UPDATE model_connection.preference AS preference
SET provider_id = connection_row.provider_id
FROM model_connection.connection AS connection_row
WHERE connection_row.connection_id = preference.connection_id;
ALTER TABLE model_connection.preference
  ALTER COLUMN provider_id SET NOT NULL,
  DROP CONSTRAINT preference_pkey,
  ADD CONSTRAINT preference_pkey PRIMARY KEY (account_id, provider_id);

RESET ROLE;
SET LOCAL ROLE builder_owner;

ALTER TABLE builder.builder_run
  RENAME COLUMN claude_connection_id TO model_connection_id;
ALTER TABLE builder.builder_run
  RENAME COLUMN claude_credential_generation TO model_credential_generation;
ALTER TABLE builder.builder_run
  RENAME CONSTRAINT builder_run_claude_snapshot_check TO builder_run_model_snapshot_check;

RESET ROLE;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND OR working.working_source_revision <> run_row.base_source_revision OR working.working_version <> run_row.base_working_version THEN RAISE EXCEPTION 'BUILDER_RUN_BASE_STALE'; END IF;
  IF run_row.model_admission_id IS NOT NULL AND (
    run_row.model_admission_id <> p_admission_id OR run_row.model_provider_id <> p_provider_id OR run_row.model_id <> p_model_id
  ) THEN RAISE EXCEPTION 'BUILDER_MODEL_ADMISSION_CONFLICT'; END IF;
  UPDATE builder.builder_run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp(),
    model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL,
    'modelAdmissionId', run_row.model_admission_id, 'modelProviderId', run_row.model_provider_id,
    'modelId', run_row.model_id, 'modelConnectionId', run_row.model_connection_id,
    'modelCredentialGeneration', run_row.model_credential_generation,
    'cancellationRequested', false
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false),
    'modelConnectionId', run.model_connection_id,
    'modelCredentialGeneration', run.model_credential_generation
  )
  FROM builder.builder_run AS run
  JOIN iam.visible_projects(p_account_id) AS visible ON visible.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$function$
;

RESET ROLE;

SET LOCAL ROLE claude_connection_owner;

CREATE OR REPLACE FUNCTION model_connection.advance_generation(p_connection_id uuid, p_expected_generation bigint, p_next_generation bigint)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH advanced AS (
    UPDATE model_connection.connection
    SET current_generation = p_next_generation, updated_at = clock_timestamp()
    WHERE connection_id = p_connection_id AND state = 'ACTIVE'
      AND current_generation = p_expected_generation
      AND p_next_generation = p_expected_generation + 1
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM advanced);
$function$
;

CREATE OR REPLACE FUNCTION model_connection.complete_authorization(p_authorization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH completed AS (
    UPDATE model_connection.authorization
    SET status = 'COMPLETED'
    WHERE authorization_id = p_authorization_id AND status = 'EXCHANGING'
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM completed);
$function$
;

CREATE OR REPLACE FUNCTION model_connection.consume_authorization(p_account_id uuid, p_state_digest bytea)
 RETURNS TABLE(authorization_id uuid, pkce_verifier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE model_connection.authorization AS authorization_row
  SET status = 'EXCHANGING', consumed_at = clock_timestamp()
  WHERE authorization_row.account_id = p_account_id
    AND authorization_row.state_digest = p_state_digest
    AND authorization_row.status = 'PENDING'
    AND authorization_row.expires_at > clock_timestamp()
  RETURNING authorization_row.authorization_id, authorization_row.pkce_verifier;
END;
$function$
;

CREATE OR REPLACE FUNCTION model_connection.fail_authorization(p_authorization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH failed AS (
    UPDATE model_connection.authorization
    SET status = 'FAILED'
    WHERE authorization_id = p_authorization_id AND status = 'EXCHANGING'
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM failed);
$function$
;

CREATE OR REPLACE FUNCTION model_connection.read_current_generation(p_connection_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT current_generation FROM model_connection.connection
  WHERE connection_id = p_connection_id AND state = 'ACTIVE';
$function$
;

CREATE OR REPLACE FUNCTION model_connection.revoke_connection(p_account_id uuid, p_connection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE selected model_connection.connection%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM model_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR selected.owner_account_id <> p_account_id THEN RETURN false; END IF;
  IF selected.state = 'REVOKED' THEN RETURN true; END IF;
  UPDATE model_connection.connection
  SET state = 'REVOKED', revoked_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE connection_id = p_connection_id;
  DELETE FROM model_connection.preference WHERE connection_id = p_connection_id;
  DELETE FROM model_connection.workspace_share WHERE connection_id = p_connection_id;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION model_connection.share_connection(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE selected model_connection.connection%ROWTYPE;
BEGIN
  PERFORM iam.admit_workspace(p_owner_account_id, p_workspace_id, 'connection.share');
  SELECT * INTO selected FROM model_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR selected.owner_account_id <> p_owner_account_id OR selected.state <> 'ACTIVE' THEN
    RETURN false;
  END IF;
  INSERT INTO model_connection.workspace_share (connection_id, workspace_id)
  VALUES (p_connection_id, p_workspace_id)
  ON CONFLICT (connection_id, workspace_id) DO NOTHING;
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION model_connection.start_authorization(p_authorization_id uuid, p_account_id uuid, p_state_digest bytea, p_pkce_verifier text, p_expires_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF p_state_digest IS NULL OR octet_length(p_state_digest) <> 32
    OR p_pkce_verifier !~ '^[A-Za-z0-9_-]{43,128}$'
    OR p_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  INSERT INTO model_connection.authorization(
    authorization_id, account_id, state_digest, pkce_verifier, expires_at, status
  ) VALUES (p_authorization_id, p_account_id, p_state_digest, p_pkce_verifier, p_expires_at, 'PENDING');
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION model_connection.unshare_connection(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE selected model_connection.connection%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM model_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF selected.owner_account_id = p_actor_account_id THEN
    PERFORM iam.admit_workspace(p_actor_account_id, p_workspace_id, 'workspace.read');
  ELSE
    PERFORM iam.admit_workspace(p_actor_account_id, p_workspace_id, 'members.manage');
  END IF;
  DELETE FROM model_connection.workspace_share AS share
  WHERE share.connection_id = p_connection_id AND share.workspace_id = p_workspace_id;
  RETURN true;
END;
$function$
;

RESET ROLE;
SET LOCAL ROLE claude_connection_owner;

-- Publishing now says what is being connected to and in what form. The label rule, the active
-- account rule and the "owning a connection needs no Workspace" decision of 053 are unchanged.
DROP FUNCTION model_connection.publish_connection(uuid, uuid, text, bigint);

CREATE FUNCTION model_connection.publish_connection(
  p_account_id uuid, p_connection_id uuid, p_provider_id text,
  p_credential_kind text, p_label text, p_generation bigint
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_generation <= 0 OR p_label !~ '[^[:space:]]' OR length(p_label) > 120
    OR p_provider_id IS NULL OR p_provider_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_credential_kind IS NULL OR p_credential_kind NOT IN ('OAUTH_TOKEN_SET', 'API_KEY') THEN RETURN false; END IF;
  IF NOT iam.account_is_active(p_account_id) THEN RETURN false; END IF;
  INSERT INTO model_connection.connection(
    connection_id, owner_account_id, provider_id, credential_kind, label, state, current_generation)
  VALUES (p_connection_id, p_account_id, p_provider_id, p_credential_kind, btrim(p_label), 'ACTIVE', p_generation);
  RETURN true;
END;
$$;

-- The preference is per provider, so selecting an OpenAI key does not unselect the Anthropic
-- account. Which provider a selection lands on is read from the connection, never from the
-- caller, so a caller cannot park a connection under a provider that is not its own.
CREATE OR REPLACE FUNCTION model_connection.select_connection(p_account_id uuid, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE selected model_connection.connection%ROWTYPE;
BEGIN
  SELECT connection_row.* INTO selected
  FROM model_connection.connection AS connection_row
  WHERE connection_row.connection_id = p_connection_id
    AND connection_row.state = 'ACTIVE'
    AND (
      connection_row.owner_account_id = p_account_id
      OR EXISTS (
        SELECT 1
        FROM model_connection.workspace_share AS share
        JOIN iam.visible_workspaces(p_account_id) AS viewer
          ON viewer.workspace_id = share.workspace_id
        WHERE share.connection_id = connection_row.connection_id
          AND share.workspace_id IN (
            SELECT owner_visible.workspace_id
            FROM iam.visible_workspaces(connection_row.owner_account_id) AS owner_visible))
    )
  FOR UPDATE OF connection_row;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO model_connection.preference(account_id, connection_id, provider_id)
  VALUES (p_account_id, p_connection_id, selected.provider_id)
  ON CONFLICT (account_id, provider_id)
  DO UPDATE SET connection_id = EXCLUDED.connection_id, updated_at = clock_timestamp();
  RETURN true;
END;
$$;

-- The projection gains provider and kind. It has never carried the credential and still does
-- not: the blob lives in the credential backend and no function in this schema reads it.
DROP FUNCTION model_connection.list_connections(uuid);

CREATE FUNCTION model_connection.list_connections(p_account_id uuid)
RETURNS TABLE(connection_id uuid, label text, state text, current_generation bigint,
  owner_account_id uuid, workspace_id uuid, role text, revoked_at timestamptz,
  provider_id text, credential_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT visible.connection_id, visible.label, visible.state, visible.current_generation,
    visible.owner_account_id, visible.workspace_id, visible.role, visible.revoked_at,
    visible.provider_id, visible.credential_kind
  FROM (
    SELECT connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      viewer.workspace_id, 'OWNER'::text AS role, connection_row.revoked_at,
      connection_row.provider_id, connection_row.credential_kind, connection_row.created_at
    FROM model_connection.connection AS connection_row
    CROSS JOIN iam.visible_workspaces(p_account_id) AS viewer
    WHERE connection_row.owner_account_id = p_account_id
    UNION ALL
    SELECT connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      share.workspace_id, 'USER'::text AS role, connection_row.revoked_at,
      connection_row.provider_id, connection_row.credential_kind, connection_row.created_at
    FROM model_connection.connection AS connection_row
    JOIN model_connection.workspace_share AS share
      ON share.connection_id = connection_row.connection_id
    JOIN iam.visible_workspaces(p_account_id) AS viewer
      ON viewer.workspace_id = share.workspace_id
    WHERE connection_row.owner_account_id <> p_account_id
      AND share.workspace_id IN (
        SELECT owner_visible.workspace_id
        FROM iam.visible_workspaces(connection_row.owner_account_id) AS owner_visible)
  ) AS visible
  ORDER BY visible.created_at, visible.connection_id, visible.workspace_id;
$$;

-- A run asks for the credential of one provider. NULL means the caller has no model yet and
-- takes the most recently selected connection of any provider, which is what the pre-056
-- function did for every caller. The provider it landed on is returned so the caller that does
-- know its model can refuse a mismatch rather than spend the wrong account's quota.
DROP FUNCTION model_connection.admit_for_project(uuid, uuid);

CREATE FUNCTION model_connection.admit_for_project(
  p_account_id uuid, p_project_id uuid, p_provider_id text
) RETURNS TABLE(connection_id uuid, generation bigint, provider_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  admitted_workspace_id uuid;
BEGIN
  admitted_workspace_id := iam.admit_project(p_account_id, p_project_id, 'project.build');
  RETURN QUERY
  SELECT connection_row.connection_id, connection_row.current_generation, connection_row.provider_id
  FROM model_connection.preference AS preference
  JOIN model_connection.connection AS connection_row
    ON connection_row.connection_id = preference.connection_id
  WHERE preference.account_id = p_account_id
    AND connection_row.state = 'ACTIVE'
    AND (p_provider_id IS NULL OR connection_row.provider_id = p_provider_id)
    AND (
      connection_row.owner_account_id = p_account_id
      OR (
        EXISTS (
          SELECT 1 FROM model_connection.workspace_share AS share
          WHERE share.connection_id = connection_row.connection_id
            AND share.workspace_id = admitted_workspace_id)
        AND admitted_workspace_id IN (
          SELECT visible.workspace_id
          FROM iam.visible_workspaces(connection_row.owner_account_id) AS visible)
      )
    )
  ORDER BY preference.updated_at DESC
  LIMIT 1;
END;
$$;

RESET ROLE;
SET LOCAL ROLE builder_owner;

-- create_builder_run gains the provider the run will use. It is nullable because the caller
-- that has not chosen a model yet still needs a credential attached.
DROP FUNCTION builder.create_builder_run(uuid, uuid, text, text, text, text, uuid);

CREATE FUNCTION builder.create_builder_run(
  p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text,
  p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_provider_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
  selected_connection_id uuid; selected_generation bigint;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'modelConnectionId', existing.model_connection_id, 'modelCredentialGeneration', existing.model_credential_generation);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'modelConnectionId', existing.model_connection_id, 'modelCredentialGeneration', existing.model_credential_generation);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  SELECT admitted.connection_id, admitted.generation
  INTO selected_connection_id, selected_generation
  FROM model_connection.admit_for_project(p_account_id, p_project_id, p_provider_id) AS admitted;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, model_connection_id, model_credential_generation)
  VALUES (p_builder_run_id, p_project_id, p_account_id, NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_mode, working.working_source_revision, working.working_version, working.working_version, selected_connection_id, selected_generation)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'modelConnectionId', existing.model_connection_id, 'modelCredentialGeneration', existing.model_credential_generation);
END;
$$;

-- The one caller that knows the model refuses a credential belonging to a different provider.
-- Without this a run selected for an OpenAI model would spend the Anthropic account's quota.
CREATE OR REPLACE FUNCTION builder.create_builder_run_with_model(
  p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text,
  p_trigger_message_id text, p_mode text, p_builder_run_id uuid,
  p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE created jsonb; run_id uuid; run_row builder.builder_run%ROWTYPE; credential_provider_id text;
BEGIN
  IF p_admission_id IS NULL OR p_admission_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_provider_id IS NULL OR p_provider_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_model_id IS NULL OR p_model_id !~ '\S' OR p_model_id ~ 'latest|\*' THEN
    RAISE EXCEPTION 'BUILDER_MODEL_ADMISSION_REFUSED';
  END IF;
  created := builder.create_builder_run(
    p_account_id, p_project_id, p_idempotency_digest, p_request_digest,
    p_trigger_message_id, p_mode, p_builder_run_id, p_provider_id
  );
  IF created->>'modelConnectionId' IS NULL OR created->>'modelCredentialGeneration' IS NULL THEN
    RAISE EXCEPTION 'MODEL_CONNECTION_REQUIRED';
  END IF;
  run_id := (created->>'builderRunId')::uuid;
  SELECT connection_row.provider_id INTO credential_provider_id
  FROM builder.builder_run AS run
  JOIN model_connection.connection AS connection_row
    ON connection_row.connection_id = run.model_connection_id
  WHERE run.builder_run_id = run_id;
  IF credential_provider_id IS DISTINCT FROM p_provider_id THEN
    RAISE EXCEPTION 'MODEL_CONNECTION_PROVIDER_MISMATCH';
  END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = run_id FOR UPDATE;
  IF run_row.model_admission_id IS NOT NULL AND (
    run_row.model_admission_id <> p_admission_id OR run_row.model_provider_id <> p_provider_id OR run_row.model_id <> p_model_id
  ) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  UPDATE builder.builder_run
  SET model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = run_id AND model_admission_id IS NULL;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'modelConnectionId', run_row.model_connection_id,
    'modelCredentialGeneration', run_row.model_credential_generation,
    'cancellationRequested', false
  );
END;
$$;

RESET ROLE;

-- CREATE FUNCTION grants EXECUTE to PUBLIC. Every function re-created above is re-fenced here
-- and given back exactly the grants its predecessor held.
SET LOCAL ROLE claude_connection_owner;

REVOKE ALL ON FUNCTION
  model_connection.publish_connection(uuid, uuid, text, text, text, bigint),
  model_connection.select_connection(uuid, uuid),
  model_connection.list_connections(uuid),
  model_connection.admit_for_project(uuid, uuid, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  model_connection.publish_connection(uuid, uuid, text, text, text, bigint),
  model_connection.select_connection(uuid, uuid),
  model_connection.list_connections(uuid),
  model_connection.admit_for_project(uuid, uuid, text)
TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;

RESET ROLE;
SET LOCAL ROLE builder_owner;

REVOKE ALL ON FUNCTION
  builder.create_builder_run(uuid, uuid, text, text, text, text, uuid, text),
  builder.create_builder_run_with_model(uuid, uuid, text, text, text, text, uuid, text, text, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  builder.create_builder_run(uuid, uuid, text, text, text, text, uuid, text),
  builder.create_builder_run_with_model(uuid, uuid, text, text, text, text, uuid, text, text, text)
TO hub_rb_ingress;

RESET ROLE;

-- Every live connection still answers at the generation its encrypted blob was published under.
DO $$
DECLARE moved text;
BEGIN
  SELECT string_agg(before.connection_id::text || ' ' || before.current_generation::text || ' -> ' ||
    coalesce(after.current_generation::text, 'missing'), ', ')
  INTO moved
  FROM model_connection_custody_before AS before
  LEFT JOIN model_connection.connection AS after ON after.connection_id = before.connection_id
  WHERE after.connection_id IS NULL OR after.current_generation <> before.current_generation;
  IF moved IS NOT NULL THEN RAISE EXCEPTION 'MIGRATION_056_CUSTODY_MOVED:%', moved; END IF;
END $$;

COMMIT;
