BEGIN;

SET LOCAL ROLE project_owner;

LOCK TABLE project.binding_source_intent IN SHARE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM project.binding_source_intent
    WHERE state IN ('PREPARING', 'APPLYING', 'ABORTING')) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_REMOVAL_MIGRATION_ACTIVE_INTENT' USING ERRCODE = 'P0001';
  END IF;
END
$$;

ALTER TABLE project.binding_source_intent
  DROP CONSTRAINT binding_source_intent_operation_shape,
  ADD CONSTRAINT binding_source_intent_operation_shape CHECK (
    (operation_kind = 'CONNECTION' AND connection_id IS NOT NULL
      AND connection_revision_id IS NOT NULL AND environment IS NOT NULL
      AND brain_revision_id IS NULL AND brain_digest IS NULL)
    OR
    (operation_kind = 'BRAIN' AND connection_id IS NULL
      AND connection_revision_id IS NULL AND environment IS NULL
      AND brain_revision_id IS NOT NULL AND brain_digest IS NOT NULL)
  );

CREATE FUNCTION project.prepare_brain_binding_removal(
  p_account_id uuid,
  p_project_id uuid,
  p_expected_current jsonb
) RETURNS TABLE(
  source_revision text,
  declaration jsonb,
  result jsonb,
  old_binding_digest text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  existing project.brain_binding%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL
    OR jsonb_typeof(p_expected_current) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_expected_current)) <> 2
    OR p_expected_current->>'state' <> 'PRESENT'
    OR p_expected_current->>'projectBindingDigest' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_REMOVAL_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO stored_project FROM project.project AS candidate
    WHERE candidate.project_id = p_project_id AND NOT candidate.archived FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO existing FROM project.brain_binding AS binding
    WHERE binding.project_id = p_project_id FOR SHARE;
  IF NOT FOUND OR existing.project_binding_digest <> p_expected_current->>'projectBindingDigest' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
  END IF;
  RETURN QUERY SELECT stored_project.source_revision,
    jsonb_build_object(
      'schemaVersion', 'conexus-brain-binding-removal/v1',
      'projectId', stored_project.project_id,
      'brainRevisionId', existing.brain_revision_id,
      'brainDigest', existing.brain_digest,
      'projectBindingDigest', existing.project_binding_digest
    ), NULL::jsonb, existing.project_binding_digest;
END;
$$;

CREATE FUNCTION project.begin_brain_binding_removal_intent(
  p_account_id uuid,
  p_project_id uuid,
  p_expected_current jsonb,
  p_intent_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  prepared record;
  stored project.binding_source_intent%ROWTYPE;
BEGIN
  IF p_intent_id IS NULL THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_REMOVAL_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  IF EXISTS (SELECT 1 FROM project.binding_source_intent
    WHERE project_id = p_project_id AND state IN ('PREPARING','APPLYING','ABORTING')) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_IN_PROGRESS' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT prepared
  FROM project.prepare_brain_binding_removal(p_account_id, p_project_id, p_expected_current);
  INSERT INTO project.binding_source_intent(
    intent_id, project_id, account_id, workspace_id, operation_kind,
    brain_revision_id, brain_digest, expected_current, remove_binding,
    source_revision, declaration, prepared_result
  ) SELECT p_intent_id, p_project_id, p_account_id, candidate.workspace_id, 'BRAIN',
    (prepared.declaration->>'brainRevisionId')::uuid, prepared.declaration->>'brainDigest',
    p_expected_current, true, prepared.source_revision, prepared.declaration, NULL
  FROM project.project AS candidate WHERE candidate.project_id = p_project_id
  RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.settle_brain_binding_removal(
  p_account_id uuid,
  p_project_id uuid,
  p_expected_current jsonb,
  p_old_source_revision text,
  p_new_source_revision text,
  p_declaration jsonb,
  p_declaration_digest text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  prepared record;
BEGIN
  IF p_old_source_revision !~ '^[0-9a-f]{40}$'
    OR p_new_source_revision !~ '^[0-9a-f]{40}$'
    OR p_old_source_revision = p_new_source_revision
    OR p_declaration_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_REMOVAL_SETTLEMENT_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT prepared
  FROM project.prepare_brain_binding_removal(p_account_id, p_project_id, p_expected_current);
  IF prepared.source_revision <> p_old_source_revision
    OR prepared.declaration IS DISTINCT FROM p_declaration
    OR prepared.old_binding_digest <> p_declaration_digest THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_BASIS_STALE' USING ERRCODE = 'P0412';
  END IF;
  DELETE FROM project.brain_binding AS binding
    WHERE binding.project_id = p_project_id
      AND binding.brain_revision_id = (p_declaration->>'brainRevisionId')::uuid
      AND binding.brain_digest = p_declaration->>'brainDigest'
      AND binding.project_binding_digest = p_declaration_digest;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_MISMATCH' USING ERRCODE = 'P0412'; END IF;
  UPDATE project.project AS candidate SET source_revision = p_new_source_revision
    WHERE candidate.project_id = p_project_id AND candidate.source_revision = p_old_source_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_BINDING_SOURCE_STALE' USING ERRCODE = 'P0412'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION project.validate_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored project.binding_source_intent%ROWTYPE;
  prepared_source_revision text;
  prepared_declaration jsonb;
  prepared_old_binding_digest text;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'APPLYING' OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF stored.operation_kind = 'CONNECTION' THEN
    SELECT source_revision, declaration INTO STRICT prepared_source_revision, prepared_declaration
    FROM project.prepare_connection_binding(stored.account_id, stored.project_id,
      stored.connection_id, stored.connection_revision_id, stored.environment,
      stored.expected_current, stored.remove_binding);
  ELSIF stored.remove_binding THEN
    SELECT source_revision, declaration, old_binding_digest
    INTO STRICT prepared_source_revision, prepared_declaration, prepared_old_binding_digest
    FROM project.prepare_brain_binding_removal(stored.account_id, stored.project_id, stored.expected_current);
  ELSE
    SELECT source_revision, declaration INTO STRICT prepared_source_revision, prepared_declaration
    FROM project.prepare_brain_binding(stored.account_id, stored.project_id,
      stored.brain_revision_id, stored.brain_digest, stored.expected_current,
      stored.declaration, stored.prepared_result->>'projectBindingDigest', stored.intent_id);
  END IF;
  IF prepared_source_revision IS DISTINCT FROM stored.source_revision
    OR prepared_declaration IS DISTINCT FROM stored.declaration
    OR (stored.operation_kind = 'BRAIN' AND stored.remove_binding
      AND prepared_old_binding_digest IS DISTINCT FROM stored.declaration_digest) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_BASIS_STALE' USING ERRCODE = 'P0412';
  END IF;
  RETURN to_jsonb(stored);
END;
$$;

CREATE OR REPLACE FUNCTION project.complete_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE; settled jsonb;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'APPLYING' OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF stored.operation_kind = 'CONNECTION' THEN
    settled := project.settle_connection_binding(stored.account_id, stored.project_id,
      stored.connection_id, stored.connection_revision_id, stored.environment,
      stored.expected_current, stored.remove_binding, stored.source_revision,
      stored.apply_source_revision, stored.declaration, stored.declaration_digest);
  ELSIF stored.remove_binding THEN
    settled := project.settle_brain_binding_removal(stored.account_id, stored.project_id,
      stored.expected_current, stored.source_revision, stored.apply_source_revision,
      stored.declaration, stored.declaration_digest);
  ELSE
    IF stored.declaration_digest <> stored.prepared_result->>'projectBindingDigest' THEN
      RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_DIGEST_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    settled := project.settle_brain_binding(stored.intent_id, stored.account_id, stored.project_id,
      stored.brain_revision_id, stored.brain_digest, stored.expected_current,
      stored.source_revision, stored.apply_source_revision, stored.declaration,
      stored.declaration_digest, stored.intent_id);
  END IF;
  UPDATE project.binding_source_intent SET state = 'COMPLETED', version = version + 1,
    terminal_source_revision = apply_source_revision, terminal_result = settled,
    completed_at = clock_timestamp() WHERE intent_id = p_intent_id RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

REVOKE EXECUTE ON FUNCTION project.prepare_brain_binding_removal(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.begin_brain_binding_removal_intent(uuid, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.settle_brain_binding_removal(uuid, uuid, jsonb, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION project.begin_brain_binding_removal_intent(uuid, uuid, jsonb, uuid)
  TO hub_r2_project_binding;

RESET ROLE;

COMMIT;
