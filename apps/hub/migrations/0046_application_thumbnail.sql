BEGIN;

-- Application build thumbnails: captured during smoke testing of a successfully built application
-- and displayed on the projects list in place of running a live Preview for every project card.
-- The thumbnail is keyed by project_id and remembers which artifact revision it captured.

CREATE TABLE reg.application_thumbnail (
    project_id uuid NOT NULL,
    artifact_revision_id uuid NOT NULL,
    media_type text NOT NULL,
    bytes bytea NOT NULL,
    byte_length integer NOT NULL,
    sha256 text NOT NULL,
    captured_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT application_thumbnail_pkey PRIMARY KEY (project_id),
    CONSTRAINT application_thumbnail_media_type_check CHECK ((media_type = 'image/png'::text)),
    CONSTRAINT application_thumbnail_byte_length_check CHECK ((byte_length > 0 AND byte_length <= 512000)),
    CONSTRAINT application_thumbnail_sha256_check CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text))
);

ALTER TABLE reg.application_thumbnail OWNER TO registry_owner;

CREATE FUNCTION reg.retain_application_thumbnail(
    p_account_id uuid,
    p_project_id uuid,
    p_execution_id uuid,
    p_source_revision text,
    p_artifact_revision_id uuid,
    p_media_type text,
    p_bytes bytea
) RETURNS TABLE(out_project_id uuid, out_artifact_revision_id uuid, out_media_type text, out_byte_length integer, out_sha256 text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
  computed_sha256 text;
  actual_byte_length integer;
  revision_exists boolean;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_execution_id IS NULL
    OR p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$'
    OR p_artifact_revision_id IS NULL OR p_bytes IS NULL THEN
    RAISE EXCEPTION 'APPLICATION_THUMBNAIL_INPUT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  IF p_media_type IS DISTINCT FROM 'image/png' THEN
    RAISE EXCEPTION 'APPLICATION_THUMBNAIL_MEDIA_TYPE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  actual_byte_length := octet_length(p_bytes);
  IF actual_byte_length <= 0 OR actual_byte_length > 512000 THEN
    RAISE EXCEPTION 'APPLICATION_THUMBNAIL_SIZE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT COALESCE(builder.admit_verified_application_source(
    p_account_id, p_project_id, p_execution_id, p_source_revision
  ), false) THEN
    RAISE EXCEPTION 'APPLICATION_THUMBNAIL_SUBJECT_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM reg.artifact AS stored_artifact
    JOIN reg.artifact_revision AS stored_revision ON stored_revision.artifact_id = stored_artifact.artifact_id
    WHERE stored_artifact.project_id = p_project_id
      AND stored_artifact.kind = 'application'
      AND stored_revision.artifact_revision_id = p_artifact_revision_id
      AND stored_revision.source_revision = p_source_revision
      AND stored_revision.availability = 'AVAILABLE'
  ) INTO revision_exists;

  IF NOT revision_exists THEN
    RAISE EXCEPTION 'APPLICATION_THUMBNAIL_REVISION_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  computed_sha256 := encode(sha256(p_bytes), 'hex');

  INSERT INTO reg.application_thumbnail (
    project_id, artifact_revision_id, media_type, bytes, byte_length, sha256, captured_at
  ) VALUES (
    p_project_id, p_artifact_revision_id, p_media_type, p_bytes, actual_byte_length, computed_sha256, clock_timestamp()
  )
  ON CONFLICT (project_id) DO UPDATE SET
    artifact_revision_id = EXCLUDED.artifact_revision_id,
    media_type = EXCLUDED.media_type,
    bytes = EXCLUDED.bytes,
    byte_length = EXCLUDED.byte_length,
    sha256 = EXCLUDED.sha256,
    captured_at = EXCLUDED.captured_at;

  RETURN QUERY SELECT stored.project_id, stored.artifact_revision_id, stored.media_type, stored.byte_length, stored.sha256
  FROM reg.application_thumbnail AS stored
  WHERE stored.project_id = p_project_id;
END;
$_$;

ALTER FUNCTION reg.retain_application_thumbnail(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_media_type text, p_bytes bytea) OWNER TO registry_owner;
REVOKE ALL ON FUNCTION reg.retain_application_thumbnail(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_media_type text, p_bytes bytea) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.retain_application_thumbnail(p_account_id uuid, p_project_id uuid, p_execution_id uuid, p_source_revision text, p_artifact_revision_id uuid, p_media_type text, p_bytes bytea) TO hub_builder_executor;

CREATE FUNCTION reg.get_application_thumbnail(
    p_account_id uuid,
    p_project_id uuid
) RETURNS TABLE(artifact_revision_id uuid, media_type text, bytes bytea, byte_length integer, sha256 text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  served record;
  thumbnail_row reg.application_thumbnail%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL THEN RETURN; END IF;
  IF NOT iam.has_application_access(p_account_id, p_project_id) THEN RETURN; END IF;
  SELECT pointer.* INTO served FROM builder.served_preview_revision(p_project_id) AS pointer;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT stored.* INTO thumbnail_row
  FROM reg.application_thumbnail AS stored
  WHERE stored.project_id = p_project_id
    AND stored.artifact_revision_id = served.artifact_revision_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY SELECT thumbnail_row.artifact_revision_id, thumbnail_row.media_type,
    thumbnail_row.bytes, thumbnail_row.byte_length, thumbnail_row.sha256;
END;
$$;

ALTER FUNCTION reg.get_application_thumbnail(p_account_id uuid, p_project_id uuid) OWNER TO registry_owner;
REVOKE ALL ON FUNCTION reg.get_application_thumbnail(p_account_id uuid, p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION reg.get_application_thumbnail(p_account_id uuid, p_project_id uuid) TO hub_builder_executor;

COMMIT;
