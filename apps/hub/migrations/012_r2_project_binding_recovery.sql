BEGIN;

SET LOCAL ROLE project_owner;

CREATE TABLE project.binding_source_intent (
  intent_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(project_id),
  account_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_revision_id uuid NOT NULL,
  environment text NOT NULL CHECK (environment IN ('SANDBOX', 'PRODUCTION')),
  expected_current jsonb NOT NULL,
  remove_binding boolean NOT NULL,
  source_revision text NOT NULL CHECK (source_revision ~ '^[0-9a-f]{40}$'),
  declaration jsonb NOT NULL,
  prepared_result jsonb,
  declaration_digest text CHECK (declaration_digest ~ '^[0-9a-f]{64}$'),
  base_tree text CHECK (base_tree ~ '^[0-9a-f]{40}$'),
  previous_declaration_blob text CHECK (previous_declaration_blob ~ '^[0-9a-f]{40}$'),
  apply_source_revision text CHECK (apply_source_revision ~ '^[0-9a-f]{40}$'),
  cancel_base_source_revision text CHECK (cancel_base_source_revision ~ '^[0-9a-f]{40}$'),
  cancel_applied_source_revision text CHECK (cancel_applied_source_revision ~ '^[0-9a-f]{40}$'),
  state text NOT NULL DEFAULT 'PREPARING'
    CHECK (state IN ('PREPARING', 'APPLYING', 'ABORTING', 'COMPLETED', 'ABORTED')),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  terminal_source_revision text CHECK (terminal_source_revision ~ '^[0-9a-f]{40}$'),
  terminal_result jsonb,
  refusal_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CONSTRAINT binding_source_intent_frozen CHECK (
    state = 'PREPARING' OR (state = 'ABORTED' AND declaration_digest IS NULL
      AND base_tree IS NULL AND previous_declaration_blob IS NULL
      AND apply_source_revision IS NULL AND cancel_base_source_revision IS NULL
      AND cancel_applied_source_revision IS NULL)
    OR (declaration_digest IS NOT NULL AND base_tree IS NOT NULL
      AND apply_source_revision IS NOT NULL AND cancel_base_source_revision IS NOT NULL
      AND cancel_applied_source_revision IS NOT NULL
      AND source_revision <> apply_source_revision
      AND source_revision <> cancel_base_source_revision
      AND source_revision <> cancel_applied_source_revision
      AND apply_source_revision <> cancel_base_source_revision
      AND apply_source_revision <> cancel_applied_source_revision
      AND cancel_base_source_revision <> cancel_applied_source_revision)
  ),
  CONSTRAINT binding_source_intent_terminal CHECK (
    (state IN ('PREPARING', 'APPLYING', 'ABORTING') AND completed_at IS NULL AND terminal_source_revision IS NULL)
    OR (state = 'COMPLETED' AND completed_at IS NOT NULL AND terminal_source_revision IS NOT NULL
      AND terminal_source_revision = apply_source_revision)
    OR (state = 'ABORTED' AND completed_at IS NOT NULL AND terminal_source_revision IS NOT NULL
      AND ((apply_source_revision IS NULL AND terminal_source_revision = source_revision)
        OR (apply_source_revision IS NOT NULL
          AND terminal_source_revision IN (cancel_base_source_revision, cancel_applied_source_revision))))
  )
);
CREATE UNIQUE INDEX binding_source_intent_one_active
  ON project.binding_source_intent(project_id)
  WHERE state IN ('PREPARING', 'APPLYING', 'ABORTING');
REVOKE ALL ON project.binding_source_intent FROM PUBLIC;

-- Same Project-row lock order for commands, recovery and Inception admission.
CREATE FUNCTION project.lock_binding_project(p_account_id uuid, p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE selection record;
BEGIN
  SELECT * INTO selection FROM iam.admit_connection_selection(p_account_id, p_project_id, 'PROJECT', p_project_id);
  IF NOT FOUND OR selection.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM project.project WHERE project_id = p_project_id AND NOT archived FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
END;
$$;

CREATE FUNCTION project.get_binding_source_intent(p_account_id uuid, p_project_id uuid, p_intent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO stored FROM project.binding_source_intent
  WHERE project_id = p_project_id AND (
    (p_intent_id IS NULL AND state IN ('PREPARING', 'APPLYING', 'ABORTING')) OR intent_id = p_intent_id
  );
  RETURN CASE WHEN FOUND THEN to_jsonb(stored) ELSE NULL END;
END;
$$;

CREATE FUNCTION project.begin_connection_binding_intent(
  p_account_id uuid, p_project_id uuid, p_connection_id uuid,
  p_connection_revision_id uuid, p_environment text, p_expected_current jsonb,
  p_remove boolean, p_intent_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE prepared record; stored project.binding_source_intent%ROWTYPE;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  IF EXISTS (SELECT 1 FROM project.binding_source_intent
    WHERE project_id = p_project_id AND state IN ('PREPARING', 'APPLYING', 'ABORTING')) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_IN_PROGRESS' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT prepared FROM project.prepare_connection_binding(
    p_account_id, p_project_id, p_connection_id, p_connection_revision_id,
    p_environment, p_expected_current, p_remove);
  INSERT INTO project.binding_source_intent (
    intent_id, project_id, account_id, workspace_id, connection_id, connection_revision_id,
    environment, expected_current, remove_binding, source_revision, declaration, prepared_result
  ) SELECT p_intent_id, p_project_id, p_account_id, candidate.workspace_id, p_connection_id,
    p_connection_revision_id, p_environment, p_expected_current, p_remove,
    prepared.source_revision, prepared.declaration, prepared.result
  FROM project.project AS candidate WHERE candidate.project_id = p_project_id
  RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.freeze_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint,
  p_digest text, p_base_tree text, p_previous_blob text,
  p_apply text, p_cancel_base text, p_cancel_applied text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'PREPARING' OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE project.binding_source_intent SET declaration_digest = p_digest,
    base_tree = p_base_tree, previous_declaration_blob = p_previous_blob,
    apply_source_revision = p_apply, cancel_base_source_revision = p_cancel_base,
    cancel_applied_source_revision = p_cancel_applied, state = 'APPLYING', version = version + 1
    WHERE intent_id = p_intent_id RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.abort_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint, p_refusal_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state NOT IN ('PREPARING', 'APPLYING') OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_refusal_code IS NULL OR (p_refusal_code NOT IN ('42501', 'P0002', 'P0412', 'P0001', '22023')
    AND NOT (stored.state = 'PREPARING' AND p_refusal_code = 'XX000')) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_REFUSAL_CODE_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF stored.state = 'PREPARING' THEN
    -- No worker can obtain ref-write authority after this exact version loses
    -- its freeze CAS. Keep the row as a fence; never delete it or prune objects.
    UPDATE project.binding_source_intent SET state = 'ABORTED', version = version + 1,
      refusal_code = p_refusal_code, terminal_source_revision = source_revision,
      completed_at = clock_timestamp() WHERE intent_id = p_intent_id RETURNING * INTO stored;
    RETURN to_jsonb(stored);
  END IF;
  UPDATE project.binding_source_intent SET state = 'ABORTING', version = version + 1,
    refusal_code = p_refusal_code WHERE intent_id = p_intent_id RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.validate_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE; prepared record;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'APPLYING' OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT prepared FROM project.prepare_connection_binding(stored.account_id, stored.project_id,
    stored.connection_id, stored.connection_revision_id, stored.environment, stored.expected_current, stored.remove_binding);
  IF prepared.source_revision IS DISTINCT FROM stored.source_revision
    OR prepared.declaration IS DISTINCT FROM stored.declaration THEN
    RAISE EXCEPTION 'PROJECT_BINDING_BASIS_STALE' USING ERRCODE = 'P0412';
  END IF;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.complete_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE; result jsonb;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'APPLYING' OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  -- The original admitted actor and declaration are immutable. This owner-only
  -- legacy primitive repeats current semantic admission and locks its owners.
  result := project.settle_connection_binding(stored.account_id, stored.project_id,
    stored.connection_id, stored.connection_revision_id, stored.environment,
    stored.expected_current, stored.remove_binding, stored.source_revision,
    stored.apply_source_revision, stored.declaration, stored.declaration_digest);
  UPDATE project.binding_source_intent SET state = 'COMPLETED', version = version + 1,
    terminal_source_revision = apply_source_revision, terminal_result = result,
    completed_at = clock_timestamp() WHERE intent_id = p_intent_id RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.complete_binding_source_abort(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint, p_source_revision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'ABORTING' OR stored.version <> p_version OR p_source_revision IS NULL
    OR p_source_revision NOT IN (stored.cancel_base_source_revision, stored.cancel_applied_source_revision) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE project.project SET source_revision = p_source_revision
    WHERE project_id = p_project_id AND source_revision = stored.source_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_BINDING_SOURCE_STALE' USING ERRCODE = 'P0412'; END IF;
  UPDATE project.binding_source_intent SET state = 'ABORTED', version = version + 1,
    terminal_source_revision = p_source_revision, completed_at = clock_timestamp()
    WHERE intent_id = p_intent_id RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

-- Protect reservation in the database even if a caller bypasses Hub preflight.
-- No mutation to the historical Inception function body or receipt semantics.
CREATE FUNCTION project.guard_inception_binding_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM project.project WHERE project_id = NEW.project_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM project.binding_source_intent WHERE project_id = NEW.project_id
    AND state IN ('PREPARING', 'APPLYING', 'ABORTING')) THEN
    RAISE EXCEPTION 'PRJ07_BINDING_SOURCE_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.source_revision IS DISTINCT FROM (
    SELECT source_revision FROM project.project WHERE project_id = NEW.project_id
  ) THEN RAISE EXCEPTION 'PRJ07_SOURCE_STALE' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inception_binding_source_guard BEFORE INSERT ON project.inception_idempotency
  FOR EACH ROW EXECUTE FUNCTION project.guard_inception_binding_source();

REVOKE EXECUTE ON FUNCTION project.lock_binding_project(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.guard_inception_binding_source() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.get_binding_source_intent(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.begin_connection_binding_intent(uuid, uuid, uuid, uuid, text, jsonb, boolean, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.freeze_binding_source_intent(uuid, uuid, uuid, bigint, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.complete_binding_source_intent(uuid, uuid, uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.validate_binding_source_intent(uuid, uuid, uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.complete_binding_source_abort(uuid, uuid, uuid, bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.settle_connection_binding(uuid, uuid, uuid, uuid, text, jsonb, boolean, text, text, jsonb, text)
  FROM hub_r2_project_binding;
GRANT EXECUTE ON FUNCTION project.get_binding_source_intent(uuid, uuid, uuid),
  project.begin_connection_binding_intent(uuid, uuid, uuid, uuid, text, jsonb, boolean, uuid),
  project.freeze_binding_source_intent(uuid, uuid, uuid, bigint, text, text, text, text, text, text),
  project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text),
  project.validate_binding_source_intent(uuid, uuid, uuid, bigint),
  project.complete_binding_source_intent(uuid, uuid, uuid, bigint),
  project.complete_binding_source_abort(uuid, uuid, uuid, bigint, text)
  TO hub_r2_project_binding;
RESET ROLE;

COMMIT;
