BEGIN;

SET LOCAL ROLE iam_owner;

-- An unknown project raised before any locking clause ran, so inside BEGIN READ ONLY a known
-- project answered 25006 and an unknown one answered 42501. That difference was an existence
-- oracle. Postgres rejects a read-only transaction on the presence of row marks in the plan, not
-- on the rows a scan returns, so taking the account lock first makes both answers identical in
-- every transaction mode before the project is looked up at all.
CREATE OR REPLACE FUNCTION iam.admit_project(p_account_id uuid, p_project_id uuid, p_action iam.action)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  owning_workspace_id uuid;
BEGIN
  PERFORM 1
  FROM iam.account AS locked_account
  WHERE locked_account.account_id = p_account_id
  FOR SHARE;

  SELECT stored_project.workspace_id INTO owning_workspace_id
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id;
  IF owning_workspace_id IS NULL THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  PERFORM iam.admit_workspace(p_account_id, owning_workspace_id, p_action);
  RETURN owning_workspace_id;
END;
$$;

-- An inactive owner cannot admit anyone, so counting one as the surviving owner would leave a
-- Workspace whose membership nobody can manage.
CREATE OR REPLACE FUNCTION iam.set_workspace_member_role(
  p_actor uuid,
  p_workspace_id uuid,
  p_member uuid,
  p_role iam.workspace_role
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM iam.workspace_membership AS owner_membership
  WHERE owner_membership.workspace_id = p_workspace_id AND owner_membership.role = 'owner'
  ORDER BY owner_membership.account_id
  FOR UPDATE;

  PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'members.manage');

  IF p_role <> 'owner'
    AND EXISTS (
      SELECT 1 FROM iam.workspace_membership AS target_membership
      WHERE target_membership.workspace_id = p_workspace_id
        AND target_membership.account_id = p_member
        AND target_membership.role = 'owner')
    AND NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS other_owner
      JOIN iam.account AS other_account
        ON other_account.account_id = other_owner.account_id AND other_account.active
      WHERE other_owner.workspace_id = p_workspace_id
        AND other_owner.role = 'owner'
        AND other_owner.account_id <> p_member)
  THEN
    RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = '42501';
  END IF;

  UPDATE iam.workspace_membership AS membership
  SET role = p_role
  WHERE membership.workspace_id = p_workspace_id AND membership.account_id = p_member;
END;
$$;

CREATE OR REPLACE FUNCTION iam.remove_workspace_member(p_actor uuid, p_workspace_id uuid, p_member uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM iam.workspace_membership AS owner_membership
  WHERE owner_membership.workspace_id = p_workspace_id AND owner_membership.role = 'owner'
  ORDER BY owner_membership.account_id
  FOR UPDATE;

  IF p_actor = p_member THEN
    PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'workspace.read');
  ELSE
    PERFORM iam.admit_workspace(p_actor, p_workspace_id, 'members.manage');
  END IF;

  IF EXISTS (
      SELECT 1 FROM iam.workspace_membership AS target_membership
      WHERE target_membership.workspace_id = p_workspace_id
        AND target_membership.account_id = p_member
        AND target_membership.role = 'owner')
    AND NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS other_owner
      JOIN iam.account AS other_account
        ON other_account.account_id = other_owner.account_id AND other_account.active
      WHERE other_owner.workspace_id = p_workspace_id
        AND other_owner.role = 'owner'
        AND other_owner.account_id <> p_member)
  THEN
    RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE = '42501';
  END IF;

  DELETE FROM iam.workspace_membership AS membership
  WHERE membership.workspace_id = p_workspace_id AND membership.account_id = p_member;
END;
$$;

CREATE OR REPLACE FUNCTION iam.establish_workspace_creator_access(p_account_id uuid, p_workspace_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  INSERT INTO iam.workspace_membership (account_id, workspace_id, role)
  VALUES (p_account_id, p_workspace_id, 'owner');
$$;

CREATE OR REPLACE FUNCTION iam.claim_invitations(p_account_id uuid, p_verified_email text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  claimed_count integer;
BEGIN
  IF p_verified_email IS NULL THEN
    RETURN 0;
  END IF;
  WITH claimed AS (
    DELETE FROM iam.workspace_invitation AS invitation
    WHERE invitation.email = lower(btrim(p_verified_email))
      AND invitation.expires_at > clock_timestamp()
    RETURNING invitation.workspace_id, invitation.role
  ), admitted AS (
    INSERT INTO iam.workspace_membership (account_id, workspace_id, role)
    SELECT p_account_id, claimed.workspace_id, claimed.role FROM claimed
    ON CONFLICT (account_id, workspace_id) DO NOTHING
    RETURNING iam.workspace_membership.workspace_id
  )
  SELECT count(*) FROM claimed INTO claimed_count;
  RETURN claimed_count;
END;
$$;

RESET ROLE;

-- workspace and reg reach the admission surface for the first time here, and a LANGUAGE sql body
-- is resolved when it is created, so these have to land before the functions that use them.
GRANT USAGE ON SCHEMA iam TO workspace_owner;
GRANT EXECUTE ON FUNCTION iam.visible_workspaces(uuid),
  iam.establish_workspace_creator_access(uuid, uuid)
  TO workspace_owner;
GRANT EXECUTE ON FUNCTION iam.visible_projects(uuid) TO registry_owner;

SET LOCAL ROLE claude_connection_owner;

-- A connection is shared into a Workspace, never to a person. The owner's own use needs no row,
-- so the owner joining a new Workspace no longer leaves a stale grant behind.
CREATE TABLE claude_connection.workspace_share (
  connection_id uuid NOT NULL REFERENCES claude_connection.connection(connection_id) ON DELETE RESTRICT,
  workspace_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (connection_id, workspace_id)
);

INSERT INTO claude_connection.workspace_share (connection_id, workspace_id)
SELECT DISTINCT binding.connection_id, binding.workspace_id
FROM claude_connection.binding AS binding
WHERE binding.role = 'USER' AND binding.revoked_at IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION claude_connection.admit_for_project(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(connection_id uuid, generation bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  admitted_workspace_id uuid;
BEGIN
  admitted_workspace_id := iam.admit_project(p_account_id, p_project_id, 'project.build');
  RETURN QUERY
  SELECT connection_row.connection_id, connection_row.current_generation
  FROM claude_connection.preference AS preference
  JOIN claude_connection.connection AS connection_row
    ON connection_row.connection_id = preference.connection_id
  WHERE preference.account_id = p_account_id
    AND connection_row.state = 'ACTIVE'
    AND (
      connection_row.owner_account_id = p_account_id
      OR (
        EXISTS (
          SELECT 1 FROM claude_connection.workspace_share AS share
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

CREATE OR REPLACE FUNCTION claude_connection.list_connections(p_account_id uuid)
RETURNS TABLE(connection_id uuid, label text, state text, current_generation bigint, owner_account_id uuid, workspace_id uuid, role text, revoked_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT visible.connection_id, visible.label, visible.state, visible.current_generation,
    visible.owner_account_id, visible.workspace_id, visible.role, visible.revoked_at
  FROM (
    SELECT connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      viewer.workspace_id, 'OWNER'::text AS role, connection_row.revoked_at, connection_row.created_at
    FROM claude_connection.connection AS connection_row
    CROSS JOIN iam.visible_workspaces(p_account_id) AS viewer
    WHERE connection_row.owner_account_id = p_account_id
    UNION ALL
    SELECT connection_row.connection_id, connection_row.label, connection_row.state,
      connection_row.current_generation, connection_row.owner_account_id,
      share.workspace_id, 'USER'::text AS role, connection_row.revoked_at, connection_row.created_at
    FROM claude_connection.connection AS connection_row
    JOIN claude_connection.workspace_share AS share
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

CREATE OR REPLACE FUNCTION claude_connection.publish_connection(p_account_id uuid, p_connection_id uuid, p_label text, p_generation bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_generation <= 0 OR p_label !~ '[^[:space:]]' OR length(p_label) > 120 THEN RETURN false; END IF;
  INSERT INTO claude_connection.connection(connection_id, owner_account_id, label, state, current_generation)
  VALUES (p_connection_id, p_account_id, btrim(p_label), 'ACTIVE', p_generation);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.revoke_connection(p_account_id uuid, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM claude_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR selected.owner_account_id <> p_account_id THEN RETURN false; END IF;
  IF selected.state = 'REVOKED' THEN RETURN true; END IF;
  UPDATE claude_connection.connection
  SET state = 'REVOKED', revoked_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE connection_id = p_connection_id;
  DELETE FROM claude_connection.preference WHERE connection_id = p_connection_id;
  DELETE FROM claude_connection.workspace_share WHERE connection_id = p_connection_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION claude_connection.select_connection(p_account_id uuid, p_connection_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  SELECT connection_row.* INTO selected
  FROM claude_connection.connection AS connection_row
  WHERE connection_row.connection_id = p_connection_id
    AND connection_row.state = 'ACTIVE'
    AND (
      connection_row.owner_account_id = p_account_id
      OR EXISTS (
        SELECT 1
        FROM claude_connection.workspace_share AS share
        JOIN iam.visible_workspaces(p_account_id) AS viewer
          ON viewer.workspace_id = share.workspace_id
        WHERE share.connection_id = connection_row.connection_id
          AND share.workspace_id IN (
            SELECT owner_visible.workspace_id
            FROM iam.visible_workspaces(connection_row.owner_account_id) AS owner_visible))
    )
  FOR UPDATE OF connection_row;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO claude_connection.preference(account_id, connection_id)
  VALUES (p_account_id, p_connection_id)
  ON CONFLICT (account_id) DO UPDATE SET connection_id = EXCLUDED.connection_id, updated_at = clock_timestamp();
  RETURN true;
END;
$$;

DROP FUNCTION claude_connection.share_connection(uuid, uuid, uuid, uuid);

CREATE FUNCTION claude_connection.share_connection(p_owner_account_id uuid, p_connection_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  PERFORM iam.admit_workspace(p_owner_account_id, p_workspace_id, 'connection.share');
  SELECT * INTO selected FROM claude_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR selected.owner_account_id <> p_owner_account_id OR selected.state <> 'ACTIVE' THEN
    RETURN false;
  END IF;
  INSERT INTO claude_connection.workspace_share (connection_id, workspace_id)
  VALUES (p_connection_id, p_workspace_id)
  ON CONFLICT (connection_id, workspace_id) DO NOTHING;
  RETURN true;
END;
$$;

CREATE FUNCTION claude_connection.unshare_connection(p_actor_account_id uuid, p_connection_id uuid, p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE selected claude_connection.connection%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM claude_connection.connection
  WHERE connection_id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF selected.owner_account_id = p_actor_account_id THEN
    PERFORM iam.admit_workspace(p_actor_account_id, p_workspace_id, 'workspace.read');
  ELSE
    PERFORM iam.admit_workspace(p_actor_account_id, p_workspace_id, 'members.manage');
  END IF;
  DELETE FROM claude_connection.workspace_share AS share
  WHERE share.connection_id = p_connection_id AND share.workspace_id = p_workspace_id;
  RETURN true;
END;
$$;

SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.admit_source_revision(p_account_id uuid, p_project_id uuid, p_source_revision text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  latest_code_changing record;
BEGIN
  IF p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM builder.project_working_state AS working
    WHERE working.project_id = p_project_id
      AND (working.working_source_revision = p_source_revision
        OR working.last_preview_source_revision = p_source_revision)
  ) THEN RETURN true; END IF;
  SELECT run.base_source_revision, run.result_source_revision
  INTO latest_code_changing
  FROM builder.builder_run AS run
  WHERE run.project_id = p_project_id
    AND run.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED')
    AND run.result_source_revision IS NOT NULL
  ORDER BY run.created_at DESC, run.builder_run_id DESC
  LIMIT 1;
  IF FOUND AND (latest_code_changing.base_source_revision = p_source_revision
    OR latest_code_changing.result_source_revision = p_source_revision) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

-- A claim asks for new authority, so it re-admits under the run's own author. A run whose author
-- lost access stops here; settle_* below still records what the run already did.
CREATE OR REPLACE FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_admission_id text, p_provider_id text, p_model_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
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
    'modelId', run_row.model_id, 'claudeConnectionId', run_row.claude_connection_id,
    'claudeCredentialGeneration', run_row.claude_credential_generation,
    'cancellationRequested', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
  selected_connection_id uuid; selected_generation bigint;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  SELECT connection_id, generation INTO selected_connection_id, selected_generation FROM claude_connection.admit_for_project(p_account_id, p_project_id);
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest, request_digest, mode, base_source_revision, expected_working_version, base_working_version, claude_connection_id, claude_credential_generation)
  VALUES (p_builder_run_id, p_project_id, p_account_id, NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_mode, working.working_source_revision, working.working_version, working.working_version, selected_connection_id, selected_generation)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'claudeConnectionId', existing.claude_connection_id, 'claudeCredentialGeneration', existing.claude_credential_generation);
END;
$$;

CREATE OR REPLACE FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false)
    ) ORDER BY run.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT * FROM builder.builder_run
    WHERE account_id = p_account_id AND project_id = p_project_id
    ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) AS run;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'phase', run.phase, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'modelAdmissionId', run.model_admission_id,
    'modelProviderId', run.model_provider_id, 'modelId', run.model_id,
    'cancellationRequested', COALESCE(run.cancellation_requested_at IS NOT NULL, false),
    'claudeConnectionId', run.claude_connection_id,
    'claudeCredentialGeneration', run.claude_credential_generation
  )
  FROM builder.builder_run AS run
  JOIN iam.visible_projects(p_account_id) AS visible ON visible.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION builder.read_latest_code_changing_builder_run(p_account_id uuid, p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  latest_code_changing builder.builder_run%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN NULL; END IF;

  SELECT run.* INTO latest_code_changing
  FROM builder.builder_run AS run
  WHERE run.project_id = p_project_id
    AND run.result_kind IN ('SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED')
    AND run.result_source_revision IS NOT NULL
  ORDER BY run.created_at DESC, run.builder_run_id DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'builderRunId', latest_code_changing.builder_run_id,
    'projectId', latest_code_changing.project_id,
    'baseSourceRevision', latest_code_changing.base_source_revision,
    'resultSourceRevision', latest_code_changing.result_source_revision,
    'resultKind', latest_code_changing.result_kind
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_preview_subject(p_account_id uuid, p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  working record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN NULL; END IF;
  SELECT working_source_revision, last_preview_source_revision,
    last_preview_artifact_revision_id, last_preview_artifact_digest
  INTO working
  FROM builder.project_working_state
  WHERE project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'subjectKind', 'CURRENT_PROJECT',
    'subjectDigest', working.working_source_revision,
    'sourceRevision', working.working_source_revision,
    'verified', false,
    'previewEligible', working.last_preview_source_revision = working.working_source_revision
      AND working.last_preview_artifact_revision_id IS NOT NULL
      AND working.last_preview_artifact_digest IS NOT NULL,
    'workingSourceRevision', working.working_source_revision,
    'lastPreviewSourceRevision', working.last_preview_source_revision,
    'lastPreviewArtifactRevisionId', working.last_preview_artifact_revision_id,
    'lastPreviewArtifactDigest', working.last_preview_artifact_digest
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  SELECT * INTO run_row FROM builder.builder_run
  WHERE builder_run_id = p_builder_run_id AND project_id = p_project_id AND account_id = p_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_NOT_FOUND'; END IF;
  IF run_row.state = 'QUEUED' THEN
    UPDATE builder.builder_run SET state = 'INTERRUPTED', cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
      cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED'), finished_at = COALESCE(finished_at, clock_timestamp())
    WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  ELSIF run_row.state = 'RUNNING' THEN
    UPDATE builder.builder_run SET cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
      cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED')
    WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
  );
END;
$$;

SET LOCAL ROLE registry_owner;

CREATE OR REPLACE FUNCTION reg.get_application_by_source(p_account_id uuid, p_project_id uuid, p_source_revision text)
RETURNS TABLE(artifact_revision_id uuid, artifact_digest text, project_id uuid, source_revision text, profile text, template_ref text, recipe_sha256 text, entry_path text, files jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  artifact_row reg.artifact%ROWTYPE;
  revision_row reg.artifact_revision%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id)
    OR p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN; END IF;
  SELECT artifact.* INTO STRICT artifact_row FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, artifact_row.project_id,
    revision_row.source_revision, revision_row.payload->>'profile', revision_row.payload->>'templateRef',
    revision_row.payload->>'recipeSha256', revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object(
      'path', value->>'path', 'mediaType', value->>'mediaType',
      'byteLength', (value->>'byteLength')::integer, 'sha256', value->>'sha256'
    ) ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS values(value));
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION reg.read_application_file_by_source(p_account_id uuid, p_project_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_path text)
RETURNS TABLE(artifact_revision_id uuid, project_id uuid, source_revision text, path text, media_type text, bytes bytea, sha256 text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  artifact_row reg.artifact%ROWTYPE;
  revision_row reg.artifact_revision%ROWTYPE;
  file_row jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id)
    OR p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN; END IF;
  SELECT artifact.* INTO STRICT artifact_row FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.artifact_revision_id = p_artifact_revision_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  SELECT value INTO STRICT file_row FROM jsonb_array_elements(revision_row.payload->'files') AS values(value)
  WHERE value->>'path' = p_path;
  RETURN QUERY SELECT revision_row.artifact_revision_id, artifact_row.project_id,
    revision_row.source_revision, file_row->>'path', file_row->>'mediaType',
    decode(file_row->>'base64', 'base64'), file_row->>'sha256';
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

SET LOCAL ROLE project_owner;

DROP FUNCTION project.list_project_summaries(uuid, uuid[]);

CREATE FUNCTION project.list_project_summaries(p_account_id uuid, p_workspace_id uuid)
RETURNS TABLE(project_id uuid, workspace_id uuid, name text, archived boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_project.project_id, stored_project.workspace_id,
    stored_project.name, stored_project.archived
  FROM project.project AS stored_project
  JOIN iam.visible_projects(p_account_id) AS visible
    ON visible.project_id = stored_project.project_id
  WHERE stored_project.workspace_id = p_workspace_id
  ORDER BY stored_project.name, stored_project.project_id;
$$;

DROP FUNCTION project.get_project_representation(uuid, uuid[]);

CREATE FUNCTION project.get_project(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(project_id uuid, workspace_id uuid, name text, project_revision text, archived boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_project.project_id, stored_project.workspace_id,
    stored_project.name, stored_project.project_revision, stored_project.archived
  FROM project.project AS stored_project
  JOIN iam.visible_projects(p_account_id) AS visible
    ON visible.project_id = stored_project.project_id
  WHERE stored_project.project_id = p_project_id;
$$;

CREATE OR REPLACE FUNCTION project.reserve_or_replay_create_project(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_candidate_project_id uuid)
RETURNS TABLE(state text, project_id uuid, response_status integer, response_body jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt project.operation_idempotency%ROWTYPE;
  inserted_count integer;
BEGIN
  PERFORM iam.admit_workspace(p_account_id, p_workspace_id, 'project.create');

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

CREATE OR REPLACE FUNCTION project.lock_create_project_receipt(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid)
RETURNS TABLE(outcome text, project_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt project.operation_idempotency%ROWTYPE;
BEGIN
  PERFORM iam.admit_workspace(p_account_id, p_workspace_id, 'project.create');

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

-- The creator grant this used to join is gone. What settlement still has to prove is that the
-- Project row landed in the Workspace the receipt named, under an account still admitted to create
-- there.
CREATE OR REPLACE FUNCTION project.complete_create_project_receipt(p_account_id uuid, p_workspace_id uuid, p_key_digest text, p_request_digest text, p_project_id uuid, p_response_status integer, p_response_digest text, p_response_body jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM iam.admit_workspace(p_account_id, p_workspace_id, 'project.create');

  PERFORM 1
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id
    AND stored_project.workspace_id = p_workspace_id;
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

SET LOCAL ROLE workspace_owner;

DROP FUNCTION workspace.create_workspace(uuid, text);

-- Creating a Workspace and becoming its owner is one effect. Splitting them left the Hub holding
-- an iam call it had no business making.
CREATE FUNCTION workspace.create_workspace(p_workspace_id uuid, p_name text, p_creator_account_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO workspace.workspace (workspace_id, name) VALUES (p_workspace_id, p_name);
  PERFORM iam.establish_workspace_creator_access(p_creator_account_id, p_workspace_id);
END;
$$;

CREATE FUNCTION workspace.get_workspace_summary(p_account_id uuid, p_workspace_id uuid)
RETURNS TABLE(workspace_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_workspace.workspace_id, stored_workspace.name
  FROM workspace.workspace AS stored_workspace
  JOIN iam.visible_workspaces(p_account_id) AS visible
    ON visible.workspace_id = stored_workspace.workspace_id
  WHERE stored_workspace.workspace_id = p_workspace_id;
$$;

RESET ROLE;

-- The count of 2026-09-19 read 22 rows in each grant table against 22 Projects and one self
-- binding against one connection, and the operator said "voce roda e deleta o que precisar" that
-- day. The count was one day's reading and this migration runs on another, so it re-proves both
-- facts against the rows actually present before anything is dropped.
DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%s/%s', ungranted.account_id, ungranted.project_id), ', '
                    ORDER BY ungranted.account_id, ungranted.project_id)
  INTO offending
  FROM (
    SELECT project_grant.account_id, project_grant.project_id
    FROM iam.account_project_grant AS project_grant
    JOIN project.project AS stored_project ON stored_project.project_id = project_grant.project_id
    WHERE NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS membership
      WHERE membership.account_id = project_grant.account_id
        AND membership.workspace_id = stored_project.workspace_id)
    UNION
    SELECT builder_grant.account_id, builder_grant.project_id
    FROM iam.project_builder_grant AS builder_grant
    JOIN project.project AS stored_project ON stored_project.project_id = builder_grant.project_id
    WHERE NOT EXISTS (
      SELECT 1 FROM iam.workspace_membership AS membership
      WHERE membership.account_id = builder_grant.account_id
        AND membership.workspace_id = stored_project.workspace_id)
  ) AS ungranted;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_053_GRANT_WITHOUT_MEMBERSHIP_REFUSED: %', offending;
  END IF;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%s/%s', unshared.connection_id, unshared.workspace_id), ', '
                    ORDER BY unshared.connection_id, unshared.workspace_id)
  INTO offending
  FROM (
    SELECT binding.connection_id, binding.workspace_id
    FROM claude_connection.binding AS binding
    WHERE binding.role = 'USER' AND binding.revoked_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM claude_connection.workspace_share AS share
        WHERE share.connection_id = binding.connection_id
          AND share.workspace_id = binding.workspace_id)
  ) AS unshared;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_053_BINDING_WITHOUT_SHARE_REFUSED: %', offending;
  END IF;
END $$;

SET LOCAL ROLE project_owner;

DROP FUNCTION project.admit_brain_binding_preflight(uuid, uuid);
DROP FUNCTION project.complete_inception(uuid, uuid, text, text, uuid, text, text, text, text, text, jsonb);
DROP FUNCTION project.get_project_brain_binding(uuid, uuid);
DROP FUNCTION project.list_connection_bindings(uuid, uuid);
DROP FUNCTION project.lock_binding_project(uuid, uuid);
DROP FUNCTION project.prepare_brain_binding(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid);
DROP FUNCTION project.prepare_brain_binding_removal(uuid, uuid, jsonb);
DROP FUNCTION project.prepare_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean);
DROP FUNCTION project.reserve_or_replay_inception(uuid, uuid, text, text, uuid, text);
DROP FUNCTION project.resolve_key_conformance_subject(uuid, uuid, uuid);
DROP FUNCTION project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text);

SET LOCAL ROLE claude_connection_owner;

DROP TABLE claude_connection.binding;

SET LOCAL ROLE iam_owner;

DROP FUNCTION iam.admit_any_connection_read(uuid);
DROP FUNCTION iam.admit_application_build(uuid, uuid);
DROP FUNCTION iam.admit_brain_binding(uuid, uuid);
DROP FUNCTION iam.admit_brain_read(uuid, uuid);
DROP FUNCTION iam.admit_brain_revision_selection(uuid, uuid, uuid);
DROP FUNCTION iam.admit_connection_manage(uuid, text, uuid);
DROP FUNCTION iam.admit_connection_qualify(uuid, text, uuid);
DROP FUNCTION iam.admit_connection_read(uuid, text, uuid);
DROP FUNCTION iam.admit_connection_selection(uuid, uuid, text, uuid);
DROP FUNCTION iam.admit_project_brain_context(uuid, uuid);
DROP FUNCTION iam.admit_project_build(uuid, uuid);
DROP FUNCTION iam.admit_project_manage(uuid, uuid);
DROP FUNCTION iam.admit_project_read(uuid, uuid);
DROP FUNCTION iam.admit_project_source_read(uuid, uuid);
DROP FUNCTION iam.can_create_project(uuid, uuid);
DROP FUNCTION iam.ensure_project_builder_grant(uuid, uuid);
DROP FUNCTION iam.establish_project_creator_grant(uuid, uuid, text, text, uuid);
DROP FUNCTION iam.list_workspace_readable_project_ids(uuid, uuid);

DROP TABLE iam.account_project_grant;
DROP TABLE iam.project_builder_grant;

ALTER TABLE iam.workspace_membership
  DROP COLUMN can_create_project,
  DROP COLUMN can_read_brain,
  DROP COLUMN can_read_connection,
  DROP COLUMN can_manage_connection,
  DROP COLUMN can_qualify_connection;

RESET ROLE;

REVOKE SELECT ON iam.workspace_membership FROM claude_connection_owner;

GRANT EXECUTE ON FUNCTION project.list_project_summaries(uuid, uuid) TO hub_s3_read;
GRANT EXECUTE ON FUNCTION project.get_project(uuid, uuid) TO hub_s3_read;
GRANT EXECUTE ON FUNCTION workspace.create_workspace(uuid, text, uuid) TO hub_ws01_command;
GRANT EXECUTE ON FUNCTION workspace.get_workspace_summary(uuid, uuid) TO hub_s2_read;
GRANT EXECUTE ON FUNCTION claude_connection.share_connection(uuid, uuid, uuid),
  claude_connection.unshare_connection(uuid, uuid, uuid)
  TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;

COMMIT;
