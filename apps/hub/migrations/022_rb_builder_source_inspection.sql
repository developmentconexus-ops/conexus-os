BEGIN;

SET LOCAL ROLE builder_owner;

CREATE FUNCTION builder.admit_source_revision(
  p_account_id uuid,
  p_project_id uuid,
  p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE current_baseline record;
BEGIN
  IF p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO current_baseline
  FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
  IF FOUND AND current_baseline.source_revision = p_source_revision THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM builder.change AS stored
    WHERE stored.project_id = p_project_id
      AND (
        stored.base_source_revision = p_source_revision OR
        stored.candidate_source_revision = p_source_revision OR
        EXISTS (
          SELECT 1 FROM builder.work_unit AS unit
          WHERE unit.change_id = stored.change_id
            AND unit.result_commit = p_source_revision
        )
      )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.admit_source_revision(uuid,uuid,text) FROM PUBLIC;
RESET ROLE;

GRANT EXECUTE ON FUNCTION builder.admit_source_revision(uuid,uuid,text) TO hub_rb_ingress;

COMMIT;
