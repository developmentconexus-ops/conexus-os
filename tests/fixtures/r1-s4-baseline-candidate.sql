CREATE EXTENSION IF NOT EXISTS pgcrypto;

SET ROLE project_owner;

CREATE FUNCTION project.inject_baseline_candidate(
  p_project_id uuid,
  p_source_revision text,
  p_source_text text,
  p_application_runtime_profile text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  canonical_candidate text;
  computed_digest text;
BEGIN
  IF p_source_revision !~ '\S' OR p_source_text !~ '\S'
    OR p_application_runtime_profile NOT IN ('MANAGED', 'DEDICATED') THEN
    RAISE EXCEPTION 'S4_FIXTURE_CANDIDATE_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM project.project WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'S4_FIXTURE_PROJECT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  canonical_candidate := '{"applicationRuntimeProfile":' || to_json(p_application_runtime_profile)::text
    || ',"sourceRevision":' || to_json(p_source_revision)::text
    || ',"sourceText":' || to_json(p_source_text)::text || '}';
  computed_digest := encode(digest(convert_to(canonical_candidate, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO project.baseline_candidate (
    project_id, candidate_digest, source_revision, source_text, application_runtime_profile
  ) VALUES (
    p_project_id, computed_digest, p_source_revision, p_source_text, p_application_runtime_profile
  ) ON CONFLICT (project_id, candidate_digest) DO NOTHING;

  INSERT INTO project.baseline_state (project_id, current_candidate_digest)
  VALUES (p_project_id, computed_digest)
  ON CONFLICT (project_id) DO UPDATE
    SET current_candidate_digest = EXCLUDED.current_candidate_digest,
        updated_at = clock_timestamp();

  RETURN computed_digest;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.inject_baseline_candidate(uuid, text, text, text) FROM PUBLIC;

RESET ROLE;
