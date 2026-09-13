BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.change
  ADD COLUMN baseline_source_revision text,
  ADD COLUMN source_change_id uuid REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  ADD COLUMN result_kind text NOT NULL DEFAULT 'CANDIDATE'
    CHECK (result_kind IN ('CANDIDATE', 'RESPONSE_ONLY')),
  ADD COLUMN response_text text;

UPDATE builder.change
SET baseline_source_revision = base_source_revision
WHERE baseline_source_revision IS NULL;

ALTER TABLE builder.change
  ALTER COLUMN baseline_source_revision SET NOT NULL,
  ADD CONSTRAINT change_baseline_source_revision_check
    CHECK (baseline_source_revision ~ '^[0-9a-f]{40}$');

ALTER TABLE builder.change DROP CONSTRAINT change_state_check;
ALTER TABLE builder.change ADD CONSTRAINT change_state_check CHECK (state IN (
  'QUEUED', 'RUNNING', 'RESULT_READY', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED', 'RESPONDED',
  'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'
));

ALTER TABLE builder.change DROP CONSTRAINT change_check;
ALTER TABLE builder.change ADD CONSTRAINT change_check CHECK (
  (candidate_source_revision IS NULL) = (patch IS NULL) AND
  (
    (result_kind = 'CANDIDATE' AND response_text IS NULL AND state <> 'RESPONDED') OR
    (result_kind = 'RESPONSE_ONLY' AND state = 'RESPONDED' AND candidate_source_revision IS NULL
      AND patch IS NULL AND response_text IS NOT NULL AND response_text ~ '\S')
  ) AND
  (state NOT IN ('RESULT_READY', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED', 'VERIFYING',
    'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED') OR candidate_source_revision IS NOT NULL) AND
  (candidate_source_revision IS NULL OR state IN (
    'RUNNING', 'RESULT_READY', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED', 'VERIFYING',
    'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'
  ))
);

CREATE TABLE builder.project_working_state (
  project_id uuid PRIMARY KEY REFERENCES project.project(project_id) ON DELETE RESTRICT,
  working_source_revision text NOT NULL CHECK (working_source_revision ~ '^[0-9a-f]{40}$'),
  working_change_id uuid REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  working_account_id uuid,
  working_version bigint NOT NULL DEFAULT 0 CHECK (working_version >= 0),
  current_change_id uuid REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  current_account_id uuid,
  current_state text NOT NULL DEFAULT 'IDLE' CHECK (current_state IN (
    'IDLE', 'CODING', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED', 'RESPONDED'
  )),
  preparation_attempt_id uuid,
  last_preview_change_id uuid REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  last_preview_source_revision text CHECK (
    last_preview_source_revision IS NULL OR last_preview_source_revision ~ '^[0-9a-f]{40}$'
  ),
  last_preview_artifact_revision_id uuid,
  last_preview_artifact_digest text CHECK (
    last_preview_artifact_digest IS NULL OR last_preview_artifact_digest ~ '^[0-9a-f]{64}$'
  ),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((working_change_id IS NULL) = (working_account_id IS NULL)),
  CHECK ((current_change_id IS NULL) = (current_account_id IS NULL)),
  CHECK ((current_state = 'IDLE') = (current_change_id IS NULL AND current_account_id IS NULL)),
  CHECK ((current_state <> 'IDLE') = (current_change_id IS NOT NULL AND current_account_id IS NOT NULL)),
  CHECK ((current_state IN ('PREPARING', 'PREVIEW_READY', 'BUILD_FAILED')) = (preparation_attempt_id IS NOT NULL)),
  CHECK ((last_preview_change_id IS NULL) = (last_preview_source_revision IS NULL
    AND last_preview_artifact_revision_id IS NULL AND last_preview_artifact_digest IS NULL)),
  CHECK ((last_preview_change_id IS NOT NULL) = (last_preview_source_revision IS NOT NULL
    AND last_preview_artifact_revision_id IS NOT NULL AND last_preview_artifact_digest IS NOT NULL))
);

INSERT INTO builder.project_working_state(project_id, working_source_revision)
SELECT stored_project.project_id, baseline.source_revision
FROM project.project AS stored_project
JOIN project.baseline_state AS baseline_state
  ON baseline_state.project_id = stored_project.project_id
JOIN project.baseline_candidate AS baseline
  ON baseline.project_id = baseline_state.project_id
  AND baseline.candidate_digest = baseline_state.approved_candidate_digest
ON CONFLICT (project_id) DO NOTHING;

CREATE OR REPLACE FUNCTION builder.change_json(row_value builder.change) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'changeId', row_value.change_id, 'projectId', row_value.project_id,
    'intent', row_value.intent, 'baselineDigest', row_value.baseline_digest,
    'baselineSourceRevision', row_value.baseline_source_revision,
    'baseSourceRevision', row_value.base_source_revision,
    'sourceChangeId', row_value.source_change_id,
    'planningDepth', row_value.planning_depth, 'rigorProfile', row_value.rigor_profile,
    'state', row_value.state, 'resultKind', row_value.result_kind,
    'summary', COALESCE(row_value.response_text, row_value.result_summary)
  );
$$;

DROP FUNCTION builder.create_change(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,text);
CREATE FUNCTION builder.create_change(
  p_account_id uuid, p_project_id uuid, p_key_digest text, p_request_digest text,
  p_change_id uuid, p_plan_revision uuid, p_item_id uuid,
  p_coding_session_id uuid, p_work_unit_id uuid, p_intent text,
  p_expected_source_revision text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  receipt builder.operation_receipt%ROWTYPE;
  baseline record;
  working builder.project_working_state%ROWTYPE;
  stored builder.change%ROWTYPE;
BEGIN
  IF p_intent !~ '\S' OR length(p_intent) > 20000
    OR p_request_digest !~ '^[0-9a-f]{64}$'
    OR p_expected_source_revision IS NULL
    OR p_expected_source_revision !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'BLD03_INTENT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM iam.ensure_project_builder_grant(p_account_id, p_project_id);
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'BLD03_NOT_AUTHORIZED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
  IF NOT FOUND OR baseline.source_revision !~ '^[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'BLD03_BASELINE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO builder.operation_receipt(account_id, project_id, key_digest, request_digest, change_id)
  VALUES (p_account_id, p_project_id, p_key_digest, p_request_digest, p_change_id)
  ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT receipt FROM builder.operation_receipt
  WHERE account_id = p_account_id AND project_id = p_project_id AND key_digest = p_key_digest FOR UPDATE;
  IF receipt.request_digest <> p_request_digest THEN
    RAISE EXCEPTION 'BLD03_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = receipt.change_id;
  IF FOUND THEN RETURN builder.change_json(stored); END IF;
  IF receipt.change_id <> p_change_id THEN
    RAISE EXCEPTION 'BLD03_OUTCOME_UNKNOWN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO builder.project_working_state(project_id, working_source_revision)
  VALUES (p_project_id, baseline.source_revision)
  ON CONFLICT (project_id) DO NOTHING;
  SELECT * INTO STRICT working FROM builder.project_working_state
  WHERE project_id = p_project_id FOR UPDATE;
  IF working.working_source_revision <> p_expected_source_revision THEN
    RAISE EXCEPTION 'BLD03_WORKING_SOURCE_STALE' USING ERRCODE = 'P0001';
  END IF;
  IF working.current_state IN ('CODING', 'PREPARING') THEN
    RAISE EXCEPTION 'BLD03_PROJECT_BUSY' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO builder.change(
    change_id, project_id, created_by_account_id, intent, baseline_digest,
    baseline_source_revision, base_source_revision, source_change_id,
    planning_depth, rigor_profile, state, candidate_source_revision, patch, result_summary,
    result_kind, response_text, created_at, updated_at
  ) VALUES (
    p_change_id, p_project_id, p_account_id, p_intent, baseline.baseline_digest,
    baseline.source_revision, working.working_source_revision, working.working_change_id,
    'DIRECT', 'CONTROLLED', 'QUEUED', NULL, NULL, NULL,
    'CANDIDATE', NULL, clock_timestamp(), clock_timestamp()
  ) RETURNING * INTO stored;
  INSERT INTO builder.contract_revision(
    contract_revision, change_id, intent_digest, assertion_ref, required_proof_kind
  ) VALUES (
    p_plan_revision, p_change_id, p_request_digest, 'change-intent:' || p_request_digest,
    'INDEPENDENT_COGNITIVE'
  );
  INSERT INTO builder.plan(change_id, plan_revision, item_id, summary, item_state, assertion_ref)
  VALUES (p_change_id, p_plan_revision, p_item_id, p_intent, 'READY', 'change-intent:' || p_request_digest);
  INSERT INTO builder.coding_session VALUES (p_coding_session_id, p_change_id);
  INSERT INTO builder.work_unit VALUES (p_work_unit_id, p_change_id, 'READY', NULL, 1);
  UPDATE builder.project_working_state
  SET current_change_id = p_change_id, current_account_id = p_account_id,
    current_state = 'CODING', preparation_attempt_id = NULL, updated_at = clock_timestamp()
  WHERE project_id = p_project_id;
  RETURN builder.change_json(stored);
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_change(
  p_change_id uuid, p_actor_run_id uuid, p_admission_token uuid,
  p_model_admission_id text, p_model_provider_id text, p_model_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  stored builder.change%ROWTYPE;
  baseline record;
  unit builder.work_unit%ROWTYPE;
  working builder.project_working_state%ROWTYPE;
  recent jsonb;
BEGIN
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id FOR UPDATE;
  IF stored.state <> 'QUEUED' THEN
    RAISE EXCEPTION 'BUILDER_CHANGE_NOT_QUEUED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id);
  IF NOT FOUND THEN
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.project_working_state SET current_change_id = NULL, current_account_id = NULL,
      current_state = 'IDLE', updated_at = clock_timestamp()
    WHERE project_id = stored.project_id AND current_change_id = p_change_id AND current_state = 'CODING';
    RETURN jsonb_build_object('refusedCode', 'BUILDER_AUTHORITY_REVOKED');
  END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  IF NOT FOUND OR baseline.baseline_digest <> stored.baseline_digest
    OR baseline.source_revision <> stored.baseline_source_revision THEN
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.project_working_state SET current_change_id = NULL, current_account_id = NULL,
      current_state = 'IDLE', updated_at = clock_timestamp()
    WHERE project_id = stored.project_id AND current_change_id = p_change_id AND current_state = 'CODING';
    RETURN jsonb_build_object('refusedCode', 'BUILDER_BASELINE_STALE');
  END IF;
  SELECT * INTO STRICT working FROM builder.project_working_state
  WHERE project_id = stored.project_id FOR SHARE;
  IF working.current_change_id IS DISTINCT FROM stored.change_id
    OR working.current_state IS DISTINCT FROM 'CODING'
    OR working.working_source_revision IS DISTINCT FROM stored.base_source_revision THEN
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.project_working_state SET current_change_id = NULL, current_account_id = NULL,
      current_state = 'IDLE', updated_at = clock_timestamp()
    WHERE project_id = stored.project_id AND current_change_id = p_change_id AND current_state = 'CODING';
    RETURN jsonb_build_object('refusedCode', 'BUILDER_WORKING_SOURCE_STALE');
  END IF;
  SELECT jsonb_agg(turn ORDER BY created_at) INTO recent
  FROM (
    SELECT stored_turn.created_at,
      jsonb_build_object(
        'intent', left(stored_turn.intent, 2000),
        'summary', left(COALESCE(stored_turn.response_text, stored_turn.result_summary, ''), 4000)
      ) AS turn
    FROM builder.change AS stored_turn
    WHERE stored_turn.project_id = stored.project_id
      AND stored_turn.change_id <> stored.change_id
      AND stored_turn.state IN ('RESPONDED', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED',
        'RESULT_READY', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED')
      AND left(COALESCE(stored_turn.response_text, stored_turn.result_summary, ''), 4000) ~ '\S'
    ORDER BY stored_turn.created_at DESC
    LIMIT 8
  ) AS bounded_turns;
  SELECT * INTO STRICT unit FROM builder.work_unit WHERE change_id = p_change_id ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE;
  INSERT INTO builder.actor_run(
    actor_run_id, change_id, work_unit_id, admission_token, lineage_disposition,
    runtime_id, model_admission_id, model_provider_id, model_id, base_source_revision,
    sandbox_id, state, purpose
  ) VALUES (
    p_actor_run_id, p_change_id, unit.work_unit_id, p_admission_token, 'FRESH_BASE',
    'mastra-native-e2b-v1', p_model_admission_id, p_model_provider_id, p_model_id,
    stored.base_source_revision, NULL, 'ADMITTED', 'CODING'
  );
  UPDATE builder.change SET state = 'RUNNING', updated_at = clock_timestamp() WHERE change_id = p_change_id;
  UPDATE builder.plan SET item_state = 'RUNNING' WHERE change_id = p_change_id;
  UPDATE builder.work_unit SET state = 'RUNNING' WHERE work_unit_id = unit.work_unit_id;
  RETURN jsonb_build_object(
    'accountId', stored.created_by_account_id, 'projectId', stored.project_id,
    'changeId', stored.change_id, 'workUnitId', unit.work_unit_id,
    'actorRunId', p_actor_run_id, 'admissionToken', p_admission_token, 'intent', stored.intent,
    'baselineSourceRevision', stored.baseline_source_revision,
    'baseSourceRevision', stored.base_source_revision,
    'sourceChangeId', stored.source_change_id, 'recentTurns', COALESCE(recent, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.settle_result(
  p_actor_run_id uuid, p_admission_token uuid, p_sandbox_id text,
  p_base_source_revision text, p_candidate_source_revision text, p_patch text, p_summary text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  run_row builder.actor_run%ROWTYPE;
  stored builder.change%ROWTYPE;
  working builder.project_working_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT run_row FROM builder.actor_run WHERE actor_run_id = p_actor_run_id FOR UPDATE;
  IF run_row.state <> 'RUNNING' OR run_row.purpose <> 'CODING' THEN RETURN false; END IF;
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = run_row.change_id FOR UPDATE;
  IF run_row.admission_token <> p_admission_token OR run_row.sandbox_id <> p_sandbox_id
    OR run_row.base_source_revision <> p_base_source_revision
    OR p_candidate_source_revision !~ '^[0-9a-f]{40}$' OR octet_length(p_patch) > 8388608 THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
    UPDATE builder.change SET state = CASE WHEN candidate_source_revision IS NULL THEN 'FAILED' ELSE 'UNVERIFIED' END,
      updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'RUNNING';
    RETURN false;
  END IF;
  SELECT * INTO STRICT working FROM builder.project_working_state
  WHERE project_id = stored.project_id FOR UPDATE;
  IF working.current_change_id IS DISTINCT FROM stored.change_id
    OR working.current_state IS DISTINCT FROM 'CODING'
    OR working.working_source_revision IS DISTINCT FROM p_base_source_revision THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp()
    WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp()
    WHERE change_id = run_row.change_id AND state = 'RUNNING';
    RETURN false;
  END IF;
  UPDATE builder.actor_run SET state = 'COMPLETED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
  UPDATE builder.work_unit SET state = 'COMPLETED', result_commit = p_candidate_source_revision
  WHERE work_unit_id = run_row.work_unit_id;
  UPDATE builder.plan SET item_state = 'COMPLETED' WHERE change_id = run_row.change_id;
  UPDATE builder.change SET state = 'PREPARING', candidate_source_revision = p_candidate_source_revision,
    patch = p_patch, result_summary = NULLIF(p_summary, ''), result_kind = 'CANDIDATE', response_text = NULL,
    updated_at = clock_timestamp()
  WHERE change_id = run_row.change_id AND state = 'RUNNING';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE builder.project_working_state
  SET working_source_revision = p_candidate_source_revision,
    working_change_id = stored.change_id, working_account_id = stored.created_by_account_id,
    working_version = working_version + 1, current_state = 'PREPARING',
    preparation_attempt_id = run_row.actor_run_id, updated_at = clock_timestamp()
  WHERE project_id = stored.project_id;
  RETURN true;
END;
$$;

CREATE FUNCTION builder.settle_response(
  p_actor_run_id uuid, p_admission_token uuid, p_sandbox_id text, p_summary text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  run_row builder.actor_run%ROWTYPE;
  stored builder.change%ROWTYPE;
  working builder.project_working_state%ROWTYPE;
BEGIN
  IF p_summary IS NULL OR p_summary !~ '\S' OR octet_length(p_summary) > 200000 THEN RETURN false; END IF;
  SELECT * INTO STRICT run_row FROM builder.actor_run WHERE actor_run_id = p_actor_run_id FOR UPDATE;
  IF run_row.state <> 'RUNNING' OR run_row.purpose <> 'CODING'
    OR run_row.admission_token <> p_admission_token OR run_row.sandbox_id <> p_sandbox_id THEN RETURN false; END IF;
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = run_row.change_id FOR UPDATE;
  SELECT * INTO STRICT working FROM builder.project_working_state WHERE project_id = stored.project_id FOR UPDATE;
  IF working.current_change_id IS DISTINCT FROM stored.change_id OR working.current_state IS DISTINCT FROM 'CODING'
    OR stored.state IS DISTINCT FROM 'RUNNING' THEN RETURN false; END IF;
  UPDATE builder.actor_run SET state = 'COMPLETED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
  UPDATE builder.work_unit SET state = 'COMPLETED', result_commit = NULL WHERE work_unit_id = run_row.work_unit_id;
  UPDATE builder.plan SET item_state = 'COMPLETED' WHERE change_id = run_row.change_id;
  UPDATE builder.change SET state = 'RESPONDED', result_kind = 'RESPONSE_ONLY', response_text = p_summary,
    candidate_source_revision = NULL, patch = NULL, result_summary = NULL, updated_at = clock_timestamp()
  WHERE change_id = run_row.change_id AND state = 'RUNNING';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE builder.project_working_state
  SET current_state = 'RESPONDED', preparation_attempt_id = NULL, updated_at = clock_timestamp()
  WHERE project_id = stored.project_id;
  RETURN true;
END;
$$;

CREATE FUNCTION builder.settle_preparation(
  p_account_id uuid, p_project_id uuid, p_change_id uuid, p_source_revision text,
  p_artifact_revision_id uuid, p_artifact_digest text, p_failure_code text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  working builder.project_working_state%ROWTYPE;
  stored builder.change%ROWTYPE;
  registry_artifact record;
  ready boolean;
BEGIN
  IF p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$'
    OR (p_artifact_revision_id IS NULL) <> (p_artifact_digest IS NULL)
    OR (p_artifact_digest IS NOT NULL AND p_artifact_digest !~ '^[0-9a-f]{64}$')
    OR (p_artifact_revision_id IS NULL AND (p_failure_code IS NULL OR p_failure_code !~ '^[A-Z0-9_]{1,120}$')) THEN
    RAISE EXCEPTION 'BUILDER_PREPARATION_INPUT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  ready := p_artifact_revision_id IS NOT NULL;
  IF ready THEN
    PERFORM 1 FROM iam.admit_application_build(p_account_id, p_project_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_PREPARATION_AUTHORITY_REVOKED' USING ERRCODE = 'P0001'; END IF;
  END IF;
  SELECT * INTO STRICT working FROM builder.project_working_state WHERE project_id = p_project_id FOR UPDATE;
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id FOR UPDATE;
  IF working.current_change_id IS DISTINCT FROM p_change_id OR working.current_state IS DISTINCT FROM 'PREPARING'
    OR working.working_source_revision IS DISTINCT FROM p_source_revision
    OR stored.state IS DISTINCT FROM 'PREPARING' OR stored.candidate_source_revision IS DISTINCT FROM p_source_revision THEN
    RAISE EXCEPTION 'BUILDER_PREPARATION_STALE' USING ERRCODE = 'P0001';
  END IF;
  IF ready THEN
    SELECT artifact_revision_id, artifact_digest INTO registry_artifact
    FROM reg.get_application(p_account_id, p_project_id, p_change_id, p_source_revision);
    IF NOT FOUND
      OR registry_artifact.artifact_revision_id IS DISTINCT FROM p_artifact_revision_id
      OR registry_artifact.artifact_digest IS DISTINCT FROM p_artifact_digest THEN
      RAISE EXCEPTION 'BUILDER_PREPARATION_ARTIFACT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    UPDATE builder.change SET state = 'PREVIEW_READY', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.project_working_state
    SET current_state = 'PREVIEW_READY', last_preview_change_id = p_change_id,
      last_preview_source_revision = p_source_revision,
      last_preview_artifact_revision_id = p_artifact_revision_id,
      last_preview_artifact_digest = p_artifact_digest,
      updated_at = clock_timestamp()
    WHERE project_id = p_project_id;
  ELSE
    UPDATE builder.change SET state = 'BUILD_FAILED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.project_working_state
    SET current_state = 'BUILD_FAILED', updated_at = clock_timestamp()
    WHERE project_id = p_project_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION builder.recover_and_list_queued() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE builder.actor_run SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state IN ('ADMITTED', 'RUNNING');
  UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp()
  WHERE state IN ('VERIFYING', 'RESULT_READY');
  UPDATE builder.work_unit SET state = 'INTERRUPTED' WHERE state = 'RUNNING';
  UPDATE builder.plan SET item_state = 'INTERRUPTED' WHERE item_state = 'RUNNING';
  UPDATE builder.change SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state = 'RUNNING';
  UPDATE builder.project_working_state AS working
  SET current_state = 'IDLE', current_change_id = NULL, current_account_id = NULL,
    preparation_attempt_id = NULL, updated_at = clock_timestamp()
  WHERE working.current_state = 'CODING'
    AND EXISTS (
      SELECT 1 FROM builder.change AS stored
      WHERE stored.change_id = working.current_change_id AND stored.state = 'INTERRUPTED'
    );
  UPDATE builder.change SET state = 'BUILD_FAILED', updated_at = clock_timestamp()
  WHERE state = 'PREPARING';
  UPDATE builder.project_working_state AS working
  SET current_state = 'BUILD_FAILED', updated_at = clock_timestamp()
  WHERE working.current_state = 'PREPARING'
    AND EXISTS (
      SELECT 1 FROM builder.change AS stored
      WHERE stored.change_id = working.current_change_id AND stored.state = 'BUILD_FAILED'
    );
  RETURN QUERY SELECT stored.change_id FROM builder.change AS stored
  WHERE stored.state = 'QUEUED' ORDER BY stored.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_snapshot(
  p_account_id uuid, p_project_id uuid, p_change_id uuid, p_require_source boolean
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; plan_row builder.plan%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  IF p_require_source THEN PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  ELSE PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id); END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = p_change_id;
  SELECT * INTO STRICT working FROM builder.project_working_state WHERE project_id = p_project_id;
  RETURN jsonb_build_object(
    'change', builder.change_json(stored),
    'plan', jsonb_build_object('planRevision', plan_row.plan_revision, 'planningDepth', stored.planning_depth,
      'rigorProfile', stored.rigor_profile, 'items', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'summary', plan_row.summary, 'state', plan_row.item_state)),
      'dependencyEdges', jsonb_build_array(), 'acceptanceLinks', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'assertionRef', plan_row.assertion_ref)),
      'blockers', jsonb_build_array(), 'unknowns', jsonb_build_array(), 'progress', stored.state),
    'progress', jsonb_build_object('planRevision', plan_row.plan_revision,
      'items', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'summary', plan_row.summary, 'state', plan_row.item_state)), 'overallState', stored.state),
    'workingSourceRevision', working.working_source_revision,
    'diff', CASE WHEN stored.candidate_source_revision IS NULL THEN NULL ELSE jsonb_build_object(
      'baseSourceRevision', stored.base_source_revision, 'candidateSourceRevision', stored.candidate_source_revision, 'patch', stored.patch) END,
    'execution', jsonb_build_object('changeId', stored.change_id,
      'workUnits', COALESCE((SELECT jsonb_agg(jsonb_build_object('workUnitId', unit.work_unit_id, 'state', unit.state,
        'actorRunIds', COALESCE((SELECT jsonb_agg(run.actor_run_id ORDER BY run.created_at) FROM builder.actor_run AS run WHERE run.work_unit_id = unit.work_unit_id), '[]'::jsonb),
        'resultCommit', unit.result_commit) ORDER BY unit.attempt_no) FROM builder.work_unit AS unit WHERE unit.change_id = stored.change_id), '[]'::jsonb),
      'actorRuns', COALESCE((SELECT jsonb_agg(jsonb_build_object('actorRunId', actor_run_id, 'state', state,
        'lineageDisposition', lineage_disposition) ORDER BY created_at) FROM builder.actor_run WHERE change_id = stored.change_id), '[]'::jsonb))
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.list_changes(p_account_id uuid, p_project_id uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT builder.change_json(stored)
  FROM builder.change AS stored
  WHERE stored.project_id = p_project_id ORDER BY stored.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION builder.admit_source_revision(
  p_account_id uuid, p_project_id uuid, p_source_revision text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM builder.project_working_state AS working
    WHERE working.project_id = p_project_id
      AND (working.working_source_revision = p_source_revision OR working.last_preview_source_revision = p_source_revision)
  ) OR EXISTS (
    SELECT 1 FROM builder.change AS stored
    WHERE stored.project_id = p_project_id
      AND (stored.baseline_source_revision = p_source_revision OR stored.base_source_revision = p_source_revision
        OR stored.candidate_source_revision = p_source_revision
        OR EXISTS (SELECT 1 FROM builder.work_unit AS unit
          WHERE unit.change_id = stored.change_id AND unit.result_commit = p_source_revision))
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_preview_subject(
  p_account_id uuid, p_project_id uuid, p_change_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE baseline record; stored builder.change%ROWTYPE; working builder.project_working_state%ROWTYPE;
BEGIN
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO working FROM builder.project_working_state WHERE project_id = p_project_id;
  IF NOT FOUND THEN
    SELECT * INTO baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
      'subjectKind', 'CURRENT_PROJECT', 'subjectDigest', baseline.baseline_digest,
      'sourceRevision', baseline.source_revision, 'verified', false, 'previewEligible', false,
      'workingSourceRevision', baseline.source_revision, 'activeChangeId', NULL, 'lastPreviewChangeId', NULL
    );
  END IF;
  IF p_change_id IS NULL THEN
    SELECT * INTO baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
      'subjectKind', 'CURRENT_PROJECT',
      'subjectDigest', CASE WHEN working.working_change_id IS NULL THEN baseline.baseline_digest ELSE working.working_source_revision END,
      'sourceRevision', working.working_source_revision, 'verified', false,
      'previewEligible', working.last_preview_source_revision = working.working_source_revision,
      'workingSourceRevision', working.working_source_revision,
      'activeChangeId', CASE WHEN working.current_state IN ('CODING', 'PREPARING') THEN working.current_change_id ELSE NULL END,
      'lastPreviewChangeId', working.last_preview_change_id
    );
  END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id;
  IF NOT FOUND OR stored.candidate_source_revision IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'subjectKind', 'CHANGE_CANDIDATE', 'subjectDigest', stored.candidate_source_revision,
    'sourceRevision', stored.candidate_source_revision,
    'verified', stored.state = 'VERIFIED',
    'previewEligible', stored.state IN ('RESULT_READY', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED',
      'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED'),
    'workingSourceRevision', working.working_source_revision,
    'activeChangeId', CASE WHEN working.current_state IN ('CODING', 'PREPARING') THEN working.current_change_id ELSE NULL END,
    'lastPreviewChangeId', working.last_preview_change_id
  );
END;
$$;

CREATE FUNCTION builder.admit_application_source(
  p_account_id uuid, p_project_id uuid, p_change_id uuid, p_source_revision text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE baseline_row record; change_row builder.change%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_change_id IS NULL
    OR p_source_revision IS NULL OR p_source_revision !~ '^[0-9a-f]{40}$' THEN RETURN false; END IF;
  IF NOT COALESCE((SELECT true FROM iam.admit_application_build(p_account_id, p_project_id)), false) THEN RETURN false; END IF;
  SELECT * INTO baseline_row FROM project.lock_application_baseline(p_project_id);
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO change_row FROM builder.change
  WHERE change_id = p_change_id AND project_id = p_project_id FOR SHARE;
  IF NOT FOUND OR change_row.candidate_source_revision IS DISTINCT FROM p_source_revision THEN RETURN false; END IF;
  RETURN change_row.baseline_digest = baseline_row.baseline_digest
    AND change_row.baseline_source_revision = baseline_row.source_revision
    AND change_row.state IN ('RESULT_READY', 'PREPARING', 'PREVIEW_READY', 'BUILD_FAILED',
      'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED');
END;
$$;

REVOKE ALL ON TABLE builder.project_working_state FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION builder.create_change(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,text,text),
  builder.settle_response(uuid,uuid,text,text), builder.settle_preparation(uuid,uuid,uuid,text,uuid,text,text),
  builder.admit_application_source(uuid,uuid,uuid,text) FROM PUBLIC;
RESET ROLE;

GRANT EXECUTE ON FUNCTION builder.create_change(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,text,text) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.settle_response(uuid,uuid,text,text),
  builder.settle_preparation(uuid,uuid,uuid,text,uuid,text,text) TO hub_rb_executor;

GRANT USAGE ON SCHEMA reg TO builder_owner;
GRANT EXECUTE ON FUNCTION reg.get_application(uuid,uuid,uuid,text) TO builder_owner;

SET LOCAL ROLE registry_owner;

DO $$
DECLARE
  function_name text;
  definition text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY['reg.retain_application', 'reg.get_application', 'reg.read_application_file'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO definition
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname || '.' || p.proname = function_name;
    IF definition IS NULL THEN RAISE EXCEPTION 'APPLICATION_FUNCTION_NOT_FOUND'; END IF;
    definition := replace(definition, 'builder.admit_verified_application_source(', 'builder.admit_application_source(');
    EXECUTE definition;
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA builder TO registry_owner;
GRANT EXECUTE ON FUNCTION builder.admit_application_source(uuid,uuid,uuid,text) TO registry_owner;

RESET ROLE;
GRANT EXECUTE ON FUNCTION builder.settle_result(uuid,uuid,text,text,text,text,text) TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.recover_and_list_queued() TO hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.read_preview_subject(uuid,uuid,uuid) TO hub_rb_ingress;

COMMIT;
