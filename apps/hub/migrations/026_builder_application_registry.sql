BEGIN;

SET LOCAL ROLE iam_owner;

CREATE FUNCTION iam.admit_application_build(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(project_id uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT grant_row.project_id
  FROM iam.account AS account_row
  JOIN iam.project_builder_grant AS grant_row
    ON grant_row.account_id = account_row.account_id
  JOIN project.project AS stored_project
    ON stored_project.project_id = grant_row.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = grant_row.account_id
    AND membership.workspace_id = stored_project.workspace_id
  WHERE account_row.account_id = p_account_id
    AND account_row.active
    AND grant_row.account_id = p_account_id
    AND grant_row.project_id = p_project_id
    AND grant_row.can_build
  FOR SHARE OF account_row, grant_row, membership;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_application_build(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.admit_application_build(uuid, uuid) TO builder_owner;

RESET ROLE;
SET LOCAL ROLE project_owner;

CREATE FUNCTION project.lock_application_baseline(
  p_project_id uuid
) RETURNS TABLE(baseline_digest text, source_revision text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  state_row project.baseline_state%ROWTYPE;
  candidate_row project.baseline_candidate%ROWTYPE;
BEGIN
  SELECT * INTO state_row
  FROM project.baseline_state AS stored_state
  WHERE stored_state.project_id = p_project_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF state_row.approved_candidate_digest IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO candidate_row
  FROM project.baseline_candidate AS candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.candidate_digest = state_row.approved_candidate_digest
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT candidate_row.candidate_digest, candidate_row.source_revision;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.lock_application_baseline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION project.lock_application_baseline(uuid) TO builder_owner;

RESET ROLE;
SET LOCAL ROLE builder_owner;

CREATE FUNCTION builder.admit_verified_application_source(
  p_account_id uuid,
  p_project_id uuid,
  p_change_id uuid,
  p_source_revision text
) RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  baseline_row record;
  change_row builder.change%ROWTYPE;
  plan_row builder.plan%ROWTYPE;
  contract_row builder.contract_revision%ROWTYPE;
  acceptance_row builder.change_acceptance%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_change_id IS NULL OR p_source_revision IS NULL
    OR p_source_revision !~ '^[0-9a-f]{40}$' THEN
    RETURN false;
  END IF;

  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false) THEN
    RETURN false;
  END IF;

  SELECT * INTO baseline_row
  FROM project.lock_application_baseline(p_project_id);
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO change_row
  FROM builder.change AS stored_change
  WHERE stored_change.change_id = p_change_id
    AND stored_change.project_id = p_project_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO plan_row
  FROM builder.plan AS stored_plan
  WHERE stored_plan.change_id = p_change_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO contract_row
  FROM builder.contract_revision AS stored_contract
  WHERE stored_contract.change_id = p_change_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO acceptance_row
  FROM builder.change_acceptance AS stored_acceptance
  WHERE stored_acceptance.change_id = p_change_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN change_row.state = 'VERIFIED'
    AND change_row.candidate_source_revision = p_source_revision
    AND change_row.baseline_digest = baseline_row.baseline_digest
    AND change_row.base_source_revision = baseline_row.source_revision
    AND acceptance_row.candidate_source_revision = p_source_revision
    AND acceptance_row.baseline_digest = change_row.baseline_digest
    AND acceptance_row.plan_revision = plan_row.plan_revision
    AND acceptance_row.contract_revision = contract_row.contract_revision
    AND plan_row.assertion_ref = contract_row.assertion_ref;
END;
$$;

REVOKE EXECUTE ON FUNCTION builder.admit_verified_application_source(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION builder.admit_verified_application_source(uuid, uuid, uuid, text) TO registry_owner;
GRANT USAGE ON SCHEMA builder TO registry_owner;

RESET ROLE;
SET LOCAL ROLE project_owner;
GRANT USAGE ON SCHEMA project TO registry_owner;
GRANT REFERENCES ON project.project TO registry_owner;
RESET ROLE;
SET LOCAL ROLE registry_owner;

ALTER TABLE reg.artifact
  ALTER COLUMN workspace_id DROP NOT NULL,
  ADD COLUMN project_id uuid;

ALTER TABLE reg.artifact
  DROP CONSTRAINT artifact_kind_check,
  ADD CONSTRAINT artifact_kind_check CHECK (kind IN ('brain', 'application')),
  ADD CONSTRAINT artifact_kind_ownership_check CHECK (
    (kind = 'brain' AND workspace_id IS NOT NULL AND project_id IS NULL)
    OR (kind = 'application' AND workspace_id IS NULL AND project_id IS NOT NULL AND published_revision_id IS NULL)
  ),
  ADD CONSTRAINT artifact_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES project.project(project_id) ON DELETE RESTRICT;

ALTER TABLE reg.artifact ADD CONSTRAINT artifact_project_id_kind_key UNIQUE (project_id, kind);

CREATE FUNCTION reg.retain_application(
  p_account_id uuid,
  p_project_id uuid,
  p_change_id uuid,
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  artifact_row reg.artifact%ROWTYPE;
  revision_row reg.artifact_revision%ROWTYPE;
  item jsonb;
  computed_digest text;
  expected_media_type text;
  decoded_bytes bytea;
  previous_path text;
  total_bytes bigint := 0;
  item_count integer;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_change_id IS NULL OR p_source_revision IS NULL
    OR p_source_revision !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'APPLICATION_INPUT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_change_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_payload)) <> 8
    OR NOT (p_payload ? 'format') OR NOT (p_payload ? 'profile')
    OR NOT (p_payload ? 'projectId') OR NOT (p_payload ? 'sourceRevision')
    OR NOT (p_payload ? 'templateRef') OR NOT (p_payload ? 'recipeSha256')
    OR NOT (p_payload ? 'entryPath') OR NOT (p_payload ? 'files') THEN
    RAISE EXCEPTION 'APPLICATION_PAYLOAD_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_payload->'format') IS DISTINCT FROM 'string'
    OR p_payload->>'format' IS DISTINCT FROM 'application-payload-v1'
    OR jsonb_typeof(p_payload->'profile') IS DISTINCT FROM 'string'
    OR p_payload->>'profile' IS DISTINCT FROM 'REACT_VITE_V1'
    OR jsonb_typeof(p_payload->'projectId') IS DISTINCT FROM 'string'
    OR p_payload->>'projectId' IS DISTINCT FROM p_project_id::text
    OR jsonb_typeof(p_payload->'sourceRevision') IS DISTINCT FROM 'string'
    OR p_payload->>'sourceRevision' IS DISTINCT FROM p_source_revision
    OR jsonb_typeof(p_payload->'templateRef') IS DISTINCT FROM 'string'
    OR p_payload->>'templateRef' IS DISTINCT FROM 'xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6'
    OR jsonb_typeof(p_payload->'recipeSha256') IS DISTINCT FROM 'string'
    OR p_payload->>'recipeSha256' IS DISTINCT FROM '32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97'
    OR jsonb_typeof(p_payload->'entryPath') IS DISTINCT FROM 'string'
    OR p_payload->>'entryPath' IS DISTINCT FROM 'index.html'
    OR jsonb_typeof(p_payload->'files') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'APPLICATION_PAYLOAD_PIN_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  item_count := jsonb_array_length(p_payload->'files');
  IF item_count < 1 OR item_count > 256 THEN
    RAISE EXCEPTION 'APPLICATION_FILE_COUNT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'files') WITH ORDINALITY AS elements(value, position)
  LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 5
      OR NOT (item ? 'path') OR NOT (item ? 'mediaType') OR NOT (item ? 'byteLength')
      OR NOT (item ? 'sha256') OR NOT (item ? 'base64')
      OR jsonb_typeof(item->'path') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'mediaType') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'byteLength') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item->'sha256') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'base64') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'APPLICATION_FILE_SHAPE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF length(item->>'path') < 1 OR length(item->>'path') > 1024
      OR item->>'path' !~ '^[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*$'
      OR (item->>'path') COLLATE "C" <= (COALESCE(previous_path, '')) COLLATE "C" THEN
      RAISE EXCEPTION 'APPLICATION_FILE_PATH_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    previous_path := item->>'path';
    IF item->>'path' = 'index.html' AND item->>'mediaType' <> 'text/html; charset=utf-8' THEN
      RAISE EXCEPTION 'APPLICATION_ENTRYPOINT_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    expected_media_type := CASE lower(regexp_replace(item->>'path', '^.*(\.[^./]*)$', '\1'))
      WHEN '.avif' THEN 'image/avif'
      WHEN '.cjs' THEN 'text/javascript; charset=utf-8'
      WHEN '.css' THEN 'text/css; charset=utf-8'
      WHEN '.gif' THEN 'image/gif'
      WHEN '.html' THEN 'text/html; charset=utf-8'
      WHEN '.ico' THEN 'image/x-icon'
      WHEN '.jpeg' THEN 'image/jpeg'
      WHEN '.jpg' THEN 'image/jpeg'
      WHEN '.js' THEN 'text/javascript; charset=utf-8'
      WHEN '.json' THEN 'application/json; charset=utf-8'
      WHEN '.mjs' THEN 'text/javascript; charset=utf-8'
      WHEN '.otf' THEN 'font/otf'
      WHEN '.png' THEN 'image/png'
      WHEN '.svg' THEN 'image/svg+xml'
      WHEN '.txt' THEN 'text/plain; charset=utf-8'
      WHEN '.wasm' THEN 'application/wasm'
      WHEN '.webp' THEN 'image/webp'
      WHEN '.woff' THEN 'font/woff'
      WHEN '.woff2' THEN 'font/woff2'
      ELSE NULL
    END;
    IF expected_media_type IS NULL OR item->>'mediaType' IS DISTINCT FROM expected_media_type THEN
      RAISE EXCEPTION 'APPLICATION_MEDIA_TYPE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF item->>'byteLength' !~ '^[0-9]+$' OR length(item->>'byteLength') > 8
      OR (item->>'byteLength')::bigint > 12582912 THEN
      RAISE EXCEPTION 'APPLICATION_FILE_SIZE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF item->>'sha256' !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'APPLICATION_FILE_HASH_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    IF length(item->>'base64') > 16777216
      OR length(item->>'base64') <> ((((item->>'byteLength')::bigint + 2) / 3) * 4)::integer THEN
      RAISE EXCEPTION 'APPLICATION_FILE_ENCODING_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    decoded_bytes := decode(item->>'base64', 'base64');
    IF item->>'base64' <> regexp_replace(encode(decoded_bytes, 'base64'), E'[\r\n]', '', 'g')
      OR octet_length(decoded_bytes) <> (item->>'byteLength')::bigint
      OR encode(sha256(decoded_bytes), 'hex') IS DISTINCT FROM item->>'sha256' THEN
      RAISE EXCEPTION 'APPLICATION_FILE_ENCODING_REFUSED' USING ERRCODE = 'P0001';
    END IF;
    total_bytes := total_bytes + octet_length(decoded_bytes);
    IF total_bytes > 12582912 THEN
      RAISE EXCEPTION 'APPLICATION_TOTAL_SIZE_REFUSED' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF previous_path IS DISTINCT FROM (SELECT value->>'path' FROM jsonb_array_elements(p_payload->'files') AS values(value)
    ORDER BY value->>'path' COLLATE "C" DESC LIMIT 1)
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'files') AS values(value) WHERE value->>'path' = 'index.html') THEN
    RAISE EXCEPTION 'APPLICATION_FILE_ORDER_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT value->>'path') FROM jsonb_array_elements(p_payload->'files') AS values(value)) <> item_count THEN
    RAISE EXCEPTION 'APPLICATION_FILE_DUPLICATE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  computed_digest := encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
  INSERT INTO reg.artifact(artifact_id, workspace_id, project_id, kind, semantic_name)
  VALUES (gen_random_uuid(), NULL, p_project_id, 'application', 'Project Application')
  ON CONFLICT ON CONSTRAINT artifact_project_id_kind_key DO NOTHING;

  SELECT * INTO STRICT artifact_row
  FROM reg.artifact AS stored_artifact
  WHERE stored_artifact.project_id = p_project_id
    AND stored_artifact.kind = 'application'
  FOR UPDATE;

  INSERT INTO reg.artifact_revision(
    artifact_revision_id, artifact_id, source_revision, digest, payload, availability
  ) VALUES (
    gen_random_uuid(), artifact_row.artifact_id, p_source_revision, computed_digest, p_payload, 'AVAILABLE'
  ) ON CONFLICT ON CONSTRAINT artifact_revision_artifact_id_source_revision_key DO NOTHING;

  SELECT * INTO STRICT revision_row
  FROM reg.artifact_revision AS stored_revision
  WHERE stored_revision.artifact_id = artifact_row.artifact_id
    AND stored_revision.source_revision = p_source_revision
  FOR SHARE;

  IF revision_row.digest IS DISTINCT FROM computed_digest OR revision_row.payload IS DISTINCT FROM p_payload
    OR revision_row.availability IS DISTINCT FROM 'AVAILABLE' THEN
    RAISE EXCEPTION 'APPLICATION_IDENTITY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT revision_row.artifact_revision_id, revision_row.digest, artifact_row.project_id,
    revision_row.source_revision, revision_row.payload->>'profile', revision_row.payload->>'templateRef',
    revision_row.payload->>'recipeSha256', revision_row.payload->>'entryPath',
    (SELECT jsonb_agg(jsonb_build_object(
      'path', value->>'path', 'mediaType', value->>'mediaType',
      'byteLength', (value->>'byteLength')::integer, 'sha256', value->>'sha256'
    ) ORDER BY value->>'path' COLLATE "C") FROM jsonb_array_elements(revision_row.payload->'files') AS values(value));
END;
$$;

CREATE FUNCTION reg.get_application(
  p_account_id uuid,
  p_project_id uuid,
  p_change_id uuid,
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  revision_row reg.artifact_revision%ROWTYPE;
  artifact_row reg.artifact%ROWTYPE;
BEGIN
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_change_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT artifact.* INTO STRICT artifact_row
  FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row
  FROM reg.artifact_revision AS revision
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

CREATE FUNCTION reg.read_application_file(
  p_account_id uuid,
  p_project_id uuid,
  p_change_id uuid,
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
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  revision_row reg.artifact_revision%ROWTYPE;
  artifact_row reg.artifact%ROWTYPE;
  file_row jsonb;
BEGIN
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_change_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT artifact.* INTO STRICT artifact_row
  FROM reg.artifact AS artifact
  WHERE artifact.project_id = p_project_id AND artifact.kind = 'application';
  SELECT revision.* INTO STRICT revision_row
  FROM reg.artifact_revision AS revision
  WHERE revision.artifact_id = artifact_row.artifact_id
    AND revision.artifact_revision_id = p_artifact_revision_id
    AND revision.source_revision = p_source_revision
    AND revision.availability = 'AVAILABLE';
  SELECT value INTO STRICT file_row
  FROM jsonb_array_elements(revision_row.payload->'files') AS values(value)
  WHERE value->>'path' = p_path;
  RETURN QUERY SELECT revision_row.artifact_revision_id, artifact_row.project_id,
    revision_row.source_revision, file_row->>'path', file_row->>'mediaType',
    decode(file_row->>'base64', 'base64'), file_row->>'sha256';
EXCEPTION WHEN no_data_found THEN
  RETURN;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA reg FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.retain_application(uuid, uuid, uuid, text, jsonb),
  reg.get_application(uuid, uuid, uuid, text),
  reg.read_application_file(uuid, uuid, uuid, text, uuid, text) FROM PUBLIC;

RESET ROLE;
GRANT USAGE ON SCHEMA reg TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION reg.retain_application(uuid, uuid, uuid, text, jsonb),
  reg.get_application(uuid, uuid, uuid, text),
  reg.read_application_file(uuid, uuid, uuid, text, uuid, text) TO hub_rb_executor;

COMMIT;
