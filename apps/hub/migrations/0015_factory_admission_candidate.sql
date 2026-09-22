BEGIN;

-- A Factory run offers its result to the repository's default branch by a leased push, and GitHub
-- can apply that push while its answer is lost, or the Hub can stop between GitHub and recording
-- it. The run records the result it is about to offer first, so an unsettled run with a candidate
-- is one whose source may be on the default branch. Recovery reconciles every such run, in any
-- phase and after a stop request, and asks GitHub only when the run has not recorded the advance.
ALTER TABLE builder.builder_run
    ADD COLUMN candidate_source_revision text,
    ADD CONSTRAINT builder_run_candidate_source_revision_check CHECK ((candidate_source_revision IS NULL) OR (candidate_source_revision ~ '^[0-9a-f]{40}$'::text));

-- The phase and the candidate move together, and only while no stop is requested, so a stopped run
-- never offers its result. A retry with the same candidate converges.
CREATE FUNCTION builder.record_builder_run_candidate(p_builder_run_id uuid, p_source_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  UPDATE builder.builder_run
  SET phase = 'SOURCE_ADMISSION', candidate_source_revision = p_source_revision
  WHERE builder_run_id = p_builder_run_id
    AND state = 'RUNNING'
    AND mode = 'BUILD'
    AND cancellation_requested_at IS NULL
    AND (candidate_source_revision IS NULL OR candidate_source_revision = p_source_revision);
  RETURN FOUND;
END;
$_$;

ALTER FUNCTION builder.record_builder_run_candidate(p_builder_run_id uuid, p_source_revision text) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.record_builder_run_candidate(p_builder_run_id uuid, p_source_revision text) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.record_builder_run_candidate(p_builder_run_id uuid, p_source_revision text) TO hub_builder_executor;

-- Recording an advance that already happened answers true and changes nothing, so recovery can
-- repeat it after a restart that came between the advance and the settlement.
CREATE OR REPLACE FUNCTION builder.advance_builder_run_source(p_builder_run_id uuid, p_source_revision text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE run_row builder.builder_run%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = p_builder_run_id FOR UPDATE;
  IF NOT FOUND OR run_row.state <> 'RUNNING' OR run_row.mode <> 'BUILD' THEN RETURN false; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = run_row.project_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF run_row.result_source_revision = p_source_revision THEN
    RETURN working.working_source_revision = p_source_revision AND working.working_version = run_row.base_working_version + 1;
  END IF;
  IF working.working_source_revision <> run_row.base_source_revision
    OR working.working_version <> run_row.base_working_version THEN RETURN false; END IF;
  UPDATE builder.project_working_state
  SET working_source_revision = p_source_revision, working_version = working_version + 1,
      updated_at = clock_timestamp()
  WHERE project_id = run_row.project_id AND working_version = run_row.base_working_version;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE builder.builder_run SET result_source_revision = p_source_revision WHERE builder_run_id = p_builder_run_id;
  RETURN true;
END;
$_$;

CREATE OR REPLACE FUNCTION builder.list_factory_admission_runs() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'builderRunId', run.builder_run_id,
    'projectId', run.project_id,
    'conversationId', run.conversation_id,
    'baseSourceRevision', run.base_source_revision,
    'candidateSourceRevision', run.candidate_source_revision,
    'resultSourceRevision', run.result_source_revision,
    'binding', builder.factory_binding_document(binding)
  ) ORDER BY run.created_at, run.builder_run_id), '[]'::jsonb)
  FROM builder.builder_run AS run
  JOIN builder.factory_binding AS binding ON binding.project_id = run.project_id
  WHERE run.state = 'RUNNING' AND run.candidate_source_revision IS NOT NULL;
$$;

COMMIT;
