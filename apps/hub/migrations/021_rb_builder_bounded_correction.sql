BEGIN;

SET LOCAL ROLE builder_owner;

ALTER TABLE builder.change DROP CONSTRAINT change_check;
ALTER TABLE builder.change ADD CHECK (
  (candidate_source_revision IS NULL) = (patch IS NULL) AND
  (state NOT IN ('RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED') OR
    candidate_source_revision IS NOT NULL) AND
  (candidate_source_revision IS NULL OR state IN (
    'RUNNING', 'RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'
  ))
);

ALTER TABLE builder.work_unit DROP CONSTRAINT work_unit_change_id_key;
ALTER TABLE builder.work_unit ADD COLUMN attempt_no smallint NOT NULL DEFAULT 1
  CHECK (attempt_no IN (1, 2));
ALTER TABLE builder.work_unit ADD UNIQUE (change_id, attempt_no);

CREATE TABLE builder.finding_resolution (
  finding_id uuid PRIMARY KEY REFERENCES builder.finding(finding_id) ON DELETE RESTRICT,
  finding_revision uuid NOT NULL,
  candidate_source_revision text NOT NULL CHECK (candidate_source_revision ~ '^[0-9a-f]{40}$'),
  resolved_by_account_id uuid NOT NULL,
  resolution_evidence_ids uuid[] NOT NULL CHECK (cardinality(resolution_evidence_ids) >= 1),
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION builder.claim_correction(
  p_change_id uuid, p_work_unit_id uuid, p_actor_run_id uuid, p_admission_token uuid,
  p_model_admission_id text, p_model_provider_id text, p_model_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; baseline record; findings jsonb;
BEGIN
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id FOR UPDATE;
  IF stored.state <> 'VERIFICATION_FAILED' OR
    (SELECT count(*) FROM builder.work_unit WHERE change_id = p_change_id) <> 1 OR
    NOT EXISTS (SELECT 1 FROM builder.finding WHERE change_id = p_change_id AND state = 'OPEN'
      AND subject_digest = stored.candidate_source_revision) THEN
    RETURN NULL;
  END IF;
  PERFORM 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  IF NOT FOUND OR baseline.baseline_digest <> stored.baseline_digest OR
    baseline.source_revision <> stored.base_source_revision THEN RETURN NULL; END IF;
  SELECT jsonb_agg(jsonb_build_object('findingId', finding_id, 'findingRevision', finding_revision,
    'summary', summary) ORDER BY created_at) INTO findings
  FROM builder.finding WHERE change_id = p_change_id AND state = 'OPEN'
    AND subject_digest = stored.candidate_source_revision;
  INSERT INTO builder.work_unit(work_unit_id, change_id, state, result_commit, attempt_no)
  VALUES (p_work_unit_id, p_change_id, 'RUNNING', NULL, 2);
  INSERT INTO builder.actor_run(actor_run_id, change_id, work_unit_id, admission_token, lineage_disposition,
    runtime_id, model_admission_id, model_provider_id, model_id, base_source_revision, sandbox_id, state, purpose)
  VALUES (p_actor_run_id, p_change_id, p_work_unit_id, p_admission_token, 'FRESH_BASE',
    'mastra-native-e2b-v1', p_model_admission_id, p_model_provider_id, p_model_id,
    stored.candidate_source_revision, NULL, 'ADMITTED', 'CODING');
  UPDATE builder.plan SET item_state = 'RUNNING' WHERE change_id = p_change_id;
  UPDATE builder.change SET state = 'RUNNING', updated_at = clock_timestamp() WHERE change_id = p_change_id;
  RETURN jsonb_build_object(
    'projectId', stored.project_id, 'changeId', stored.change_id, 'workUnitId', p_work_unit_id,
    'actorRunId', p_actor_run_id, 'admissionToken', p_admission_token, 'intent', stored.intent,
    'changeBaseSourceRevision', stored.base_source_revision,
    'baseSourceRevision', stored.candidate_source_revision,
    'correctionFindings', findings
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.settle_result(
  p_actor_run_id uuid, p_admission_token uuid, p_sandbox_id text,
  p_base_source_revision text, p_candidate_source_revision text, p_patch text, p_summary text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.actor_run%ROWTYPE; stored builder.change%ROWTYPE;
BEGIN
  SELECT * INTO STRICT run_row FROM builder.actor_run WHERE actor_run_id = p_actor_run_id FOR UPDATE;
  IF run_row.state <> 'RUNNING' THEN RETURN false; END IF;
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = run_row.change_id FOR UPDATE;
  IF run_row.admission_token <> p_admission_token OR run_row.sandbox_id <> p_sandbox_id OR
    run_row.base_source_revision <> p_base_source_revision OR p_candidate_source_revision !~ '^[0-9a-f]{40}$' OR
    octet_length(p_patch) > 8388608 THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
    UPDATE builder.change SET state = CASE WHEN candidate_source_revision IS NULL THEN 'FAILED' ELSE 'UNVERIFIED' END,
      updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'RUNNING';
    RETURN false;
  END IF;
  UPDATE builder.actor_run SET state = 'COMPLETED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
  UPDATE builder.work_unit SET state = 'COMPLETED', result_commit = p_candidate_source_revision WHERE work_unit_id = run_row.work_unit_id;
  UPDATE builder.plan SET item_state = 'COMPLETED' WHERE change_id = run_row.change_id;
  UPDATE builder.change SET state = 'RESULT_READY', candidate_source_revision = p_candidate_source_revision,
    patch = p_patch, result_summary = NULLIF(p_summary, ''), updated_at = clock_timestamp()
  WHERE change_id = run_row.change_id AND state = 'RUNNING';
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION builder.fail_run(p_actor_run_id uuid, p_admission_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.actor_run%ROWTYPE;
BEGIN
  UPDATE builder.actor_run SET state = 'FAILED', updated_at = clock_timestamp()
  WHERE actor_run_id = p_actor_run_id AND admission_token = p_admission_token AND state IN ('ADMITTED', 'RUNNING') RETURNING * INTO run_row;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
  UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
  UPDATE builder.change SET state = CASE WHEN candidate_source_revision IS NULL THEN 'FAILED' ELSE 'UNVERIFIED' END,
    updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'RUNNING';
END;
$$;

CREATE OR REPLACE FUNCTION builder.recover_and_list_queued() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE builder.actor_run SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state IN ('ADMITTED', 'RUNNING');
  UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE state IN ('VERIFYING', 'RESULT_READY');
  UPDATE builder.work_unit SET state = 'INTERRUPTED' WHERE state = 'RUNNING';
  UPDATE builder.plan SET item_state = 'INTERRUPTED' WHERE item_state = 'RUNNING';
  UPDATE builder.change SET state = CASE WHEN candidate_source_revision IS NULL THEN 'INTERRUPTED' ELSE 'UNVERIFIED' END,
    updated_at = clock_timestamp() WHERE state = 'RUNNING';
  RETURN QUERY SELECT stored.change_id FROM builder.change AS stored WHERE stored.state = 'QUEUED' ORDER BY stored.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_verification(
  p_change_id uuid, p_actor_run_id uuid, p_admission_token uuid,
  p_model_admission_id text, p_model_provider_id text, p_model_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; baseline record; unit builder.work_unit%ROWTYPE;
  plan_row builder.plan%ROWTYPE; contract builder.contract_revision%ROWTYPE;
BEGIN
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id FOR UPDATE;
  IF stored.state <> 'RESULT_READY' THEN RAISE EXCEPTION 'BUILDER_CHANGE_NOT_RESULT_READY' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id);
  IF NOT FOUND THEN UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    RETURN jsonb_build_object('refusedCode', 'BUILDER_VERIFICATION_AUTHORITY_REVOKED'); END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  IF NOT FOUND OR baseline.baseline_digest <> stored.baseline_digest OR baseline.source_revision <> stored.base_source_revision THEN
    UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    RETURN jsonb_build_object('refusedCode', 'BUILDER_VERIFICATION_BASELINE_STALE'); END IF;
  SELECT * INTO STRICT unit FROM builder.work_unit WHERE change_id = p_change_id ORDER BY attempt_no DESC LIMIT 1;
  SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = p_change_id;
  SELECT * INTO STRICT contract FROM builder.contract_revision WHERE change_id = p_change_id;
  IF plan_row.assertion_ref <> contract.assertion_ref THEN RAISE EXCEPTION 'BUILDER_ACCEPTANCE_MAPPING_REFUSED' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO builder.actor_run(actor_run_id, change_id, work_unit_id, admission_token, lineage_disposition,
    runtime_id, model_admission_id, model_provider_id, model_id, base_source_revision, sandbox_id, state, purpose)
  VALUES (p_actor_run_id, p_change_id, unit.work_unit_id, p_admission_token, 'FRESH_BASE',
    'mastra-native-e2b-verifier-v1', p_model_admission_id, p_model_provider_id, p_model_id,
    stored.base_source_revision, NULL, 'ADMITTED', 'VERIFICATION');
  UPDATE builder.change SET state = 'VERIFYING', updated_at = clock_timestamp() WHERE change_id = p_change_id;
  RETURN jsonb_build_object(
    'projectId', stored.project_id, 'changeId', stored.change_id, 'workUnitId', unit.work_unit_id,
    'actorRunId', p_actor_run_id, 'admissionToken', p_admission_token, 'intent', stored.intent,
    'assertionRef', contract.assertion_ref, 'contractRevision', contract.contract_revision,
    'planRevision', plan_row.plan_revision, 'baselineDigest', stored.baseline_digest,
    'baseSourceRevision', stored.base_source_revision, 'candidateSourceRevision', stored.candidate_source_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_snapshot(p_account_id uuid, p_project_id uuid, p_change_id uuid, p_require_source boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; plan_row builder.plan%ROWTYPE;
BEGIN
  IF p_require_source THEN PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  ELSE PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id); END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = p_change_id;
  RETURN jsonb_build_object(
    'change', builder.change_json(stored),
    'plan', jsonb_build_object('planRevision', plan_row.plan_revision, 'planningDepth', stored.planning_depth,
      'rigorProfile', stored.rigor_profile, 'items', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'summary', plan_row.summary, 'state', plan_row.item_state)),
      'dependencyEdges', jsonb_build_array(), 'acceptanceLinks', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'assertionRef', plan_row.assertion_ref)),
      'blockers', jsonb_build_array(), 'unknowns', jsonb_build_array(), 'progress', stored.state),
    'progress', jsonb_build_object('planRevision', plan_row.plan_revision,
      'items', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'summary', plan_row.summary, 'state', plan_row.item_state)), 'overallState', stored.state),
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

CREATE FUNCTION builder.close_finding(
  p_account_id uuid, p_project_id uuid, p_change_id uuid, p_finding_id uuid,
  p_expected_finding_revision uuid, p_resolution_evidence_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; finding_row builder.finding%ROWTYPE; chosen builder.verification_evidence%ROWTYPE;
  plan_row builder.plan%ROWTYPE; contract builder.contract_revision%ROWTYPE; current_baseline record;
BEGIN
  IF cardinality(p_resolution_evidence_ids) < 1 OR cardinality(p_resolution_evidence_ids) <>
    (SELECT count(DISTINCT value) FROM unnest(p_resolution_evidence_ids) AS value) THEN
    RAISE EXCEPTION 'BLD13_EVIDENCE_REFUSED' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM iam.admit_project_review(p_account_id, p_project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'BLD13_NOT_AUTHORIZED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id FOR UPDATE;
  PERFORM 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'BLD13_BUILD_AUTHORITY_STALE' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO current_baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  IF NOT FOUND OR current_baseline.baseline_digest IS DISTINCT FROM stored.baseline_digest OR
    current_baseline.source_revision IS DISTINCT FROM stored.base_source_revision THEN
    RAISE EXCEPTION 'BLD13_BASELINE_STALE' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO STRICT finding_row FROM builder.finding WHERE finding_id = p_finding_id AND change_id = p_change_id FOR UPDATE;
  IF finding_row.finding_revision <> p_expected_finding_revision THEN RAISE EXCEPTION 'BLD13_REVISION_STALE' USING ERRCODE = 'P0001'; END IF;
  IF finding_row.state <> 'OPEN' OR stored.state <> 'UNVERIFIED' OR stored.candidate_source_revision = finding_row.subject_digest THEN
    RAISE EXCEPTION 'BLD13_CURRENT_STATE_REFUSED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO STRICT contract FROM builder.contract_revision WHERE change_id = p_change_id;
  IF finding_row.assertion_ref <> contract.assertion_ref OR
    (SELECT count(*) FROM builder.verification_evidence WHERE evidence_id = ANY(p_resolution_evidence_ids)
      AND change_id = p_change_id AND assertion_ref = finding_row.assertion_ref
      AND subject_digest = stored.candidate_source_revision AND outcome = 'PASS'
      AND (report->>'intentSatisfied')::boolean IS TRUE
      AND jsonb_array_length(report->'findings') = 0
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(report->'checks') AS check_row
        WHERE check_row->>'outcome' IS DISTINCT FROM 'PASS')) <> cardinality(p_resolution_evidence_ids) THEN
    RAISE EXCEPTION 'BLD13_EVIDENCE_REFUSED' USING ERRCODE = 'P0001'; END IF;
  SELECT evidence.* INTO STRICT chosen FROM builder.verification_evidence AS evidence
    WHERE evidence.evidence_id = ANY(p_resolution_evidence_ids) ORDER BY evidence.created_at DESC LIMIT 1;
  UPDATE builder.finding SET state = 'CLOSED', finding_revision = gen_random_uuid(), updated_at = clock_timestamp()
    WHERE finding_id = p_finding_id RETURNING * INTO finding_row;
  INSERT INTO builder.finding_resolution VALUES (p_finding_id, finding_row.finding_revision,
    stored.candidate_source_revision, p_account_id, p_resolution_evidence_ids, clock_timestamp());
  IF NOT EXISTS (SELECT 1 FROM builder.finding WHERE change_id = p_change_id AND state = 'OPEN') THEN
    SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = p_change_id;
    INSERT INTO builder.change_acceptance(change_id, candidate_source_revision, baseline_digest,
      plan_revision, contract_revision, evidence_set_digest)
    VALUES (p_change_id, stored.candidate_source_revision, stored.baseline_digest,
      plan_row.plan_revision, contract.contract_revision, chosen.evidence_set_digest);
    UPDATE builder.change SET state = 'VERIFIED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
  END IF;
  RETURN jsonb_build_object('findingId', finding_row.finding_id, 'changeId', finding_row.change_id,
    'findingRevision', finding_row.finding_revision, 'state', finding_row.state, 'summary', finding_row.summary);
END;
$$;

REVOKE ALL ON TABLE builder.finding_resolution FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION builder.claim_correction(uuid,uuid,uuid,uuid,text,text,text),
  builder.close_finding(uuid,uuid,uuid,uuid,uuid,uuid[]) FROM PUBLIC;
RESET ROLE;

GRANT EXECUTE ON FUNCTION builder.close_finding(uuid,uuid,uuid,uuid,uuid,uuid[]) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_correction(uuid,uuid,uuid,uuid,text,text,text) TO hub_rb_executor;
REVOKE ALL ON TABLE builder.finding_resolution FROM hub_rb_ingress, hub_rb_executor;

COMMIT;
