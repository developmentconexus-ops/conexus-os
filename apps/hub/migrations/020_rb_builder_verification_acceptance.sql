BEGIN;

SET LOCAL ROLE iam_owner;

ALTER TABLE iam.project_builder_grant ADD COLUMN can_review boolean NOT NULL DEFAULT true;

CREATE FUNCTION iam.admit_project_review(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(project_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT grant_row.project_id
  FROM iam.project_builder_grant AS grant_row
  JOIN project.project AS stored_project ON stored_project.project_id = grant_row.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = grant_row.account_id AND membership.workspace_id = stored_project.workspace_id
  WHERE grant_row.account_id = p_account_id AND grant_row.project_id = p_project_id AND grant_row.can_review;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_project_review(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam.admit_project_review(uuid, uuid) TO builder_owner;

RESET ROLE;
SET LOCAL ROLE builder_owner;

ALTER TABLE builder.change DROP CONSTRAINT change_state_check;
ALTER TABLE builder.change DROP CONSTRAINT change_check;
ALTER TABLE builder.change ADD CHECK (state IN (
  'QUEUED', 'RUNNING', 'RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'
));
ALTER TABLE builder.change ADD CHECK (
  (state IN ('RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED')) =
  (candidate_source_revision IS NOT NULL AND patch IS NOT NULL)
);

ALTER TABLE builder.plan ADD COLUMN assertion_ref text;

CREATE TABLE builder.contract_revision (
  contract_revision uuid PRIMARY KEY,
  change_id uuid NOT NULL UNIQUE REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  intent_digest text NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  assertion_ref text NOT NULL CHECK (assertion_ref ~ '^change-intent:[0-9a-f]{64}$'),
  required_proof_kind text NOT NULL CHECK (required_proof_kind = 'INDEPENDENT_COGNITIVE')
);

INSERT INTO builder.contract_revision(contract_revision, change_id, intent_digest, assertion_ref, required_proof_kind)
SELECT stored_plan.plan_revision, stored_change.change_id, receipt.request_digest,
  'change-intent:' || receipt.request_digest, 'INDEPENDENT_COGNITIVE'
FROM builder.change AS stored_change
JOIN builder.plan AS stored_plan ON stored_plan.change_id = stored_change.change_id
JOIN builder.operation_receipt AS receipt ON receipt.change_id = stored_change.change_id;

UPDATE builder.plan AS stored_plan SET assertion_ref = contract.assertion_ref
FROM builder.contract_revision AS contract WHERE contract.change_id = stored_plan.change_id;
ALTER TABLE builder.plan ALTER COLUMN assertion_ref SET NOT NULL;
ALTER TABLE builder.plan ADD CHECK (assertion_ref ~ '^change-intent:[0-9a-f]{64}$');

ALTER TABLE builder.actor_run ADD COLUMN purpose text NOT NULL DEFAULT 'CODING'
  CHECK (purpose IN ('CODING', 'VERIFICATION'));
ALTER TABLE builder.actor_run ADD COLUMN failure_code text CHECK (failure_code ~ '^[A-Z0-9_]{1,120}$');
ALTER TABLE builder.actor_run DROP CONSTRAINT actor_run_runtime_id_check;
ALTER TABLE builder.actor_run ADD CHECK (runtime_id IN ('mastra-native-e2b-v1', 'mastra-native-e2b-verifier-v1'));
DROP INDEX builder.one_active_writer_per_change;
CREATE UNIQUE INDEX one_active_writer_per_change ON builder.actor_run(change_id)
WHERE purpose = 'CODING' AND state IN ('ADMITTED', 'RUNNING');

CREATE TABLE builder.finding (
  finding_id uuid PRIMARY KEY,
  change_id uuid NOT NULL REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  finding_revision uuid NOT NULL UNIQUE,
  assertion_ref text NOT NULL,
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{40}$'),
  state text NOT NULL CHECK (state IN ('OPEN', 'CLOSED')),
  summary text NOT NULL CHECK (summary ~ '\S'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE builder.verification_evidence (
  evidence_id uuid PRIMARY KEY,
  change_id uuid NOT NULL REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  actor_run_id uuid NOT NULL UNIQUE REFERENCES builder.actor_run(actor_run_id) ON DELETE RESTRICT,
  assertion_ref text NOT NULL,
  claim text NOT NULL CHECK (claim ~ '\S'),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{40}$'),
  outcome text NOT NULL CHECK (outcome IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
  provenance text[] NOT NULL CHECK (cardinality(provenance) >= 4),
  report jsonb NOT NULL CHECK (jsonb_typeof(report) = 'object'),
  evidence_set_digest text NOT NULL CHECK (evidence_set_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE builder.change_acceptance (
  change_id uuid PRIMARY KEY REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  candidate_source_revision text NOT NULL CHECK (candidate_source_revision ~ '^[0-9a-f]{40}$'),
  baseline_digest text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  plan_revision uuid NOT NULL,
  contract_revision uuid NOT NULL,
  evidence_set_digest text NOT NULL CHECK (evidence_set_digest ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION builder.create_change(
  p_account_id uuid, p_project_id uuid, p_key_digest text, p_request_digest text,
  p_change_id uuid, p_plan_revision uuid, p_item_id uuid,
  p_coding_session_id uuid, p_work_unit_id uuid, p_intent text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE receipt builder.operation_receipt%ROWTYPE; baseline record; stored builder.change%ROWTYPE;
BEGIN
  IF p_intent !~ '\S' OR length(p_intent) > 20000 OR p_request_digest !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'BLD03_INTENT_REFUSED' USING ERRCODE = 'P0001'; END IF;
  PERFORM iam.ensure_project_builder_grant(p_account_id, p_project_id);
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'BLD03_NOT_AUTHORIZED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
  IF NOT FOUND OR baseline.source_revision !~ '^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'BLD03_BASELINE_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO builder.operation_receipt(account_id, project_id, key_digest, request_digest, change_id)
  VALUES (p_account_id, p_project_id, p_key_digest, p_request_digest, p_change_id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT receipt FROM builder.operation_receipt
  WHERE account_id = p_account_id AND project_id = p_project_id AND key_digest = p_key_digest FOR UPDATE;
  IF receipt.request_digest <> p_request_digest THEN RAISE EXCEPTION 'BLD03_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = receipt.change_id;
  IF FOUND THEN RETURN builder.change_json(stored); END IF;
  IF receipt.change_id <> p_change_id THEN RAISE EXCEPTION 'BLD03_OUTCOME_UNKNOWN' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO builder.change VALUES (
    p_change_id, p_project_id, p_account_id, p_intent, baseline.baseline_digest,
    baseline.source_revision, 'DIRECT', 'CONTROLLED', 'QUEUED', NULL, NULL, NULL,
    clock_timestamp(), clock_timestamp()
  ) RETURNING * INTO stored;
  INSERT INTO builder.contract_revision VALUES (
    p_plan_revision, p_change_id, p_request_digest, 'change-intent:' || p_request_digest, 'INDEPENDENT_COGNITIVE'
  );
  INSERT INTO builder.plan VALUES (p_change_id, p_plan_revision, p_item_id, p_intent, 'READY', 'change-intent:' || p_request_digest);
  INSERT INTO builder.coding_session VALUES (p_coding_session_id, p_change_id);
  INSERT INTO builder.work_unit VALUES (p_work_unit_id, p_change_id, 'READY', NULL);
  RETURN builder.change_json(stored);
END;
$$;

CREATE OR REPLACE FUNCTION builder.claim_change(
  p_change_id uuid, p_actor_run_id uuid, p_admission_token uuid,
  p_model_admission_id text, p_model_provider_id text, p_model_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; baseline record; unit builder.work_unit%ROWTYPE;
BEGIN
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id FOR UPDATE;
  IF stored.state <> 'QUEUED' THEN RAISE EXCEPTION 'BUILDER_CHANGE_NOT_QUEUED' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id);
  IF NOT FOUND THEN
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE change_id = p_change_id;
    RETURN jsonb_build_object('refusedCode', 'BUILDER_AUTHORITY_REVOKED');
  END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  IF NOT FOUND OR baseline.baseline_digest <> stored.baseline_digest OR baseline.source_revision <> stored.base_source_revision THEN
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = p_change_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE change_id = p_change_id;
    RETURN jsonb_build_object('refusedCode', 'BUILDER_BASELINE_STALE');
  END IF;
  SELECT * INTO STRICT unit FROM builder.work_unit WHERE change_id = p_change_id FOR UPDATE;
  INSERT INTO builder.actor_run(actor_run_id, change_id, work_unit_id, admission_token, lineage_disposition,
    runtime_id, model_admission_id, model_provider_id, model_id, base_source_revision, sandbox_id, state, purpose)
  VALUES (p_actor_run_id, p_change_id, unit.work_unit_id, p_admission_token, 'FRESH_BASE',
    'mastra-native-e2b-v1', p_model_admission_id, p_model_provider_id, p_model_id,
    stored.base_source_revision, NULL, 'ADMITTED', 'CODING');
  UPDATE builder.change SET state = 'RUNNING', updated_at = clock_timestamp() WHERE change_id = p_change_id;
  UPDATE builder.plan SET item_state = 'RUNNING' WHERE change_id = p_change_id;
  UPDATE builder.work_unit SET state = 'RUNNING' WHERE change_id = p_change_id;
  RETURN jsonb_build_object(
    'projectId', stored.project_id, 'changeId', stored.change_id, 'workUnitId', unit.work_unit_id,
    'actorRunId', p_actor_run_id, 'admissionToken', p_admission_token, 'intent', stored.intent,
    'baseSourceRevision', stored.base_source_revision
  );
END;
$$;

CREATE FUNCTION builder.claim_verification(
  p_change_id uuid, p_actor_run_id uuid, p_admission_token uuid,
  p_model_admission_id text, p_model_provider_id text, p_model_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; baseline record; unit builder.work_unit%ROWTYPE;
  plan_row builder.plan%ROWTYPE; contract builder.contract_revision%ROWTYPE;
BEGIN
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = p_change_id FOR UPDATE;
  IF stored.state <> 'RESULT_READY' THEN RAISE EXCEPTION 'BUILDER_CHANGE_NOT_RESULT_READY' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id);
  IF NOT FOUND THEN
    UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    RETURN jsonb_build_object('refusedCode', 'BUILDER_VERIFICATION_AUTHORITY_REVOKED');
  END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  IF NOT FOUND OR baseline.baseline_digest <> stored.baseline_digest OR baseline.source_revision <> stored.base_source_revision THEN
    UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = p_change_id;
    RETURN jsonb_build_object('refusedCode', 'BUILDER_VERIFICATION_BASELINE_STALE'); END IF;
  SELECT * INTO STRICT unit FROM builder.work_unit WHERE change_id = p_change_id;
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

CREATE FUNCTION builder.settle_verification(
  p_actor_run_id uuid, p_admission_token uuid, p_sandbox_id text,
  p_assertion_ref text, p_contract_revision uuid, p_plan_revision uuid,
  p_baseline_digest text, p_base_source_revision text, p_candidate_source_revision text,
  p_evidence_id uuid, p_finding_ids uuid[], p_finding_revisions uuid[],
  p_evidence_set_digest text, p_report jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.actor_run%ROWTYPE; stored builder.change%ROWTYPE; contract builder.contract_revision%ROWTYPE;
  plan_row builder.plan%ROWTYPE; current_baseline record; report_outcome text; report_summary text; valid_pass boolean;
BEGIN
  SELECT * INTO STRICT run_row FROM builder.actor_run WHERE actor_run_id = p_actor_run_id FOR UPDATE;
  SELECT * INTO STRICT stored FROM builder.change WHERE change_id = run_row.change_id FOR UPDATE;
  SELECT * INTO STRICT contract FROM builder.contract_revision WHERE change_id = run_row.change_id;
  SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = run_row.change_id;
  SELECT * INTO current_baseline FROM project.get_approved_baseline(stored.project_id, ARRAY[stored.project_id]);
  report_outcome := p_report->>'outcome'; report_summary := p_report->>'summary';
  IF run_row.state <> 'RUNNING' THEN RETURN false; END IF;
  IF run_row.admission_token IS DISTINCT FROM p_admission_token OR run_row.purpose IS DISTINCT FROM 'VERIFICATION' OR
    run_row.sandbox_id IS DISTINCT FROM p_sandbox_id OR stored.state IS DISTINCT FROM 'VERIFYING' OR
    contract.assertion_ref IS DISTINCT FROM p_assertion_ref OR
    contract.contract_revision IS DISTINCT FROM p_contract_revision OR plan_row.plan_revision IS DISTINCT FROM p_plan_revision OR
    current_baseline.baseline_digest IS DISTINCT FROM p_baseline_digest OR current_baseline.source_revision IS DISTINCT FROM p_base_source_revision OR
    stored.baseline_digest IS DISTINCT FROM p_baseline_digest OR stored.base_source_revision IS DISTINCT FROM p_base_source_revision OR
    stored.candidate_source_revision IS DISTINCT FROM p_candidate_source_revision OR
    NOT EXISTS (SELECT 1 FROM iam.admit_project_build(stored.created_by_account_id, stored.project_id)) OR
    p_evidence_set_digest IS NULL OR p_evidence_set_digest !~ '^[0-9a-f]{64}$' OR
    report_outcome IS NULL OR report_outcome NOT IN ('PASS', 'FAIL', 'INCONCLUSIVE') OR
    report_summary IS NULL OR report_summary !~ '\S' OR
    jsonb_typeof(p_report->'intentSatisfied') IS DISTINCT FROM 'boolean' OR
    jsonb_typeof(p_report->'findings') IS DISTINCT FROM 'array' OR
    jsonb_typeof(p_report->'checks') IS DISTINCT FROM 'array' THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'VERIFYING';
    RETURN false;
  END IF;
  IF jsonb_array_length(p_report->'checks') < 1 OR
    cardinality(p_finding_ids) IS DISTINCT FROM jsonb_array_length(p_report->'findings') OR
    cardinality(p_finding_revisions) IS DISTINCT FROM jsonb_array_length(p_report->'findings') OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'findings') AS finding_row
      WHERE jsonb_typeof(finding_row) IS DISTINCT FROM 'string' OR finding_row #>> '{}' IS NULL OR finding_row #>> '{}' !~ '\S') OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'checks') AS check_row
      WHERE jsonb_typeof(check_row) IS DISTINCT FROM 'object' OR
        check_row->>'name' IS NULL OR check_row->>'name' !~ '\S' OR
        check_row->>'outcome' IS NULL OR check_row->>'outcome' NOT IN ('PASS', 'FAIL', 'INCONCLUSIVE') OR
        check_row->>'detail' IS NULL OR check_row->>'detail' !~ '\S') OR
    (report_outcome = 'FAIL') <> (jsonb_array_length(p_report->'findings') > 0 AND
      EXISTS (SELECT 1 FROM jsonb_array_elements(p_report->'checks') AS check_row WHERE check_row->>'outcome' = 'FAIL')) THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'VERIFYING';
    RETURN false;
  END IF;
  valid_pass := report_outcome = 'PASS' AND (p_report->>'intentSatisfied')::boolean IS TRUE AND
    jsonb_array_length(p_report->'findings') = 0 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_report->'checks') AS check_row
      WHERE check_row->>'outcome' IS DISTINCT FROM 'PASS'
    );
  INSERT INTO builder.verification_evidence(evidence_id, change_id, actor_run_id, assertion_ref, claim,
    subject_digest, outcome, provenance, report, evidence_set_digest)
  VALUES (p_evidence_id, run_row.change_id, p_actor_run_id, p_assertion_ref,
    CASE WHEN valid_pass THEN 'Candidate satisfies the accepted Change intent.' ELSE 'Candidate verification did not establish acceptance.' END,
    p_candidate_source_revision, report_outcome,
    ARRAY[p_baseline_digest, p_base_source_revision, p_candidate_source_revision, p_assertion_ref], p_report, p_evidence_set_digest);
  UPDATE builder.actor_run SET state = 'COMPLETED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
  IF valid_pass THEN
    IF EXISTS (SELECT 1 FROM builder.finding WHERE change_id = run_row.change_id AND state = 'OPEN') THEN
      UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id;
      RETURN true;
    END IF;
    INSERT INTO builder.change_acceptance(change_id, candidate_source_revision, baseline_digest,
      plan_revision, contract_revision, evidence_set_digest)
    VALUES (run_row.change_id, p_candidate_source_revision, p_baseline_digest, p_plan_revision, p_contract_revision, p_evidence_set_digest);
    UPDATE builder.change SET state = 'VERIFIED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id;
  ELSIF report_outcome = 'FAIL' THEN
    INSERT INTO builder.finding(finding_id, change_id, finding_revision, assertion_ref, subject_digest, state, summary)
    SELECT finding_id.value, run_row.change_id, finding_revision.value, p_assertion_ref,
      p_candidate_source_revision, 'OPEN', finding_text.summary
    FROM jsonb_array_elements_text(p_report->'findings') WITH ORDINALITY AS finding_text(summary, ordinal)
    JOIN unnest(p_finding_ids) WITH ORDINALITY AS finding_id(value, ordinal) USING (ordinal)
    JOIN unnest(p_finding_revisions) WITH ORDINALITY AS finding_revision(value, ordinal) USING (ordinal);
    UPDATE builder.change SET state = 'VERIFICATION_FAILED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id;
  ELSE
    UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION builder.fail_verification(p_actor_run_id uuid, p_admission_token uuid, p_failure_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.actor_run%ROWTYPE;
BEGIN
  UPDATE builder.actor_run SET state = 'FAILED', failure_code = CASE
    WHEN p_failure_code ~ '^[A-Z0-9_]{1,120}$' THEN p_failure_code ELSE 'BUILDER_VERIFIER_RUNTIME_FAILURE' END,
    updated_at = clock_timestamp()
  WHERE actor_run_id = p_actor_run_id AND admission_token = p_admission_token AND purpose = 'VERIFICATION'
    AND state IN ('ADMITTED', 'RUNNING') RETURNING * INTO run_row;
  IF FOUND THEN UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp()
    WHERE change_id = run_row.change_id AND state = 'VERIFYING'; END IF;
END;
$$;

CREATE FUNCTION builder.fail_verification_claim(p_change_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp()
  WHERE change_id = p_change_id AND state = 'RESULT_READY';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION builder.recover_and_list_queued() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE builder.actor_run SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state IN ('ADMITTED', 'RUNNING');
  UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE state = 'VERIFYING';
  UPDATE builder.change SET state = 'UNVERIFIED', updated_at = clock_timestamp() WHERE state = 'RESULT_READY';
  UPDATE builder.work_unit SET state = 'INTERRUPTED' WHERE state = 'RUNNING';
  UPDATE builder.plan SET item_state = 'INTERRUPTED' WHERE item_state = 'RUNNING';
  UPDATE builder.change SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state = 'RUNNING';
  RETURN QUERY SELECT stored.change_id FROM builder.change AS stored WHERE stored.state = 'QUEUED' ORDER BY stored.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION builder.read_snapshot(p_account_id uuid, p_project_id uuid, p_change_id uuid, p_require_source boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; plan_row builder.plan%ROWTYPE; unit builder.work_unit%ROWTYPE;
BEGIN
  IF p_require_source THEN PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
  ELSE PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id); END IF;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = p_change_id;
  SELECT * INTO STRICT unit FROM builder.work_unit WHERE change_id = p_change_id;
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
      'workUnits', jsonb_build_array(jsonb_build_object('workUnitId', unit.work_unit_id, 'state', unit.state,
        'actorRunIds', COALESCE((SELECT jsonb_agg(actor_run_id ORDER BY created_at) FROM builder.actor_run WHERE change_id = stored.change_id), '[]'::jsonb),
        'resultCommit', unit.result_commit)),
      'actorRuns', COALESCE((SELECT jsonb_agg(jsonb_build_object('actorRunId', actor_run_id, 'state', state,
        'lineageDisposition', lineage_disposition) ORDER BY created_at) FROM builder.actor_run WHERE change_id = stored.change_id), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION builder.list_findings(p_account_id uuid, p_project_id uuid, p_change_id uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM iam.admit_project_review(p_account_id, p_project_id); IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT jsonb_build_object('findingId', finding_id, 'changeId', change_id,
    'findingRevision', finding_revision, 'state', state, 'summary', summary)
  FROM builder.finding WHERE change_id = p_change_id AND EXISTS (
    SELECT 1 FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id
  ) ORDER BY created_at;
END;
$$;

CREATE FUNCTION builder.get_finding(p_account_id uuid, p_project_id uuid, p_change_id uuid, p_finding_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT value FROM builder.list_findings(p_account_id, p_project_id, p_change_id) AS value
  WHERE value->>'findingId' = p_finding_id::text LIMIT 1;
$$;

CREATE FUNCTION builder.list_evidence(p_account_id uuid, p_project_id uuid, p_change_id uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM iam.admit_project_review(p_account_id, p_project_id); IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT jsonb_build_object('evidenceId', evidence_id, 'changeId', change_id, 'claim', claim,
    'subjectDigest', subject_digest, 'provenance', to_jsonb(provenance))
  FROM builder.verification_evidence WHERE change_id = p_change_id AND EXISTS (
    SELECT 1 FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id
  ) ORDER BY created_at;
END;
$$;

CREATE FUNCTION builder.get_evidence(p_account_id uuid, p_project_id uuid, p_change_id uuid, p_evidence_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT value FROM builder.list_evidence(p_account_id, p_project_id, p_change_id) AS value
  WHERE value->>'evidenceId' = p_evidence_id::text LIMIT 1;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA builder FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA builder FROM PUBLIC;
RESET ROLE;

GRANT EXECUTE ON FUNCTION builder.list_findings(uuid,uuid,uuid), builder.get_finding(uuid,uuid,uuid,uuid),
  builder.list_evidence(uuid,uuid,uuid), builder.get_evidence(uuid,uuid,uuid,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_verification(uuid,uuid,uuid,text,text,text),
  builder.settle_verification(uuid,uuid,text,text,uuid,uuid,text,text,text,uuid,uuid[],uuid[],text,jsonb),
  builder.fail_verification(uuid,uuid,text), builder.fail_verification_claim(uuid) TO hub_rb_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA builder FROM hub_rb_ingress, hub_rb_executor;

COMMIT;
