BEGIN;

SET LOCAL ROLE registry_owner;

-- C-020 uses executionId as correlation. The legacy functions remain available
-- for historical Change callers, while these entry points make the canonical
-- subject explicit at the Registry boundary.
CREATE FUNCTION reg.retain_application_execution(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
  p_source_revision text,
  p_payload jsonb
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
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM reg.retain_application(
    p_account_id, p_project_id, p_execution_id, p_source_revision, p_payload
  );
$$;

CREATE FUNCTION reg.get_application_execution(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
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
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM reg.get_application(
    p_account_id, p_project_id, p_execution_id, p_source_revision
  );
$$;

CREATE FUNCTION reg.read_application_file_execution(
  p_account_id uuid,
  p_project_id uuid,
  p_execution_id uuid,
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
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT * FROM reg.read_application_file(
    p_account_id, p_project_id, p_execution_id, p_source_revision,
    p_artifact_revision_id, p_path
  );
$$;

REVOKE EXECUTE ON FUNCTION reg.retain_application_execution(uuid, uuid, uuid, text, jsonb),
  reg.get_application_execution(uuid, uuid, uuid, text),
  reg.read_application_file_execution(uuid, uuid, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reg.retain_application_execution(uuid, uuid, uuid, text, jsonb),
  reg.get_application_execution(uuid, uuid, uuid, text),
  reg.read_application_file_execution(uuid, uuid, uuid, text, uuid, text) TO hub_rb_executor;

RESET ROLE;
COMMIT;
