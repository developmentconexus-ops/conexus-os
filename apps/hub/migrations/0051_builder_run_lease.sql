BEGIN;

-- A run in flight is owned by the Hub process whose leg works it, and the owner proves it is alive
-- by a heartbeat. A run whose heartbeat went stale lost its owner (a crash, a restart, or an ending
-- whose write failed), and any Hub takes it over and settles it. A parked run has no owner: it waits
-- on the person, and `parked_at` says since when.
ALTER TABLE builder.builder_run ADD COLUMN owner_id uuid, ADD COLUMN heartbeat_at timestamp with time zone, ADD COLUMN parked_at timestamp with time zone;

-- A run parked before this migration counts its wait from now.
UPDATE builder.builder_run SET parked_at = clock_timestamp() WHERE state = 'RUNNING' AND phase = 'PARKED';

-- Replaced by the owner's heartbeat and the takeover below.
DROP FUNCTION builder.recover_builder_runs();
DROP FUNCTION builder.list_unowned_run_candidates();
DROP FUNCTION builder.list_admission_runs();

DROP FUNCTION builder.claim_builder_run(p_builder_run_id uuid);
CREATE FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_owner_id uuid) RETURNS jsonb
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
  WHERE builder_run_id = p_builder_run_id AND state = 'QUEUED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_RUN_CLAIM_REFUSED'; END IF;
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

ALTER FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_owner_id uuid) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_owner_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.claim_builder_run(p_builder_run_id uuid, p_owner_id uuid) TO hub_builder_executor;

-- The answer takes a parked run back to work under the Hub that took the answer.
DROP FUNCTION builder.resume_builder_run(p_builder_run_id uuid);
CREATE FUNCTION builder.resume_builder_run(p_builder_run_id uuid, p_owner_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE run_row builder.builder_run%ROWTYPE;
BEGIN
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.phase IS DISTINCT FROM 'PARKED' THEN RETURN NULL; END IF;
  PERFORM iam.admit_project(run_row.account_id, run_row.project_id, 'project.build');
  UPDATE builder.builder_run SET phase = 'PREPARING', sandbox_id = NULL,
    owner_id = p_owner_id, heartbeat_at = clock_timestamp(), parked_at = NULL
  WHERE builder_run_id = p_builder_run_id;
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

ALTER FUNCTION builder.resume_builder_run(p_builder_run_id uuid, p_owner_id uuid) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.resume_builder_run(p_builder_run_id uuid, p_owner_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.resume_builder_run(p_builder_run_id uuid, p_owner_id uuid) TO hub_builder_executor;

-- Parking lets go of the run's owner and starts its wait.
CREATE OR REPLACE FUNCTION builder.set_builder_run_phase(p_builder_run_id uuid, p_phase text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('PREPARING', 'AGENT', 'PARKED', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING') THEN
    RETURN false;
  END IF;
  UPDATE builder.builder_run
  SET phase = p_phase,
    owner_id = CASE WHEN p_phase = 'PARKED' THEN NULL ELSE owner_id END,
    heartbeat_at = CASE WHEN p_phase = 'PARKED' THEN NULL ELSE heartbeat_at END,
    parked_at = CASE WHEN p_phase = 'PARKED' THEN clock_timestamp() ELSE parked_at END
  WHERE builder_run_id = p_builder_run_id
    AND state = 'RUNNING'
    AND cancellation_requested_at IS NULL;
  RETURN FOUND;
END;
$$;

-- The owner's proof of life for the runs its legs are working.
CREATE FUNCTION builder.heartbeat_builder_runs(p_owner_id uuid, p_builder_run_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE touched integer;
BEGIN
  UPDATE builder.builder_run SET heartbeat_at = clock_timestamp()
  WHERE builder_run_id = ANY(p_builder_run_ids) AND owner_id = p_owner_id AND state IN ('QUEUED', 'RUNNING');
  GET DIAGNOSTICS touched = ROW_COUNT;
  RETURN touched;
END;
$$;

ALTER FUNCTION builder.heartbeat_builder_runs(p_owner_id uuid, p_builder_run_ids uuid[]) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.heartbeat_builder_runs(p_owner_id uuid, p_builder_run_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.heartbeat_builder_runs(p_owner_id uuid, p_builder_run_ids uuid[]) TO hub_builder_executor;

-- Takes over every queued or working run whose owner went quiet for longer than the limit, a run
-- never claimed counting from its creation. Rows another Hub is taking over are skipped, so two
-- sweeps never settle one run. Answers each run taken with what its settling needs.
CREATE FUNCTION builder.take_over_stale_builder_runs(p_owner_id uuid, p_stale_after_ms integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE taken jsonb;
BEGIN
  WITH stale AS (
    SELECT builder_run_id, owner_id AS previous_owner_id FROM builder.builder_run
    WHERE (state = 'QUEUED' OR (state = 'RUNNING' AND phase IS DISTINCT FROM 'PARKED'))
      AND COALESCE(heartbeat_at, created_at) < clock_timestamp() - make_interval(secs => p_stale_after_ms / 1000.0)
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE builder.builder_run AS run SET owner_id = p_owner_id, heartbeat_at = clock_timestamp()
    FROM stale WHERE run.builder_run_id = stale.builder_run_id
    RETURNING run.builder_run_id, run.project_id, run.conversation_id, run.started_at, run.candidate_revision,
      run.result_source_revision, run.created_at, stale.previous_owner_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', builder_run_id, 'projectId', project_id, 'conversationId', conversation_id,
    'started', started_at IS NOT NULL, 'candidateRevision', candidate_revision,
    'resultSourceRevision', result_source_revision, 'previousOwnerId', previous_owner_id
  ) ORDER BY created_at, builder_run_id), '[]'::jsonb) INTO taken FROM updated;
  RETURN taken;
END;
$$;

ALTER FUNCTION builder.take_over_stale_builder_runs(p_owner_id uuid, p_stale_after_ms integer) OWNER TO builder_owner;
REVOKE ALL ON FUNCTION builder.take_over_stale_builder_runs(p_owner_id uuid, p_stale_after_ms integer) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.take_over_stale_builder_runs(p_owner_id uuid, p_stale_after_ms integer) TO hub_builder_executor;

COMMIT;
