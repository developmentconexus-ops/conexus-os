BEGIN;

DO $$ BEGIN
  CREATE ROLE hub_s6_inception_command LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON SCHEMA iam, project, workspace FROM PUBLIC;
GRANT USAGE ON SCHEMA iam, project TO hub_s6_inception_command;

SET LOCAL ROLE iam_owner;
GRANT EXECUTE ON FUNCTION iam.admit_project_manage(uuid, uuid) TO project_owner;
RESET ROLE;
SET LOCAL ROLE project_owner;

CREATE TABLE project.inception_idempotency (
  account_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES project.project(project_id) ON DELETE RESTRICT,
  key_digest text NOT NULL CHECK (key_digest ~ '^[0-9a-f]{64}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  attempt_id uuid NOT NULL,
  source_revision text NOT NULL CHECK (source_revision ~ '\S'),
  outcome text NOT NULL CHECK (outcome IN ('RESERVED', 'SUCCEEDED')),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (account_id, project_id, key_digest),
  CHECK (
    (outcome = 'RESERVED' AND response_body IS NULL AND completed_at IS NULL)
    OR (outcome = 'SUCCEEDED' AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE FUNCTION project.reserve_or_replay_inception(
  p_account_id uuid,
  p_project_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_attempt_id uuid,
  p_prior_candidate_digest text
) RETURNS TABLE(state text, source_revision text, response_body jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_source_revision text;
  receipt project.inception_idempotency%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PRJ07_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  SELECT stored_project.source_revision INTO STRICT current_source_revision
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id AND NOT stored_project.archived;
  IF p_prior_candidate_digest IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM project.baseline_candidate AS candidate
    WHERE candidate.project_id = p_project_id AND candidate.candidate_digest = p_prior_candidate_digest
  ) THEN
    RAISE EXCEPTION 'PRJ07_PRIOR_CANDIDATE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO project.inception_idempotency (
    account_id, project_id, key_digest, request_digest, attempt_id, source_revision, outcome
  ) VALUES (
    p_account_id, p_project_id, p_key_digest, p_request_digest, p_attempt_id, current_source_revision, 'RESERVED'
  ) ON CONFLICT (account_id, project_id, key_digest) DO NOTHING;
  SELECT * INTO STRICT receipt FROM project.inception_idempotency AS stored_receipt
  WHERE stored_receipt.account_id = p_account_id AND stored_receipt.project_id = p_project_id
    AND stored_receipt.key_digest = p_key_digest FOR UPDATE;
  IF receipt.request_digest <> p_request_digest THEN
    RETURN QUERY SELECT 'CONFLICT'::text, receipt.source_revision, NULL::jsonb;
  ELSIF receipt.outcome = 'SUCCEEDED' THEN
    RETURN QUERY SELECT 'REPLAY'::text, receipt.source_revision, receipt.response_body;
  ELSIF receipt.attempt_id <> p_attempt_id THEN
    RETURN QUERY SELECT 'IN_PROGRESS'::text, receipt.source_revision, NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'RESERVED'::text, receipt.source_revision, NULL::jsonb;
  END IF;
END;
$$;

CREATE FUNCTION project.complete_inception(
  p_account_id uuid,
  p_project_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_attempt_id uuid,
  p_source_revision text,
  p_candidate_digest text,
  p_source_text text,
  p_application_runtime_profile text,
  p_response_body jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  receipt project.inception_idempotency%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PRJ07_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT receipt FROM project.inception_idempotency AS stored_receipt
  WHERE stored_receipt.account_id = p_account_id AND stored_receipt.project_id = p_project_id
    AND stored_receipt.key_digest = p_key_digest FOR UPDATE;
  IF receipt.request_digest <> p_request_digest OR receipt.attempt_id <> p_attempt_id OR
     receipt.source_revision <> p_source_revision THEN
    RAISE EXCEPTION 'PRJ07_RECEIPT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.outcome = 'SUCCEEDED' THEN RETURN receipt.response_body; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM project.project AS stored_project
    WHERE stored_project.project_id = p_project_id AND NOT stored_project.archived
      AND stored_project.source_revision = p_source_revision
  ) THEN
    RAISE EXCEPTION 'PRJ07_SOURCE_STALE' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO project.baseline_candidate (
    project_id, candidate_digest, source_revision, source_text, application_runtime_profile
  ) VALUES (
    p_project_id, p_candidate_digest, p_source_revision, p_source_text, p_application_runtime_profile
  ) ON CONFLICT (project_id, candidate_digest) DO NOTHING;
  INSERT INTO project.baseline_state (project_id, current_candidate_digest)
  VALUES (p_project_id, p_candidate_digest)
  ON CONFLICT (project_id) DO UPDATE SET current_candidate_digest = EXCLUDED.current_candidate_digest,
    updated_at = clock_timestamp();
  UPDATE project.inception_idempotency SET outcome = 'SUCCEEDED', response_body = p_response_body,
    completed_at = clock_timestamp()
  WHERE account_id = p_account_id AND project_id = p_project_id AND key_digest = p_key_digest;
  RETURN p_response_body;
END;
$$;

CREATE FUNCTION project.abandon_inception(
  p_account_id uuid, p_project_id uuid, p_key_digest text, p_attempt_id uuid
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  DELETE FROM project.inception_idempotency AS receipt
  WHERE receipt.account_id = p_account_id AND receipt.project_id = p_project_id
    AND receipt.key_digest = p_key_digest AND receipt.attempt_id = p_attempt_id
    AND receipt.outcome = 'RESERVED';
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA project FROM hub_s6_inception_command;
REVOKE EXECUTE ON FUNCTION project.reserve_or_replay_inception(uuid,uuid,text,text,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.complete_inception(uuid,uuid,text,text,uuid,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.abandon_inception(uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION project.reserve_or_replay_inception(uuid,uuid,text,text,uuid,text) TO hub_s6_inception_command;
GRANT EXECUTE ON FUNCTION project.complete_inception(uuid,uuid,text,text,uuid,text,text,text,text,jsonb) TO hub_s6_inception_command;
GRANT EXECUTE ON FUNCTION project.abandon_inception(uuid,uuid,text,uuid) TO hub_s6_inception_command;

RESET ROLE;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_s6_inception_command', current_database());
END $$;

COMMIT;
