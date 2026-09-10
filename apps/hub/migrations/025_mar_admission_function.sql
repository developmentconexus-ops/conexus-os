BEGIN;

SET LOCAL ROLE mar_owner;

CREATE OR REPLACE FUNCTION mar.admit_job_run(
  p_job_run_id uuid,
  p_project_id text,
  p_release_id text,
  p_job_id text,
  p_logical_occurrence_key text,
  p_evidence_refs text[]
) RETURNS TABLE(
  job_run_id uuid,
  project_id text,
  release_id text,
  job_id text,
  logical_occurrence_key text,
  state text,
  admitted_at timestamptz,
  evidence_refs text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, mar, pg_temp
AS $$
BEGIN
  IF p_job_run_id IS NULL OR p_project_id IS NULL OR p_project_id !~ '\S'
    OR p_release_id IS NULL OR p_release_id !~ '\S'
    OR p_job_id IS NULL OR p_job_id !~ '\S'
    OR p_logical_occurrence_key IS NULL OR p_logical_occurrence_key !~ '\S' THEN
    RAISE EXCEPTION 'MAR_JOB_RUN_ADMISSION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_evidence_refs IS NULL OR cardinality(p_evidence_refs) < 1
    OR EXISTS (
      SELECT 1 FROM unnest(p_evidence_refs) AS evidence(reference)
      WHERE evidence.reference IS NULL OR evidence.reference !~ '\S'
    ) THEN
    RAISE EXCEPTION 'MAR_JOB_RUN_EVIDENCE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  INSERT INTO mar.job_run (
    job_run_id,
    project_id,
    release_id,
    job_id,
    logical_occurrence_key,
    evidence_refs
  ) VALUES (
    p_job_run_id,
    p_project_id,
    p_release_id,
    p_job_id,
    p_logical_occurrence_key,
    p_evidence_refs
  )
  RETURNING
    mar.job_run.job_run_id,
    mar.job_run.project_id,
    mar.job_run.release_id,
    mar.job_run.job_id,
    mar.job_run.logical_occurrence_key,
    mar.job_run.state,
    mar.job_run.admitted_at,
    mar.job_run.evidence_refs;
END;
$$;

REVOKE ALL ON FUNCTION mar.admit_job_run(uuid, text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mar.admit_job_run(uuid, text, text, text, text, text[]) TO hub_mar_runtime;

RESET ROLE;
COMMIT;
