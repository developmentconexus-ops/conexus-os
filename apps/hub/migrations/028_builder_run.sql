BEGIN;

SET LOCAL ROLE builder_owner;

CREATE TABLE builder.builder_run (
  builder_run_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  trigger_message_id text NOT NULL CHECK (length(btrim(trigger_message_id)) BETWEEN 1 AND 200),
  idempotency_digest text NOT NULL CHECK (idempotency_digest ~ '^[0-9a-f]{64}$'),
  mode text NOT NULL CHECK (mode IN ('BUILD', 'PLAN')),
  base_source_revision text NOT NULL CHECK (base_source_revision ~ '^[0-9a-f]{40}$'),
  expected_working_version bigint NOT NULL CHECK (expected_working_version >= 0),
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED')),
  result_source_revision text CHECK (result_source_revision IS NULL OR result_source_revision ~ '^[0-9a-f]{40}$'),
  result_kind text CHECK (result_kind IS NULL OR result_kind IN ('RESPONSE_ONLY', 'SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED')),
  sandbox_id text,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE UNIQUE INDEX builder_run_project_idempotency
  ON builder.builder_run(project_id, idempotency_digest);
CREATE UNIQUE INDEX builder_run_one_active_per_project
  ON builder.builder_run(project_id)
  WHERE state IN ('QUEUED', 'RUNNING');

CREATE FUNCTION builder.create_builder_run(
  p_account_id uuid,
  p_project_id uuid,
  p_idempotency_digest text,
  p_trigger_message_id text,
  p_mode text,
  p_expected_source_revision text,
  p_builder_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  working builder.project_working_state%ROWTYPE;
  existing builder.builder_run%ROWTYPE;
  admitted builder.builder_run%ROWTYPE;
BEGIN
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_mode NOT IN ('BUILD', 'PLAN') OR p_expected_source_revision !~ '^[0-9a-f]{40}$'
    OR p_idempotency_digest !~ '^[0-9a-f]{64}$' OR length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED';
  END IF;

  SELECT * INTO existing FROM builder.builder_run
  WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.mode <> p_mode
      OR existing.base_source_revision <> p_expected_source_revision THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'builderRunId', existing.builder_run_id, 'projectId', existing.project_id,
      'state', existing.state, 'mode', existing.mode,
      'baseSourceRevision', existing.base_source_revision,
      'resultSourceRevision', existing.result_source_revision,
      'resultKind', existing.result_kind, 'failureCode', existing.failure_code
    );
  END IF;

  SELECT * INTO working FROM builder.project_working_state
  WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND'; END IF;
  IF working.working_source_revision <> p_expected_source_revision THEN
    RAISE EXCEPTION 'SOURCE_STALE';
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN
    RAISE EXCEPTION 'PROJECT_BUSY';
  END IF;

  INSERT INTO builder.builder_run(
    builder_run_id, project_id, account_id, trigger_message_id, idempotency_digest,
    mode, base_source_revision, expected_working_version
  ) VALUES (
    p_builder_run_id, p_project_id, p_account_id, btrim(p_trigger_message_id), p_idempotency_digest,
    p_mode, p_expected_source_revision, working.working_version
  ) RETURNING * INTO admitted;
  RETURN jsonb_build_object(
    'builderRunId', admitted.builder_run_id, 'projectId', admitted.project_id,
    'state', admitted.state, 'mode', admitted.mode,
    'baseSourceRevision', admitted.base_source_revision,
    'resultSourceRevision', admitted.result_source_revision,
    'resultKind', admitted.result_kind, 'failureCode', admitted.failure_code
  );
END;
$$;

CREATE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'state', run.state, 'mode', run.mode, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code
  )
  FROM builder.builder_run AS run
  JOIN iam.admit_application_build(p_account_id, p_project_id) AS grant_row
    ON grant_row.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

REVOKE ALL ON TABLE builder.builder_run FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid), builder.read_builder_run(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.create_builder_run(uuid,uuid,text,text,text,text,uuid), builder.read_builder_run(uuid,uuid) TO hub_rb_ingress;

RESET ROLE;
COMMIT;
