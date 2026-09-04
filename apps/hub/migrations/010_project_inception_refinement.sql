BEGIN;

SET LOCAL ROLE project_owner;

ALTER TABLE project.inception_idempotency
  ADD COLUMN prior_candidate_digest text,
  ADD CONSTRAINT inception_idempotency_prior_candidate_digest_check CHECK (
    prior_candidate_digest IS NULL OR prior_candidate_digest ~ '^[0-9a-f]{64}$'
  );

DROP FUNCTION project.reserve_or_replay_inception(uuid,uuid,text,text,uuid,text);
DROP FUNCTION project.complete_inception(uuid,uuid,text,text,uuid,text,text,text,text,jsonb);

CREATE FUNCTION project.reserve_or_replay_inception(
  p_account_id uuid,
  p_project_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_attempt_id uuid,
  p_prior_candidate_digest text
) RETURNS TABLE(
  state text,
  source_revision text,
  response_body jsonb,
  prior_candidate_digest text,
  prior_source_text text,
  prior_application_runtime_profile text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_source_revision text;
  current_candidate_digest text;
  prior_candidate project.baseline_candidate%ROWTYPE;
  receipt project.inception_idempotency%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PRJ07_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  SELECT stored_project.source_revision INTO STRICT current_source_revision
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id AND NOT stored_project.archived;

  INSERT INTO project.inception_idempotency (
    account_id, project_id, key_digest, request_digest, attempt_id,
    source_revision, prior_candidate_digest, outcome
  ) VALUES (
    p_account_id, p_project_id, p_key_digest, p_request_digest, p_attempt_id,
    current_source_revision, p_prior_candidate_digest, 'RESERVED'
  ) ON CONFLICT (account_id, project_id, key_digest) DO NOTHING;

  SELECT * INTO STRICT receipt FROM project.inception_idempotency AS stored_receipt
  WHERE stored_receipt.account_id = p_account_id AND stored_receipt.project_id = p_project_id
    AND stored_receipt.key_digest = p_key_digest FOR UPDATE;
  IF receipt.request_digest <> p_request_digest OR
     receipt.prior_candidate_digest IS DISTINCT FROM p_prior_candidate_digest THEN
    RETURN QUERY SELECT 'CONFLICT'::text, receipt.source_revision, NULL::jsonb,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  ELSIF receipt.outcome = 'SUCCEEDED' THEN
    RETURN QUERY SELECT 'REPLAY'::text, receipt.source_revision, receipt.response_body,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  ELSIF receipt.attempt_id <> p_attempt_id THEN
    RETURN QUERY SELECT 'IN_PROGRESS'::text, receipt.source_revision, NULL::jsonb,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF receipt.prior_candidate_digest IS NULL THEN
    RETURN QUERY SELECT 'RESERVED'::text, receipt.source_revision, NULL::jsonb,
      NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO prior_candidate
  FROM project.baseline_candidate AS candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.candidate_digest = receipt.prior_candidate_digest;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRJ07_PRIOR_CANDIDATE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT stored_state.current_candidate_digest INTO current_candidate_digest
  FROM project.baseline_state AS stored_state
  WHERE stored_state.project_id = p_project_id;
  IF NOT FOUND OR current_candidate_digest <> receipt.prior_candidate_digest OR
     prior_candidate.source_revision <> current_source_revision THEN
    RAISE EXCEPTION 'PRJ07_PRIOR_CANDIDATE_STALE' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT 'RESERVED'::text, receipt.source_revision, NULL::jsonb,
    prior_candidate.candidate_digest, prior_candidate.source_text,
    prior_candidate.application_runtime_profile;
END;
$$;

CREATE FUNCTION project.complete_inception(
  p_account_id uuid,
  p_project_id uuid,
  p_key_digest text,
  p_request_digest text,
  p_attempt_id uuid,
  p_source_revision text,
  p_prior_candidate_digest text,
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
  current_source_revision text;
  current_candidate_digest text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PRJ07_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT receipt FROM project.inception_idempotency AS stored_receipt
  WHERE stored_receipt.account_id = p_account_id AND stored_receipt.project_id = p_project_id
    AND stored_receipt.key_digest = p_key_digest FOR UPDATE;
  IF receipt.request_digest <> p_request_digest OR receipt.attempt_id <> p_attempt_id OR
     receipt.source_revision <> p_source_revision OR
     receipt.prior_candidate_digest IS DISTINCT FROM p_prior_candidate_digest THEN
    RAISE EXCEPTION 'PRJ07_RECEIPT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  IF receipt.outcome = 'SUCCEEDED' THEN RETURN receipt.response_body; END IF;

  SELECT stored_project.source_revision INTO current_source_revision
  FROM project.project AS stored_project
  WHERE stored_project.project_id = p_project_id AND NOT stored_project.archived
  FOR UPDATE;
  IF NOT FOUND OR current_source_revision <> p_source_revision THEN
    RAISE EXCEPTION 'PRJ07_SOURCE_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF p_prior_candidate_digest IS NOT NULL THEN
    SELECT stored_state.current_candidate_digest INTO current_candidate_digest
    FROM project.baseline_state AS stored_state
    WHERE stored_state.project_id = p_project_id FOR UPDATE;
    IF NOT FOUND OR current_candidate_digest <> p_prior_candidate_digest OR NOT EXISTS (
      SELECT 1 FROM project.baseline_candidate AS candidate
      WHERE candidate.project_id = p_project_id
        AND candidate.candidate_digest = p_prior_candidate_digest
        AND candidate.source_revision = p_source_revision
    ) THEN
      RAISE EXCEPTION 'PRJ07_PRIOR_CANDIDATE_STALE' USING ERRCODE = 'P0001';
    END IF;
    IF p_candidate_digest = p_prior_candidate_digest THEN
      RAISE EXCEPTION 'PRJ07_REFINEMENT_NO_CHANGE' USING ERRCODE = 'P0001';
    END IF;
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

REVOKE EXECUTE ON FUNCTION project.reserve_or_replay_inception(uuid,uuid,text,text,uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.complete_inception(uuid,uuid,text,text,uuid,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION project.reserve_or_replay_inception(uuid,uuid,text,text,uuid,text) TO hub_s6_inception_command;
GRANT EXECUTE ON FUNCTION project.complete_inception(uuid,uuid,text,text,uuid,text,text,text,text,text,jsonb) TO hub_s6_inception_command;

RESET ROLE;

COMMIT;
