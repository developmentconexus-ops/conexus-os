BEGIN;

-- A Factory-backed Project's current source is its repository's default branch, which people, CI
-- and bots also write. The Hub reads that branch's head before it creates a run and passes it here;
-- under the working state lock the Project adopts it as its working revision, and the run bases on
-- it. The last good Preview is left alone: only a run's successful build moves it. A replayed
-- request returns its run before anything is adopted, and an unchanged head changes nothing.
-- A parameter cannot be added in place, so the function is dropped and recreated with the same
-- owner and grant. The new parameter defaults to NULL, which a Project with no binding requires.
DROP FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid);

CREATE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_source_head text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE working builder.project_working_state%ROWTYPE; existing builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_conversation_id IS NULL OR length(btrim(p_conversation_id)) NOT BETWEEN 1 AND 200
    OR (p_request_text IS NOT NULL AND length(p_request_text) NOT BETWEEN 1 AND 20000)
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200)
    OR (p_source_head IS NOT NULL AND p_source_head !~ '^[0-9a-f]{40}$') THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', existing.cancellation_requested_at IS NOT NULL);
  END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', existing.result_source_revision, 'resultKind', existing.result_kind, 'failureCode', existing.failure_code, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', existing.cancellation_requested_at IS NOT NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  IF EXISTS (SELECT 1 FROM builder.factory_binding WHERE project_id = p_project_id) THEN
    IF p_source_head IS NULL THEN RAISE EXCEPTION 'BUILDER_SOURCE_HEAD_REQUIRED'; END IF;
    IF p_source_head <> working.working_source_revision THEN
      UPDATE builder.project_working_state
      SET working_source_revision = p_source_head, working_version = working_version + 1, updated_at = clock_timestamp()
      WHERE project_id = p_project_id
      RETURNING * INTO working;
    END IF;
  ELSIF p_source_head IS NOT NULL THEN
    RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED';
  END IF;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, request_text, mode, base_source_revision, expected_working_version, base_working_version)
  VALUES (p_builder_run_id, p_project_id, p_account_id, btrim(p_conversation_id), NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_request_text, p_mode, working.working_source_revision, working.working_version, working.working_version)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('builderRunId', existing.builder_run_id, 'projectId', existing.project_id, 'conversationId', existing.conversation_id, 'state', existing.state, 'phase', existing.phase, 'mode', existing.mode, 'baseSourceRevision', existing.base_source_revision, 'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL, 'requestText', existing.request_text, 'createdAt', to_char(existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'cancellationRequested', false);
END;
$_$;

ALTER FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_source_head text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_source_head text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_mode text, p_builder_run_id uuid, p_source_head text) TO hub_builder_ingress;

COMMIT;
