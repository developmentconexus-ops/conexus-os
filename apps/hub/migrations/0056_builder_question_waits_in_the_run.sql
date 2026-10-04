BEGIN;

-- A question waits inside its run (spec 0011): the run keeps its owner and heartbeat while it waits
-- in phase WAITING, and an unanswered question ends the run. Development
-- data only: a run still parked ends as a restart, and the codes of the parked path become their
-- successors.
UPDATE builder.builder_run SET state = 'INTERRUPTED', phase = NULL, failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
WHERE state = 'RUNNING' AND phase = 'PARKED';
UPDATE builder.builder_run SET failure_code = 'BUILDER_QUESTION_EXPIRED' WHERE failure_code = 'BUILDER_RUN_PARKED_EXPIRED';
UPDATE builder.builder_run SET failure_code = 'INTERNAL_UNEXPECTED'
WHERE failure_code IN ('BUILDER_SUSPENSION_NOT_FOUND', 'BUILDER_PARKED_DISCARD_FAILED', 'PARKED_CALL_NOT_FOUND', 'BUILDER_ANSWER_UNAVAILABLE');

ALTER TABLE builder.builder_run DROP CONSTRAINT builder_run_phase_check;
ALTER TABLE builder.builder_run ADD CONSTRAINT builder_run_phase_check CHECK (((phase IS NULL) OR ((state = 'RUNNING'::text) AND (cancellation_requested_at IS NULL) AND (phase = ANY (ARRAY['PREPARING'::text, 'AGENT'::text, 'WAITING'::text, 'SOURCE_ADMISSION'::text, 'COMPILING'::text, 'FINALIZING'::text])))));
ALTER TABLE builder.builder_run DROP COLUMN parked_at;

DROP FUNCTION builder.resume_builder_run(p_builder_run_id uuid, p_owner_id uuid);
DROP FUNCTION builder.expire_parked_builder_runs(p_idle_ms integer);

-- The run as every function answers it.
CREATE FUNCTION builder.run_summary(run builder.builder_run) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT jsonb_build_object(
    'builderRunId', run.builder_run_id, 'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'state', run.state, 'phase', run.phase, 'baseSourceRevision', run.base_source_revision,
    'resultSourceRevision', run.result_source_revision, 'resultKind', run.result_kind,
    'failureCode', run.failure_code, 'requestText', run.request_text,
    'createdAt', to_char(run.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', run.cancellation_requested_at IS NOT NULL
  );
$$;

ALTER FUNCTION builder.run_summary(run builder.builder_run) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.run_summary(run builder.builder_run) FROM PUBLIC;

CREATE OR REPLACE FUNCTION builder.create_builder_run(p_account_id uuid, p_project_id uuid, p_conversation_id text, p_idempotency_digest text, p_request_digest text, p_request_text text, p_trigger_message_id text, p_builder_run_id uuid, p_base_source_revision text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE existing builder.builder_run%ROWTYPE;
BEGIN
  PERFORM iam.admit_project(p_account_id, p_project_id, 'project.build');
  IF p_idempotency_digest !~ '^[0-9a-f]{64}$' OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_conversation_id IS NULL OR length(btrim(p_conversation_id)) NOT BETWEEN 1 AND 200
    OR (p_request_text IS NOT NULL AND length(p_request_text) NOT BETWEEN 1 AND 20000)
    OR (p_trigger_message_id IS NOT NULL AND length(btrim(p_trigger_message_id)) NOT BETWEEN 1 AND 200)
    OR p_base_source_revision IS NULL OR p_base_source_revision !~ '^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'BUILDER_RUN_INPUT_REFUSED'; END IF;
  PERFORM 1 FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM builder.project_repository WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'BUILDER_SUBJECT_NOT_FOUND';
  END IF;
  SELECT * INTO existing FROM builder.builder_run WHERE project_id = p_project_id AND idempotency_digest = p_idempotency_digest;
  IF FOUND THEN
    IF existing.account_id <> p_account_id OR existing.request_digest <> p_request_digest OR existing.request_text IS DISTINCT FROM p_request_text OR existing.conversation_id <> btrim(p_conversation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
    RETURN builder.run_summary(existing);
  END IF;
  IF EXISTS (SELECT 1 FROM builder.builder_run WHERE project_id = p_project_id AND state IN ('QUEUED', 'RUNNING')) THEN RAISE EXCEPTION 'PROJECT_BUSY'; END IF;
  INSERT INTO builder.builder_run(builder_run_id, project_id, account_id, conversation_id, trigger_message_id, idempotency_digest, request_digest, request_text, base_source_revision)
  VALUES (p_builder_run_id, p_project_id, p_account_id, btrim(p_conversation_id), NULLIF(btrim(p_trigger_message_id), ''), p_idempotency_digest, p_request_digest, p_request_text, p_base_source_revision)
  RETURNING * INTO existing;
  RETURN builder.run_summary(existing);
END;
$_$;

CREATE OR REPLACE FUNCTION builder.read_builder_run(p_account_id uuid, p_project_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT builder.run_summary(run)
  FROM builder.builder_run AS run
  JOIN iam.visible_projects(p_account_id) AS visible ON visible.project_id = run.project_id
  WHERE run.project_id = p_project_id
  ORDER BY run.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION builder.list_builder_runs(p_account_id uuid, p_project_id uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM iam.visible_projects(p_account_id) AS visible
    WHERE visible.project_id = p_project_id
  ) THEN RETURN '[]'::jsonb; END IF;
  SELECT COALESCE(jsonb_agg(builder.run_summary(run) ORDER BY run.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT * FROM builder.builder_run
    WHERE account_id = p_account_id AND project_id = p_project_id
    ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) AS run;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_owner_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  UPDATE builder.builder_run SET state = 'RUNNING', phase = 'PREPARING', started_at = clock_timestamp(),
    owner_id = p_owner_id, heartbeat_at = clock_timestamp()
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED'
  RETURNING * INTO run_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
  RETURN builder.run_summary(run_row);
END;
$$;

-- A stop on a running run only marks the request; the run that owns it ends it, a waiting one included.
CREATE OR REPLACE FUNCTION builder.request_builder_run_cancellation(p_account_id uuid, p_project_id uuid, p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
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
  RETURN builder.run_summary(run_row);
END;
$$;

-- The run writes its phase under its owner and reads back what it wrote; a stop already requested
-- refuses the write and answers NULL.
DROP FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text);
CREATE FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('PREPARING', 'AGENT', 'WAITING', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING') THEN
    RETURN NULL;
  END IF;
  UPDATE builder.builder_run SET phase = p_phase
  WHERE builder_run_id = p_builder_run_id
    AND state = 'RUNNING'
    AND cancellation_requested_at IS NULL
  RETURNING * INTO run_row;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN builder.run_summary(run_row);
END;
$$;

ALTER FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text) TO hub_builder_executor;

-- A waiting run is a working run: a stale heartbeat takes it over like any other.
CREATE OR REPLACE FUNCTION builder.take_over_stale_builder_runs(p_owner_id uuid, p_stale_after_ms integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE taken jsonb;
BEGIN
  WITH stale AS (
    SELECT builder_run_id, owner_id AS previous_owner_id FROM builder.builder_run
    WHERE state IN ('QUEUED', 'RUNNING')
      AND COALESCE(heartbeat_at, created_at) < clock_timestamp() - make_interval(secs => p_stale_after_ms / 1000.0)
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE builder.builder_run AS run SET owner_id = p_owner_id, heartbeat_at = clock_timestamp()
    FROM stale WHERE run.builder_run_id = stale.builder_run_id
    RETURNING run.builder_run_id, run.project_id, run.conversation_id, run.candidate_revision,
      run.result_source_revision, run.created_at, stale.previous_owner_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', builder_run_id, 'projectId', project_id, 'conversationId', conversation_id,
    'candidateRevision', candidate_revision,
    'resultSourceRevision', result_source_revision, 'previousOwnerId', previous_owner_id
  ) ORDER BY created_at, builder_run_id), '[]'::jsonb) INTO taken FROM updated;
  RETURN taken;
END;
$$;

COMMIT;
