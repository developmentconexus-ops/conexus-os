BEGIN;

SET LOCAL ROLE project_owner;

-- Do not enable the source/DB concordance reader while a recovery intent is
-- active.  The table lock fences writers while this admission check runs and
-- leaves every existing intent row byte-for-byte unchanged on refusal.
LOCK TABLE project.binding_source_intent IN SHARE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM project.binding_source_intent
    WHERE state IN ('PREPARING', 'APPLYING', 'ABORTING')
  ) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_BASIS_MIGRATION_ACTIVE_INTENT'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION project.get_binding_source_basis(
  p_account_id uuid,
  p_project_id uuid,
  p_intent_id uuid,
  p_version bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored project.binding_source_intent%ROWTYPE;
  connection_declaration jsonb;
  brain_binding_digest text;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);

  SELECT * INTO stored
  FROM project.binding_source_intent
  WHERE project_id = p_project_id
    AND intent_id = p_intent_id
  FOR UPDATE;

  IF NOT FOUND OR p_version IS NULL OR stored.state <> 'PREPARING'
    OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
    'bindings', COALESCE(jsonb_agg(entry ORDER BY connection_id), '[]'::jsonb)
  )
  INTO connection_declaration
  FROM (
    SELECT binding.connection_id,
      jsonb_build_object(
        'connectionId', binding.connection_id,
        'connectionRevisionId', binding.connection_revision_id,
        'qualificationId', binding.qualification_id,
        'environment', binding.environment
      ) AS entry
    FROM project.connection_binding AS binding
    WHERE binding.project_id = p_project_id
  ) AS entries;

  SELECT binding.project_binding_digest
    INTO brain_binding_digest
  FROM project.brain_binding AS binding
  WHERE binding.project_id = p_project_id;

  RETURN jsonb_build_object(
    'connectionDeclaration', connection_declaration,
    'brainBindingDigest', brain_binding_digest
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION project.get_binding_source_basis(uuid, uuid, uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION project.get_binding_source_basis(uuid, uuid, uuid, bigint)
  TO hub_r2_project_binding;

RESET ROLE;

COMMIT;
