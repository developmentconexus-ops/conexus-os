BEGIN;

DO $$ BEGIN
  CREATE ROLE hub_r2_key_conformance_subject LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SET LOCAL ROLE brain_owner;

-- R2-P4 ratified sourceScopeId as a SHA-256 digest over the closed Sankhya
-- source-scope basis. Correct the pre-ratification UUID assumption without
-- changing any other candidate-admission semantics.
DO $$
DECLARE
  definition text;
  corrected text;
BEGIN
  SELECT pg_get_functiondef('brn.admit_binding_candidate(jsonb)'::regprocedure)
    INTO definition;
  corrected := replace(
    definition,
    'OR (subject->>''sourceScopeId'')::uuid IS NULL',
    'OR subject->>''sourceScopeId'' !~ ''^[0-9a-f]{64}$'''
  );
  IF corrected = definition THEN
    RAISE EXCEPTION 'BRAIN_BINDING_SOURCE_SCOPE_CORRECTION_NOT_APPLIED'
      USING ERRCODE = 'P0001';
  END IF;
  EXECUTE corrected;
END;
$$;

RESET ROLE;

SET LOCAL ROLE connections_owner;

-- Connections owns containment, normalized connector configuration,
-- credential generation and qualification freshness. This port returns no
-- credential material and cannot attest or mutate any Connection state.
CREATE FUNCTION con.resolve_key_conformance_subject(
  p_project_id uuid,
  p_workspace_id uuid,
  p_connection_id uuid,
  p_connection_revision_id uuid,
  p_qualification_id uuid,
  p_environment text
) RETURNS TABLE(
  connection_id uuid,
  connection_revision_id uuid,
  qualification_id uuid,
  credential_generation bigint,
  environment text,
  company_code integer,
  connector_definition_id text,
  connector_version text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  revision con.connection_revision%ROWTYPE;
  latest_qualification con.connection_qualification%ROWTYPE;
  normalized_company_code integer;
BEGIN
  SELECT * INTO subject
  FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND (
      (candidate.owner_scope_kind = 'WORKSPACE'
        AND candidate.workspace_id = p_workspace_id)
      OR
      (candidate.owner_scope_kind = 'PROJECT'
        AND candidate.project_id = p_project_id)
    )
  FOR SHARE;

  IF NOT FOUND
    OR subject.current_revision_id IS DISTINCT FROM p_connection_revision_id
    OR subject.credential_generation IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO revision
  FROM con.connection_revision AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND candidate.connection_revision_id = p_connection_revision_id;

  IF NOT FOUND
    OR revision.connector_definition_id <> 'sankhya-om'
    OR revision.connector_version <> '1.0.0'
    OR jsonb_typeof(revision.configuration) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(revision.configuration)) <> 2
    OR NOT (revision.configuration ?& ARRAY['environment', 'companyCode'])
    OR jsonb_typeof(revision.configuration->'environment') <> 'string'
    OR jsonb_typeof(revision.configuration->'companyCode') <> 'number'
    OR revision.configuration->>'environment' NOT IN ('SANDBOX', 'PRODUCTION')
    OR revision.configuration->>'environment' IS DISTINCT FROM p_environment
    OR revision.configuration->>'companyCode' !~ '^[1-9][0-9]{0,9}$'
    OR (revision.configuration->>'companyCode')::numeric > 2147483647 THEN
    RETURN;
  END IF;
  normalized_company_code := (revision.configuration->>'companyCode')::integer;

  SELECT * INTO latest_qualification
  FROM con.connection_qualification AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND candidate.tested_at IS NOT NULL
  ORDER BY candidate.tested_at DESC, candidate.qualification_id DESC
  LIMIT 1
  FOR SHARE;

  IF NOT FOUND
    OR latest_qualification.qualification_id IS DISTINCT FROM p_qualification_id
    OR latest_qualification.connection_revision_id IS DISTINCT FROM p_connection_revision_id
    OR latest_qualification.credential_generation IS DISTINCT FROM subject.credential_generation
    OR latest_qualification.environment IS DISTINCT FROM p_environment
    OR latest_qualification.outcome <> 'PASSED' THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT subject.connection_id, revision.connection_revision_id,
    latest_qualification.qualification_id, subject.credential_generation,
    latest_qualification.environment, normalized_company_code,
    revision.connector_definition_id, revision.connector_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION con.resolve_key_conformance_subject(
  uuid, uuid, uuid, uuid, uuid, text
) FROM PUBLIC;

RESET ROLE;

SET LOCAL ROLE project_owner;

-- Project owns user authority, current Project state and the exact selected
-- Connection binding. The runtime supplies only registration coordinates;
-- every mutable subject fact is resolved afresh behind owner boundaries.
CREATE FUNCTION project.resolve_key_conformance_subject(
  p_account_id uuid,
  p_project_id uuid,
  p_connection_id uuid
) RETURNS TABLE(
  workspace_id uuid,
  project_id uuid,
  connection_id uuid,
  connection_revision_id uuid,
  qualification_id uuid,
  credential_generation bigint,
  environment text,
  company_code integer,
  connector_definition_id text,
  connector_version text,
  source_revision text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  admission record;
  stored_project project.project%ROWTYPE;
  binding project.connection_binding%ROWTYPE;
  resolved record;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'KEY_CONFORMANCE_SUBJECT_INPUT_REFUSED'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO admission
  FROM iam.admit_brain_binding(p_account_id, p_project_id);
  IF NOT FOUND OR admission.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF admission.permitted IS DISTINCT FROM true
    OR admission.connection_permitted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'KEY_CONFORMANCE_SUBJECT_DENIED'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO stored_project
  FROM project.project AS candidate
  WHERE candidate.project_id = p_project_id
    AND NOT candidate.archived
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM project.binding_source_intent AS intent
    WHERE intent.project_id = p_project_id
      AND intent.state IN ('PREPARING', 'APPLYING', 'ABORTING')
  ) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_IN_PROGRESS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO binding
  FROM project.connection_binding AS candidate
  WHERE candidate.project_id = p_project_id
    AND candidate.connection_id = p_connection_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KEY_CONFORMANCE_SUBJECT_BINDING_NOT_FOUND'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO resolved
  FROM con.resolve_key_conformance_subject(
    stored_project.project_id,
    stored_project.workspace_id,
    binding.connection_id,
    binding.connection_revision_id,
    binding.qualification_id,
    binding.environment
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'KEY_CONFORMANCE_SUBJECT_STALE'
      USING ERRCODE = 'P0412';
  END IF;

  RETURN QUERY SELECT stored_project.workspace_id, stored_project.project_id,
    resolved.connection_id, resolved.connection_revision_id,
    resolved.qualification_id, resolved.credential_generation,
    resolved.environment, resolved.company_code,
    resolved.connector_definition_id, resolved.connector_version,
    stored_project.source_revision;
END;
$$;

REVOKE EXECUTE ON FUNCTION project.resolve_key_conformance_subject(uuid, uuid, uuid)
  FROM PUBLIC;

RESET ROLE;

GRANT USAGE ON SCHEMA con TO project_owner;
GRANT EXECUTE ON FUNCTION con.resolve_key_conformance_subject(
  uuid, uuid, uuid, uuid, uuid, text
) TO project_owner;

GRANT USAGE ON SCHEMA project TO hub_r2_key_conformance_subject;
GRANT EXECUTE ON FUNCTION project.resolve_key_conformance_subject(uuid, uuid, uuid)
  TO hub_r2_key_conformance_subject;

DO $$ BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO hub_r2_key_conformance_subject',
    current_database()
  );
END $$;

COMMIT;
