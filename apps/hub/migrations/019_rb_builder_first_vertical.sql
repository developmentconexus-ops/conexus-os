BEGIN;

DO $$ BEGIN
  CREATE ROLE builder_owner NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_rb_ingress LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE hub_rb_executor LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SET LOCAL ROLE iam_owner;

CREATE TABLE iam.project_builder_grant (
  account_id uuid NOT NULL REFERENCES iam.account(account_id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  can_build boolean NOT NULL,
  can_read_source boolean NOT NULL,
  PRIMARY KEY (account_id, project_id)
);

INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source)
SELECT receipt.account_id, receipt.reserved_project_id, true, true
FROM project.operation_idempotency AS receipt
WHERE receipt.operation_id = 'PRJ-03' AND receipt.outcome = 'SUCCEEDED';

CREATE FUNCTION iam.ensure_project_builder_grant(p_account_id uuid, p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO iam.project_builder_grant(account_id, project_id, can_build, can_read_source)
  SELECT receipt.account_id, receipt.reserved_project_id, true, true
  FROM project.operation_idempotency AS receipt
  WHERE receipt.operation_id = 'PRJ-03' AND receipt.outcome = 'SUCCEEDED'
    AND receipt.account_id = p_account_id AND receipt.reserved_project_id = p_project_id
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION iam.admit_project_build(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(project_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT grant_row.project_id
  FROM iam.project_builder_grant AS grant_row
  JOIN project.project AS stored_project ON stored_project.project_id = grant_row.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = grant_row.account_id AND membership.workspace_id = stored_project.workspace_id
  WHERE grant_row.account_id = p_account_id AND grant_row.project_id = p_project_id AND grant_row.can_build;
$$;

CREATE FUNCTION iam.admit_project_source_read(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(project_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT grant_row.project_id
  FROM iam.project_builder_grant AS grant_row
  JOIN project.project AS stored_project ON stored_project.project_id = grant_row.project_id
  JOIN iam.workspace_membership AS membership
    ON membership.account_id = grant_row.account_id AND membership.workspace_id = stored_project.workspace_id
  WHERE grant_row.account_id = p_account_id AND grant_row.project_id = p_project_id AND grant_row.can_read_source;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_project_build(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.admit_project_source_read(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iam.ensure_project_builder_grant(uuid, uuid) FROM PUBLIC;

RESET ROLE;
CREATE SCHEMA builder AUTHORIZATION builder_owner;
GRANT USAGE ON SCHEMA iam, project TO builder_owner;
GRANT REFERENCES ON project.project TO builder_owner;
GRANT EXECUTE ON FUNCTION iam.admit_project_build(uuid, uuid), iam.admit_project_source_read(uuid, uuid),
  iam.ensure_project_builder_grant(uuid, uuid) TO builder_owner;
GRANT EXECUTE ON FUNCTION project.get_approved_baseline(uuid, uuid[]) TO builder_owner;

SET LOCAL ROLE builder_owner;

CREATE TABLE builder.operation_receipt (
  account_id uuid NOT NULL,
  project_id uuid NOT NULL,
  key_digest text NOT NULL CHECK (key_digest ~ '^[0-9a-f]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  change_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, project_id, key_digest)
);

CREATE TABLE builder.change (
  change_id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  created_by_account_id uuid NOT NULL,
  intent text NOT NULL CHECK (intent ~ '\S'),
  baseline_digest text NOT NULL CHECK (baseline_digest ~ '^[0-9a-f]{64}$'),
  base_source_revision text NOT NULL CHECK (base_source_revision ~ '^[0-9a-f]{40}$'),
  planning_depth text NOT NULL CHECK (planning_depth = 'DIRECT'),
  rigor_profile text NOT NULL CHECK (rigor_profile = 'CONTROLLED'),
  state text NOT NULL CHECK (state IN ('QUEUED', 'RUNNING', 'RESULT_READY', 'FAILED', 'INTERRUPTED')),
  candidate_source_revision text CHECK (candidate_source_revision ~ '^[0-9a-f]{40}$'),
  patch text,
  result_summary text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state = 'RESULT_READY') = (candidate_source_revision IS NOT NULL AND patch IS NOT NULL))
);

CREATE TABLE builder.plan (
  change_id uuid PRIMARY KEY REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  plan_revision uuid NOT NULL UNIQUE,
  item_id uuid NOT NULL UNIQUE,
  summary text NOT NULL CHECK (summary ~ '\S'),
  item_state text NOT NULL CHECK (item_state IN ('READY', 'RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED'))
);

CREATE TABLE builder.coding_session (
  coding_session_id uuid PRIMARY KEY,
  change_id uuid NOT NULL UNIQUE REFERENCES builder.change(change_id) ON DELETE RESTRICT
);

CREATE TABLE builder.work_unit (
  work_unit_id uuid PRIMARY KEY,
  change_id uuid NOT NULL UNIQUE REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('READY', 'RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED')),
  result_commit text CHECK (result_commit ~ '^[0-9a-f]{40}$')
);

CREATE TABLE builder.actor_run (
  actor_run_id uuid PRIMARY KEY,
  change_id uuid NOT NULL REFERENCES builder.change(change_id) ON DELETE RESTRICT,
  work_unit_id uuid NOT NULL REFERENCES builder.work_unit(work_unit_id) ON DELETE RESTRICT,
  admission_token uuid NOT NULL UNIQUE,
  lineage_disposition text NOT NULL CHECK (lineage_disposition = 'FRESH_BASE'),
  runtime_id text NOT NULL CHECK (runtime_id = 'mastra-native-e2b-v1'),
  model_admission_id text NOT NULL CHECK (model_admission_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  model_provider_id text NOT NULL CHECK (model_provider_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  model_id text NOT NULL CHECK (model_id ~ '\S' AND model_id !~* '(latest|\*)'),
  base_source_revision text NOT NULL CHECK (base_source_revision ~ '^[0-9a-f]{40}$'),
  sandbox_id text,
  state text NOT NULL CHECK (state IN ('ADMITTED', 'RUNNING', 'COMPLETED', 'FAILED', 'INTERRUPTED', 'QUARANTINED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX one_active_writer_per_change ON builder.actor_run(change_id)
WHERE state IN ('ADMITTED', 'RUNNING');

CREATE FUNCTION builder.change_json(row_value builder.change) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'changeId', row_value.change_id, 'projectId', row_value.project_id,
    'intent', row_value.intent, 'baselineDigest', row_value.baseline_digest,
    'planningDepth', row_value.planning_depth, 'rigorProfile', row_value.rigor_profile,
    'state', row_value.state
  );
$$;

CREATE FUNCTION builder.create_change(
  p_account_id uuid, p_project_id uuid, p_key_digest text, p_request_digest text,
  p_change_id uuid, p_plan_revision uuid, p_item_id uuid,
  p_coding_session_id uuid, p_work_unit_id uuid, p_intent text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE receipt builder.operation_receipt%ROWTYPE; baseline record; stored builder.change%ROWTYPE;
BEGIN
  IF p_intent !~ '\S' OR length(p_intent) > 20000 THEN RAISE EXCEPTION 'BLD03_INTENT_REFUSED' USING ERRCODE = 'P0001'; END IF;
  PERFORM iam.ensure_project_builder_grant(p_account_id, p_project_id);
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'BLD03_NOT_AUTHORIZED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO baseline FROM project.get_approved_baseline(p_project_id, ARRAY[p_project_id]);
  IF NOT FOUND OR baseline.source_revision !~ '^[0-9a-f]{40}$' THEN RAISE EXCEPTION 'BLD03_BASELINE_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO builder.operation_receipt(account_id, project_id, key_digest, request_digest, change_id)
  VALUES (p_account_id, p_project_id, p_key_digest, p_request_digest, p_change_id)
  ON CONFLICT DO NOTHING;
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
  INSERT INTO builder.plan VALUES (p_change_id, p_plan_revision, p_item_id, p_intent, 'READY');
  INSERT INTO builder.coding_session VALUES (p_coding_session_id, p_change_id);
  INSERT INTO builder.work_unit VALUES (p_work_unit_id, p_change_id, 'READY', NULL);
  RETURN builder.change_json(stored);
END;
$$;

CREATE FUNCTION builder.claim_change(
  p_change_id uuid, p_actor_run_id uuid, p_admission_token uuid,
  p_model_admission_id text, p_model_provider_id text, p_model_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
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
  INSERT INTO builder.actor_run VALUES (
    p_actor_run_id, p_change_id, unit.work_unit_id, p_admission_token, 'FRESH_BASE',
    'mastra-native-e2b-v1', p_model_admission_id, p_model_provider_id, p_model_id,
    stored.base_source_revision, NULL, 'ADMITTED', clock_timestamp(), clock_timestamp()
  );
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

CREATE FUNCTION builder.bind_sandbox(p_actor_run_id uuid, p_admission_token uuid, p_sandbox_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF p_sandbox_id !~ '^[A-Za-z0-9_-]{1,200}$' THEN RAISE EXCEPTION 'BUILDER_SANDBOX_ID_REFUSED' USING ERRCODE = 'P0001'; END IF;
  UPDATE builder.actor_run SET sandbox_id = p_sandbox_id, state = 'RUNNING', updated_at = clock_timestamp()
  WHERE actor_run_id = p_actor_run_id AND admission_token = p_admission_token AND state = 'ADMITTED';
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILDER_LATE_SANDBOX_REFUSED' USING ERRCODE = 'P0001'; END IF;
END;
$$;

CREATE FUNCTION builder.settle_result(
  p_actor_run_id uuid, p_admission_token uuid, p_sandbox_id text,
  p_base_source_revision text, p_candidate_source_revision text, p_patch text, p_summary text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.actor_run%ROWTYPE;
BEGIN
  SELECT * INTO STRICT run_row FROM builder.actor_run WHERE actor_run_id = p_actor_run_id FOR UPDATE;
  IF run_row.admission_token <> p_admission_token OR run_row.state <> 'RUNNING' OR
    run_row.sandbox_id <> p_sandbox_id OR run_row.base_source_revision <> p_base_source_revision OR
    p_candidate_source_revision !~ '^[0-9a-f]{40}$' OR octet_length(p_patch) > 8388608 THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'RUNNING';
    RETURN false;
  END IF;
  UPDATE builder.actor_run SET state = 'COMPLETED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
  UPDATE builder.work_unit SET state = 'COMPLETED', result_commit = p_candidate_source_revision WHERE work_unit_id = run_row.work_unit_id;
  UPDATE builder.plan SET item_state = 'COMPLETED' WHERE change_id = run_row.change_id;
  UPDATE builder.change SET state = 'RESULT_READY', candidate_source_revision = p_candidate_source_revision,
    patch = p_patch, result_summary = NULLIF(p_summary, ''), updated_at = clock_timestamp()
  WHERE change_id = run_row.change_id AND state = 'RUNNING';
  IF NOT FOUND THEN
    UPDATE builder.actor_run SET state = 'QUARANTINED', updated_at = clock_timestamp() WHERE actor_run_id = p_actor_run_id;
    UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
    UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
    UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id;
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION builder.fail_run(p_actor_run_id uuid, p_admission_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE run_row builder.actor_run%ROWTYPE;
BEGIN
  UPDATE builder.actor_run SET state = 'FAILED', updated_at = clock_timestamp()
  WHERE actor_run_id = p_actor_run_id AND admission_token = p_admission_token AND state IN ('ADMITTED', 'RUNNING') RETURNING * INTO run_row;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE builder.work_unit SET state = 'FAILED' WHERE work_unit_id = run_row.work_unit_id;
  UPDATE builder.plan SET item_state = 'FAILED' WHERE change_id = run_row.change_id;
  UPDATE builder.change SET state = 'FAILED', updated_at = clock_timestamp() WHERE change_id = run_row.change_id AND state = 'RUNNING';
END;
$$;

CREATE FUNCTION builder.recover_and_list_queued() RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE builder.actor_run SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state IN ('ADMITTED', 'RUNNING');
  UPDATE builder.work_unit SET state = 'INTERRUPTED' WHERE state = 'RUNNING';
  UPDATE builder.plan SET item_state = 'INTERRUPTED' WHERE item_state = 'RUNNING';
  UPDATE builder.change SET state = 'INTERRUPTED', updated_at = clock_timestamp() WHERE state = 'RUNNING';
  RETURN QUERY SELECT stored.change_id FROM builder.change AS stored WHERE stored.state = 'QUEUED' ORDER BY stored.created_at;
END;
$$;

CREATE FUNCTION builder.read_snapshot(p_account_id uuid, p_project_id uuid, p_change_id uuid, p_require_source boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE stored builder.change%ROWTYPE; plan_row builder.plan%ROWTYPE; unit builder.work_unit%ROWTYPE;
BEGIN
  IF p_require_source THEN
    PERFORM 1 FROM iam.admit_project_source_read(p_account_id, p_project_id);
    IF NOT FOUND THEN RETURN NULL; END IF;
  ELSE
    PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO stored FROM builder.change WHERE change_id = p_change_id AND project_id = p_project_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT plan_row FROM builder.plan WHERE change_id = p_change_id;
  SELECT * INTO STRICT unit FROM builder.work_unit WHERE change_id = p_change_id;
  RETURN jsonb_build_object(
    'change', builder.change_json(stored),
    'plan', jsonb_build_object('planRevision', plan_row.plan_revision, 'planningDepth', stored.planning_depth,
      'rigorProfile', stored.rigor_profile, 'items', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'summary', plan_row.summary, 'state', plan_row.item_state)),
      'dependencyEdges', jsonb_build_array(), 'acceptanceLinks', jsonb_build_array(), 'blockers', jsonb_build_array(), 'unknowns', jsonb_build_array(), 'progress', stored.state),
    'progress', jsonb_build_object('planRevision', plan_row.plan_revision,
      'items', jsonb_build_array(jsonb_build_object('itemId', plan_row.item_id, 'summary', plan_row.summary, 'state', plan_row.item_state)), 'overallState', stored.state),
    'diff', CASE WHEN stored.candidate_source_revision IS NULL THEN NULL ELSE jsonb_build_object(
      'baseSourceRevision', stored.base_source_revision, 'candidateSourceRevision', stored.candidate_source_revision, 'patch', stored.patch) END,
    'execution', jsonb_build_object('changeId', stored.change_id,
      'workUnits', jsonb_build_array(jsonb_build_object('workUnitId', unit.work_unit_id, 'state', unit.state,
        'actorRunIds', COALESCE((SELECT jsonb_agg(actor_run_id ORDER BY created_at) FROM builder.actor_run WHERE change_id = stored.change_id), '[]'::jsonb),
        'resultCommit', unit.result_commit)),
      'actorRuns', COALESCE((SELECT jsonb_agg(jsonb_build_object('actorRunId', actor_run_id, 'state', state, 'lineageDisposition', lineage_disposition) ORDER BY created_at) FROM builder.actor_run WHERE change_id = stored.change_id), '[]'::jsonb))
  );
END;
$$;

CREATE FUNCTION builder.list_changes(p_account_id uuid, p_project_id uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM iam.admit_project_build(p_account_id, p_project_id);
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT jsonb_build_object(
    'changeId', stored.change_id, 'projectId', stored.project_id,
    'intent', stored.intent, 'state', stored.state
  ) FROM builder.change AS stored
    WHERE stored.project_id = p_project_id ORDER BY stored.created_at DESC;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA builder FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA builder FROM PUBLIC;
RESET ROLE;

GRANT USAGE ON SCHEMA builder TO hub_rb_ingress, hub_rb_executor;
GRANT EXECUTE ON FUNCTION builder.create_change(uuid,uuid,text,text,uuid,uuid,uuid,uuid,uuid,text),
  builder.read_snapshot(uuid,uuid,uuid,boolean), builder.list_changes(uuid,uuid) TO hub_rb_ingress;
GRANT EXECUTE ON FUNCTION builder.claim_change(uuid,uuid,uuid,text,text,text), builder.bind_sandbox(uuid,uuid,text),
  builder.settle_result(uuid,uuid,text,text,text,text,text), builder.fail_run(uuid,uuid),
  builder.recover_and_list_queued() TO hub_rb_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA builder FROM hub_rb_ingress, hub_rb_executor;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_rb_ingress, hub_rb_executor', current_database());
END $$;

COMMIT;
