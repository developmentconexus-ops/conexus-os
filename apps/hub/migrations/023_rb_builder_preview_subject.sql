BEGIN;

SET LOCAL ROLE builder_owner;

CREATE FUNCTION builder.read_preview_subject(
  p_account_id uuid,
  p_project_id uuid,
  p_change_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE baseline record; stored builder.change%ROWTYPE;
BEGIN
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_change_id IS NULL THEN
    SELECT * INTO baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
    IF NOT FOUND OR baseline.baseline_digest !~ '^[0-9a-f]{64}$' OR baseline.source_revision !~ '^[0-9a-f]{40}$' THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'subjectKind', 'CURRENT_PROJECT', 'subjectDigest', baseline.baseline_digest,
      'sourceRevision', baseline.source_revision, 'verified', false
    );
  END IF;

  SELECT change_row.* INTO stored
  FROM builder.change AS change_row
  WHERE change_row.change_id = p_change_id AND change_row.project_id = p_project_id;
  IF NOT FOUND OR stored.candidate_source_revision IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'subjectKind', 'CHANGE_CANDIDATE', 'subjectDigest', stored.candidate_source_revision,
    'sourceRevision', stored.candidate_source_revision, 'verified', stored.state = 'VERIFIED'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.read_preview_subject(uuid, uuid, uuid) FROM PUBLIC;
RESET ROLE;

GRANT EXECUTE ON FUNCTION builder.read_preview_subject(uuid, uuid, uuid) TO hub_rb_ingress;

COMMIT;
