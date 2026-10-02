BEGIN;

-- A run waiting on the person's answer is parked (spec 0002, AC-16): it holds nothing in the Hub,
-- and its question or plan lives in Mastra's own storage. PARKED is a phase of a running run, so the
-- Project stays busy and every function that reads a running run keeps working. A restart leaves a
-- parked run alone, and the answer resumes it.
ALTER TABLE builder.builder_run DROP CONSTRAINT builder_run_phase_check;
ALTER TABLE builder.builder_run ADD CONSTRAINT builder_run_phase_check CHECK (((phase IS NULL) OR ((state = 'RUNNING'::text) AND (cancellation_requested_at IS NULL) AND (phase = ANY (ARRAY['PREPARING'::text, 'AGENT'::text, 'PARKED'::text, 'SOURCE_ADMISSION'::text, 'COMPILING'::text, 'FINALIZING'::text])))));

CREATE OR REPLACE FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('PREPARING', 'AGENT', 'PARKED', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING') THEN
    RETURN false;
  END IF;
  UPDATE builder.builder_run
  SET phase = p_phase
  WHERE builder_run_id = p_builder_run_id
    AND state = 'RUNNING'
    AND cancellation_requested_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.recover_builder_runs() RETURNS SETOF uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE builder.builder_run SET state = 'INTERRUPTED', failure_code = 'HUB_RESTART', finished_at = clock_timestamp()
  WHERE state = 'QUEUED' OR (state = 'RUNNING' AND candidate_revision IS NULL AND phase IS DISTINCT FROM 'PARKED');
  RETURN QUERY SELECT builder_run_id FROM builder.builder_run WHERE state = 'QUEUED' ORDER BY created_at;
END;
$$;

-- The answer takes a parked run back to work. One answer wins: the run is parked once, so a second
-- answer finds it already working and gets nothing back. The run's sandbox binding is cleared, since
-- the VM the run parked on may be gone by the time it is answered, and the answering leg binds its own.
CREATE FUNCTION builder.resume_builder_run(p_builder_run_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.phase IS DISTINCT FROM 'PARKED' THEN RETURN NULL; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  UPDATE builder.builder_run SET phase = 'PREPARING', sandbox_id = NULL WHERE builder_run_id = p_builder_run_id;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'conversationId', run_row.conversation_id,
    'state', run_row.state, 'phase', run_row.phase,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', NULL, 'resultKind', NULL, 'failureCode', NULL,
    'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', false
  );
END;
$$;

ALTER FUNCTION builder.resume_builder_run(p_builder_run_id uuid) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.resume_builder_run(p_builder_run_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.resume_builder_run(p_builder_run_id uuid) TO hub_builder_executor;

-- A stop on a parked run has no worker to tell, so the run is interrupted here, as a queued one is.
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
  IF run_row.state = 'QUEUED' OR (run_row.state = 'RUNNING' AND run_row.phase = 'PARKED') THEN
    UPDATE builder.builder_run SET state = 'INTERRUPTED', cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
      cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED'), finished_at = COALESCE(finished_at, clock_timestamp())
    WHERE builder_run_id = p_builder_run_id AND state IN ('QUEUED', 'RUNNING');
  ELSIF run_row.state = 'RUNNING' THEN
    UPDATE builder.builder_run SET cancellation_requested_at = COALESCE(cancellation_requested_at, clock_timestamp()),
      cancellation_reason = COALESCE(cancellation_reason, 'USER_CANCELLED')
    WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'conversationId', run_row.conversation_id,
    'state', run_row.state, 'phase', run_row.phase, 'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'requestText', run_row.request_text,
    'createdAt', to_char(run_row.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'cancellationRequested', run_row.cancellation_requested_at IS NOT NULL
  );
END;
$$;

COMMIT;
