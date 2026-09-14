BEGIN;

SET LOCAL ROLE builder_owner;

-- C-020's current subject is the durable working source. The legacy Change
-- projection remains available when an old caller supplies a Change ID.
CREATE OR REPLACE FUNCTION builder.read_preview_subject(
  p_account_id uuid,
  p_project_id uuid,
  p_change_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  working builder.project_working_state%ROWTYPE;
  legacy jsonb;
BEGIN
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF p_change_id IS NULL THEN
    SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'subjectKind', 'CURRENT_PROJECT',
        'subjectDigest', working.working_source_revision,
        'sourceRevision', working.working_source_revision,
        'verified', false,
        'previewEligible', working.last_preview_source_revision = working.working_source_revision
          AND working.last_preview_artifact_revision_id IS NOT NULL
          AND working.last_preview_artifact_digest IS NOT NULL,
        'workingSourceRevision', working.working_source_revision,
        'activeChangeId', CASE WHEN working.current_state IN ('CODING', 'PREPARING') THEN working.current_change_id ELSE NULL END,
        'lastPreviewChangeId', working.last_preview_change_id,
        'lastPreviewSourceRevision', working.last_preview_source_revision,
        'lastPreviewArtifactRevisionId', working.last_preview_artifact_revision_id,
        'lastPreviewArtifactDigest', working.last_preview_artifact_digest
      );
    END IF;
  END IF;

  SELECT builder.read_preview_subject_legacy(p_account_id, p_project_id, p_change_id) INTO legacy;
  IF legacy IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id;
  RETURN legacy || jsonb_build_object(
    'lastPreviewSourceRevision', working.last_preview_source_revision,
    'lastPreviewArtifactRevisionId', working.last_preview_artifact_revision_id,
    'lastPreviewArtifactDigest', working.last_preview_artifact_digest
  );
END;
$$;

GRANT EXECUTE ON FUNCTION iam.admit_application_build(uuid, uuid) TO registry_owner;
RESET ROLE;

SET LOCAL ROLE registry_owner;

CREATE FUNCTION reg.get_application_by_source(
  p_account_id uuid,
  p_project_id uuid,
  p_source_revision text
) RETURNS TABLE(
  artifact_revision_id uuid,
  artifact_digest text,
  project_id uuid,
  source_revision text,
  profile text,
  template_ref text,
  recipe_sha256 text,
  entry_path text,
  files jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  artifact_row reg.artifact%ROWTYPE;
  revision_row reg.artifact_revision%ROWTYPE;
BEGIN
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false)
    OR p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN; END IF;
  SELECT artifact.* INTO STRICT artifact_row FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, artifact_row.project_id,
    revision_row.source_revision, revision_row.payload->>'profile', revision_row.payload->>'templateRef',
    revision_row.payload->>'recipeSha256', revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object(
      'path', value->>'path', 'mediaType', value->>'mediaType',
      'byteLength', (value->>'byteLength')::integer, 'sha256', value->>'sha256'
    ) ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS values(value));
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

CREATE FUNCTION reg.read_application_file_by_source(
  p_account_id uuid,
  p_project_id uuid,
  p_source_revision text,
  p_artifact_revision_id uuid,
  p_path text
) RETURNS TABLE(
  artifact_revision_id uuid,
  project_id uuid,
  source_revision text,
  path text,
  media_type text,
  bytes bytea,
  sha256 text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  artifact_row reg.artifact%ROWTYPE;
  revision_row reg.artifact_revision%ROWTYPE;
  file_row jsonb;
BEGIN
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false)
    OR p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN; END IF;
  SELECT artifact.* INTO STRICT artifact_row FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.artifact_revision_id = p_artifact_revision_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  SELECT value INTO STRICT file_row FROM jsonb_array_elements(revision_row.payload->'files') AS values(value)
  WHERE value->>'path' = p_path;
  RETURN QUERY SELECT revision_row.artifact_revision_id, artifact_row.project_id,
    revision_row.source_revision, file_row->>'path', file_row->>'mediaType',
    decode(file_row->>'base64', 'base64'), file_row->>'sha256';
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.read_preview_subject(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.read_preview_subject(uuid, uuid, uuid) TO hub_rb_ingress;
REVOKE EXECUTE ON FUNCTION reg.get_application_by_source(uuid, uuid, text),
  reg.read_application_file_by_source(uuid, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reg.get_application_by_source(uuid, uuid, text),
  reg.read_application_file_by_source(uuid, uuid, text, uuid, text) TO hub_rb_executor;

RESET ROLE;
COMMIT;
