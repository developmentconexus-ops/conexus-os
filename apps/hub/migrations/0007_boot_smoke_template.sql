BEGIN;

-- The merged template now carries Chromium, so the compile can answer whether the artifact boots.
-- The pin an admitted application must carry moves to that build. Only the two literals change;
-- the rest of the function is 0006's, lifted unchanged.
CREATE OR REPLACE FUNCTION reg.retain_application_execution(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb) RETURNS TABLE(artifact_revision_id uuid, artifact_digest text, project_id uuid, source_revision text, profile text, template_ref text, recipe_sha256 text, entry_path text, files jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
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
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_execution_id IS NULL OR p_source_revision IS NULL
    OR p_source_revision !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'APPLICATION_INPUT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_execution_id, p_source_revision
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
    OR p_payload->>'templateRef' IS DISTINCT FROM '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189'
    OR jsonb_typeof(p_payload->'recipeSha256') IS DISTINCT FROM 'string'
    OR p_payload->>'recipeSha256' IS DISTINCT FROM '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf'
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
$_$;

ALTER FUNCTION reg.retain_application_execution(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb) OWNER TO registry_owner;
REVOKE ALL ON FUNCTION reg.retain_application_execution(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.retain_application_execution(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_payload jsonb) TO hub_builder_executor;

COMMIT;
