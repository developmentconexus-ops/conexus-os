BEGIN;

-- Resolving a model needs to know which of the two shapes a credential takes before it decrypts
-- anything: an Anthropic OAuth token set builds a provider instance, because a bounded egress
-- fetch, the beta headers and the identity rewrite cannot ride a config object, while an API key
-- builds Mastra's native config object. The Hub's connection role holds no SELECT on the table,
-- by design, so it asks through a function like every other read in this schema.
--
-- read_current_generation already answers half of this. It stays, because the credential store's
-- refresh loop calls it on a path that must not care what kind of credential it is looking at.

SET LOCAL ROLE claude_connection_owner;

CREATE FUNCTION model_connection.read_connection_credential(p_connection_id uuid)
RETURNS TABLE(provider_id text, credential_kind text, current_generation bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT connection_row.provider_id, connection_row.credential_kind, connection_row.current_generation
  FROM model_connection.connection AS connection_row
  WHERE connection_row.connection_id = p_connection_id AND connection_row.state = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION model_connection.read_connection_credential(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_connection.read_connection_credential(uuid)
  TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;

RESET ROLE;

-- 056 read the run's provider straight off model_connection.connection. That check runs as
-- builder_owner, which holds no SELECT on that table, so every run created through this function
-- raised 42501 instead of either succeeding or refusing. The check now asks the same question
-- through the reader above, which is owned by the schema's own role and already granted to
-- builder_owner. The rest of the body is the definition 056 installed, unchanged.
SET LOCAL ROLE builder_owner;

CREATE OR REPLACE FUNCTION builder.create_builder_run_with_model(
  p_account_id uuid, p_project_id uuid, p_idempotency_digest text, p_request_digest text,
  p_trigger_message_id text, p_mode text, p_builder_run_id uuid,
  p_admission_id text, p_provider_id text, p_model_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE created jsonb; run_id uuid; run_row builder.builder_run%ROWTYPE; credential_provider_id text;
BEGIN
  IF p_admission_id IS NULL OR p_admission_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_provider_id IS NULL OR p_provider_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    OR p_model_id IS NULL OR p_model_id !~ '\S' OR p_model_id ~ 'latest|\*' THEN
    RAISE EXCEPTION 'BUILDER_MODEL_ADMISSION_REFUSED';
  END IF;
  created := builder.create_builder_run(
    p_account_id, p_project_id, p_idempotency_digest, p_request_digest,
    p_trigger_message_id, p_mode, p_builder_run_id, p_provider_id
  );
  IF created->>'modelConnectionId' IS NULL OR created->>'modelCredentialGeneration' IS NULL THEN
    RAISE EXCEPTION 'MODEL_CONNECTION_REQUIRED';
  END IF;
  run_id := (created->>'builderRunId')::uuid;
  SELECT credential.provider_id INTO credential_provider_id
  FROM builder.builder_run AS run
  CROSS JOIN LATERAL model_connection.read_connection_credential(run.model_connection_id) AS credential
  WHERE run.builder_run_id = run_id;
  IF credential_provider_id IS DISTINCT FROM p_provider_id THEN
    RAISE EXCEPTION 'MODEL_CONNECTION_PROVIDER_MISMATCH';
  END IF;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = run_id FOR UPDATE;
  IF run_row.model_admission_id IS NOT NULL AND (
    run_row.model_admission_id <> p_admission_id OR run_row.model_provider_id <> p_provider_id OR run_row.model_id <> p_model_id
  ) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  UPDATE builder.builder_run
  SET model_admission_id = p_admission_id, model_provider_id = p_provider_id, model_id = p_model_id
  WHERE builder_run_id = run_id AND model_admission_id IS NULL;
  SELECT * INTO run_row FROM builder.builder_run WHERE builder_run_id = run_id;
  RETURN jsonb_build_object(
    'builderRunId', run_row.builder_run_id, 'projectId', run_row.project_id,
    'state', run_row.state, 'phase', run_row.phase, 'mode', run_row.mode,
    'baseSourceRevision', run_row.base_source_revision,
    'resultSourceRevision', run_row.result_source_revision, 'resultKind', run_row.result_kind,
    'failureCode', run_row.failure_code, 'modelAdmissionId', run_row.model_admission_id,
    'modelProviderId', run_row.model_provider_id, 'modelId', run_row.model_id,
    'modelConnectionId', run_row.model_connection_id,
    'modelCredentialGeneration', run_row.model_credential_generation,
    'cancellationRequested', false
  );
END;
$$;

REVOKE ALL ON FUNCTION
  builder.create_builder_run_with_model(uuid, uuid, text, text, text, text, uuid, text, text, text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  builder.create_builder_run_with_model(uuid, uuid, text, text, text, text, uuid, text, text, text)
TO hub_rb_ingress;

RESET ROLE;

COMMIT;
