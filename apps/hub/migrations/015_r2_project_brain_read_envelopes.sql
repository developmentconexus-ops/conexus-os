BEGIN;

DO $$ BEGIN
  CREATE ROLE hub_r2_brain_attester LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SET LOCAL ROLE iam_owner;

-- BRN-14 is an ordinary read composition. Keep its two capability admission
-- facts separate and let the owner port preserve the 404/403 boundary.
CREATE FUNCTION iam.admit_project_brain_context(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  scope_exists boolean,
  project_read boolean,
  brain_read boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT stored_project.project_id, stored_project.workspace_id,
    project_grant.account_id IS NOT NULL AND membership.account_id IS NOT NULL,
    project_grant.account_id IS NOT NULL
      AND membership.account_id IS NOT NULL AND project_grant.can_read,
    membership.account_id IS NOT NULL AND membership.can_read_brain
  FROM project.project AS stored_project
  LEFT JOIN iam.account_project_grant AS project_grant
    ON project_grant.account_id = p_account_id
    AND project_grant.project_id = stored_project.project_id
  LEFT JOIN iam.workspace_membership AS membership
    ON membership.account_id = p_account_id
    AND membership.workspace_id = stored_project.workspace_id
  WHERE stored_project.project_id = p_project_id;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_project_brain_context(uuid, uuid) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE registry_owner;

CREATE FUNCTION reg.get_project_binding_update(
  p_workspace_id uuid,
  p_brain_revision_id uuid
) RETURNS TABLE(
  published_brain_revision_id uuid,
  update_available boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT artifact.published_revision_id,
    artifact.published_revision_id IS NOT NULL
      AND artifact.published_revision_id <> p_brain_revision_id
  FROM reg.artifact AS artifact
  WHERE artifact.workspace_id = p_workspace_id AND artifact.kind = 'brain';
$$;

-- Raw Registry owner port: exact adopted revision plus the currently
-- published revision identity. It does not derive Project applicability.
CREATE FUNCTION reg.get_project_brain_snapshot(
  p_workspace_id uuid,
  p_brain_revision_id uuid,
  p_brain_digest text
) RETURNS TABLE(
  workspace_id uuid,
  brain_revision_id uuid,
  brain_digest text,
  source_revision text,
  payload jsonb,
  published_brain_revision_id uuid,
  published_brain_digest text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT artifact.workspace_id, revision.artifact_revision_id, revision.digest,
    revision.source_revision, revision.payload, artifact.published_revision_id,
    published.digest
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision
    ON revision.artifact_id = artifact.artifact_id
    AND revision.artifact_revision_id = p_brain_revision_id
    AND revision.digest = p_brain_digest
    AND revision.availability = 'AVAILABLE'
  LEFT JOIN reg.artifact_revision AS published
    ON published.artifact_id = artifact.artifact_id
    AND published.artifact_revision_id = artifact.published_revision_id
  WHERE artifact.workspace_id = p_workspace_id AND artifact.kind = 'brain';
$$;

-- PRJ-11's validator has only the Workspace and requested immutable revision
-- coordinates at preflight. Resolve the authoritative digest/payload through
-- this Registry owner port before any proof is attempted.
CREATE FUNCTION reg.get_project_brain_candidate(
  p_workspace_id uuid,
  p_brain_revision_id uuid
) RETURNS TABLE(
  brain_revision_id uuid,
  brain_digest text,
  source_revision text,
  payload jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT revision.artifact_revision_id, revision.digest,
    revision.source_revision, revision.payload
  FROM reg.artifact AS artifact
  JOIN reg.artifact_revision AS revision
    ON revision.artifact_id = artifact.artifact_id
    AND revision.artifact_revision_id = p_brain_revision_id
    AND revision.availability = 'AVAILABLE'
  WHERE artifact.workspace_id = p_workspace_id AND artifact.kind = 'brain';
$$;

REVOKE EXECUTE ON FUNCTION reg.get_project_binding_update(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.get_project_brain_snapshot(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reg.get_project_brain_candidate(uuid, uuid) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE project_owner;

-- PRJ-10 is a Project administration read and therefore requires the exact
-- project.manage fact. A missing Project or binding returns no row; a known
-- Project without manage authority is denied without table disclosure.
CREATE FUNCTION project.get_project_brain_binding(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  current_project_source_revision text,
  brain_revision_id uuid,
  brain_digest text,
  project_binding_digest text,
  validation_state text,
  update_available boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  admission record;
BEGIN
  SELECT * INTO admission FROM iam.admit_brain_binding(p_account_id, p_project_id);
  IF NOT FOUND OR admission.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT stored_project FROM project.project AS candidate
  WHERE candidate.project_id = p_project_id;
  RETURN QUERY
  SELECT binding.project_id, stored_project.workspace_id, stored_project.source_revision,
    binding.brain_revision_id, binding.brain_digest, binding.project_binding_digest,
    binding.validation_state, COALESCE(update_projection.update_available, false)
  FROM project.brain_binding AS binding
  LEFT JOIN LATERAL reg.get_project_binding_update(
    stored_project.workspace_id, binding.brain_revision_id
  ) AS update_projection ON true
  WHERE binding.project_id = p_project_id;
END;
$$;

-- PRJ-11 admission is deliberately a preflight port. It returns the exact
-- Project/Workspace/current-source tuple before any Registry, realization or
-- physical-proof work is attempted.
CREATE FUNCTION project.admit_brain_binding_preflight(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  current_project_source_revision text,
  connection_permitted boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  admission record;
BEGIN
  SELECT * INTO admission FROM iam.admit_brain_binding(p_account_id, p_project_id);
  IF NOT FOUND OR admission.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.admit_project_manage(p_account_id, p_project_id)) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_MANAGE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF admission.permitted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT stored_project FROM project.project AS candidate
  WHERE candidate.project_id = p_project_id;
  IF stored_project.archived THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM project.binding_source_intent AS intent
    WHERE intent.project_id = p_project_id
      AND intent.state IN ('PREPARING', 'APPLYING', 'ABORTING')
  ) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_IN_PROGRESS' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY SELECT stored_project.project_id, stored_project.workspace_id,
    stored_project.source_revision, admission.connection_permitted;
END;
$$;

-- Raw Project owner port for BRN-14. The caller supplies only a Project id
-- already admitted by the Brain owner; this port never reads Git or invents a
-- current local realization closure.
CREATE FUNCTION project.get_project_brain_read_basis(
  p_project_id uuid,
  p_admitted_project_ids uuid[]
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  current_project_source_revision text,
  brain_revision_id uuid,
  brain_digest text,
  project_binding_digest text,
  validation_state text,
  update_available boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT binding.project_id, stored_project.workspace_id, stored_project.source_revision,
    binding.brain_revision_id, binding.brain_digest, binding.project_binding_digest,
    binding.validation_state, COALESCE(update_projection.update_available, false)
  FROM project.brain_binding AS binding
  JOIN project.project AS stored_project ON stored_project.project_id = binding.project_id
  LEFT JOIN LATERAL reg.get_project_binding_update(
    stored_project.workspace_id, binding.brain_revision_id
  ) AS update_projection ON true
  WHERE binding.project_id = p_project_id
    AND binding.project_id = ANY(p_admitted_project_ids);
$$;

REVOKE EXECUTE ON FUNCTION project.get_project_brain_binding(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.admit_brain_binding_preflight(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.get_project_brain_read_basis(uuid, uuid[]) FROM PUBLIC;
RESET ROLE;

SET LOCAL ROLE connections_owner;

-- Connections validates only the exact Connection-owned state supplied by
-- Project. Project remains responsible for proving that this tuple is its
-- exact current binding before calling this port.
CREATE OR REPLACE FUNCTION con.admit_brain_proof_subject(
  p_project_id uuid, p_workspace_id uuid, p_connection_id uuid,
  p_connection_revision_id uuid, p_qualification_id uuid,
  p_credential_generation bigint, p_environment text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  subject con.connection%ROWTYPE;
  revision con.connection_revision%ROWTYPE;
  latest_qualification con.connection_qualification%ROWTYPE;
BEGIN
  SELECT * INTO subject FROM con.connection AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND ((candidate.owner_scope_kind = 'WORKSPACE' AND candidate.workspace_id = p_workspace_id)
      OR (candidate.owner_scope_kind = 'PROJECT' AND candidate.project_id = p_project_id))
  FOR SHARE;
  IF NOT FOUND OR subject.current_revision_id IS DISTINCT FROM p_connection_revision_id
    OR subject.credential_generation IS DISTINCT FROM p_credential_generation THEN
    RETURN false;
  END IF;
  SELECT * INTO revision FROM con.connection_revision AS candidate
  WHERE candidate.connection_id = p_connection_id
    AND candidate.connection_revision_id = p_connection_revision_id;
  IF NOT FOUND OR revision.configuration->>'environment' IS DISTINCT FROM p_environment THEN
    RETURN false;
  END IF;
  SELECT * INTO latest_qualification FROM con.connection_qualification AS candidate
  WHERE candidate.connection_id = p_connection_id AND candidate.tested_at IS NOT NULL
  ORDER BY candidate.tested_at DESC, candidate.qualification_id DESC LIMIT 1
  FOR SHARE;
  RETURN FOUND AND latest_qualification.qualification_id = p_qualification_id
    AND latest_qualification.connection_revision_id = p_connection_revision_id
    AND latest_qualification.credential_generation IS NOT DISTINCT FROM p_credential_generation
    AND latest_qualification.environment IS NOT DISTINCT FROM p_environment
    AND latest_qualification.outcome = 'PASSED';
END;
$$;

RESET ROLE;

SET LOCAL ROLE project_owner;

-- Project owns the exact Connection binding. Check that tuple locally before
-- asking Connections to validate only its current revision, qualification,
-- credential generation and environment state.
CREATE OR REPLACE FUNCTION project.prepare_brain_binding(
  p_account_id uuid, p_project_id uuid, p_brain_revision_id uuid,
  p_brain_digest text, p_expected_current jsonb, p_candidate jsonb,
  p_project_binding_digest text, p_binding_validation_id uuid
) RETURNS TABLE(source_revision text, declaration jsonb, result jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project project.project%ROWTYPE;
  existing project.brain_binding%ROWTYPE;
  admission record;
  proof jsonb;
  expected_state text;
BEGIN
  IF p_account_id IS NULL OR p_project_id IS NULL OR p_brain_revision_id IS NULL
    OR p_binding_validation_id IS NULL
    OR p_brain_digest !~ '^[0-9a-f]{64}$' OR p_project_binding_digest !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_expected_current) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_candidate) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO admission FROM iam.admit_brain_binding(p_account_id, p_project_id);
  IF NOT FOUND OR admission.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF admission.permitted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO stored_project FROM project.project WHERE project_id = p_project_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT brn.admit_binding_candidate(p_candidate) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CANDIDATE_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF NOT brn.admit_binding_validation(p_binding_validation_id, p_project_id, p_brain_revision_id,
    p_brain_digest, p_project_binding_digest, p_candidate) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_VALIDATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT reg.admit_project_brain_revision(stored_project.workspace_id, p_brain_revision_id,
    p_brain_digest, p_candidate) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_REVISION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  expected_state := p_expected_current->>'state';
  IF expected_state = 'ABSENT' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(p_expected_current)) <> 1 THEN
      RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_REFUSED' USING ERRCODE = '22023';
    END IF;
  ELSIF expected_state = 'PRESENT' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(p_expected_current)) <> 2
      OR p_expected_current->>'projectBindingDigest' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_REFUSED' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_REFUSED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO existing FROM project.brain_binding WHERE project_id = p_project_id FOR SHARE;
  IF expected_state = 'ABSENT' AND FOUND THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
  ELSIF expected_state = 'PRESENT' AND (NOT FOUND
    OR existing.project_binding_digest <> p_expected_current->>'projectBindingDigest') THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CURRENT_MISMATCH' USING ERRCODE = 'P0412';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_candidate)) <> 11
    OR NOT (p_candidate ?& ARRAY['schemaVersion','validationState','projectId','workspaceId',
      'brainRevisionId','brainDigest','sourceRevision','inputDigest','manifestDigest',
      'applicableItemIds','proofs'])
    OR p_candidate->>'schemaVersion' <> 'conexus-brain-binding-validation/v1'
    OR p_candidate->>'validationState' <> 'VALID'
    OR p_candidate->>'projectId' <> p_project_id::text
    OR p_candidate->>'workspaceId' <> stored_project.workspace_id::text
    OR p_candidate->>'brainRevisionId' <> p_brain_revision_id::text
    OR p_candidate->>'brainDigest' <> p_brain_digest
    OR p_candidate->>'sourceRevision' <> stored_project.source_revision
    OR p_candidate->>'inputDigest' !~ '^[0-9a-f]{64}$'
    OR p_candidate->>'manifestDigest' !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_candidate->'proofs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_candidate->'applicableItemIds') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CANDIDATE_REFUSED' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_candidate->'proofs') > 0
    AND admission.connection_permitted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CONNECTION_USE_DENIED' USING ERRCODE = '42501';
  END IF;
  FOR proof IN SELECT value FROM jsonb_array_elements(p_candidate->'proofs') LOOP
    IF jsonb_typeof(proof) IS DISTINCT FROM 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(proof)) <> 13
      OR NOT (proof ?& ARRAY['assertionId','itemId','predicateVersion','outcome','registration',
        'registrationDigest','subject','subjectDigest','observationId','coherence','counts','empty','proofDigest'])
      OR proof->>'predicateVersion' <> '1' OR proof->>'outcome' <> 'PASS'
      OR jsonb_typeof(proof->'registration') IS DISTINCT FROM 'object'
      OR jsonb_typeof(proof->'subject') IS DISTINCT FROM 'object'
      OR proof->'registration'->>'projectId' <> p_project_id::text
      OR proof->'registration'->>'workspaceId' <> stored_project.workspace_id::text
      OR proof->'subject'->>'projectId' <> p_project_id::text
      OR proof->'subject'->>'workspaceId' <> stored_project.workspace_id::text
      OR proof->'registration'->>'connectionId' <> proof->'subject'->>'connectionId'
      OR proof->'registration'->>'environment' <> proof->'subject'->>'environment'
      OR proof->'subject'->>'sourceRevision' <> stored_project.source_revision
      OR proof->'subject'->>'inputDigest' <> p_candidate->>'inputDigest'
      OR proof->>'registrationDigest' !~ '^[0-9a-f]{64}$'
      OR proof->>'subjectDigest' !~ '^[0-9a-f]{64}$'
      OR proof->>'proofDigest' !~ '^[0-9a-f]{64}$'
      OR NOT EXISTS (
        SELECT 1 FROM project.connection_binding AS binding
        WHERE binding.project_id = p_project_id
          AND binding.connection_id = (proof->'subject'->>'connectionId')::uuid
          AND binding.connection_revision_id = (proof->'subject'->>'connectionRevisionId')::uuid
          AND binding.qualification_id = (proof->'subject'->>'qualificationId')::uuid
          AND binding.environment = proof->'subject'->>'environment'
      )
      OR NOT con.admit_brain_proof_subject(
        p_project_id, stored_project.workspace_id,
        (proof->'subject'->>'connectionId')::uuid,
        (proof->'subject'->>'connectionRevisionId')::uuid,
        (proof->'subject'->>'qualificationId')::uuid,
        (proof->'subject'->>'credentialGeneration')::bigint,
        proof->'subject'->>'environment') THEN
      RAISE EXCEPTION 'PROJECT_BRAIN_PROOF_REFUSED' USING ERRCODE = 'P0412';
    END IF;
  END LOOP;
  RETURN QUERY SELECT stored_project.source_revision, p_candidate,
    jsonb_build_object('brainRevisionId', p_brain_revision_id, 'brainDigest', p_brain_digest,
      'projectBindingDigest', p_project_binding_digest, 'validationState', 'VALID',
      'updateAvailable', false);
END;
$$;

RESET ROLE;

SET LOCAL ROLE brain_owner;

-- A validation is an immutable observation owned by one settlement attempt.
-- Equal candidates may therefore be attested again under a fresh identity:
-- this preserves the single validation/intent UUID for each attempt while
-- allowing a safe retry after an earlier attempt reached a terminal state.
ALTER TABLE brn.binding_validation
  DROP CONSTRAINT binding_validation_project_id_project_binding_digest_key;

CREATE INDEX binding_validation_project_digest
  ON brn.binding_validation(project_id, project_binding_digest);

CREATE OR REPLACE FUNCTION brn.persist_binding_validation(
  p_binding_validation_id uuid, p_project_id uuid, p_brain_revision_id uuid,
  p_brain_digest text, p_project_binding_digest text, p_candidate jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored brn.binding_validation%ROWTYPE;
BEGIN
  IF p_binding_validation_id IS NULL OR p_project_id IS NULL OR p_brain_revision_id IS NULL
    OR p_brain_digest !~ '^[0-9a-f]{64}$' OR p_project_binding_digest !~ '^[0-9a-f]{64}$'
    OR NOT brn.admit_binding_candidate(p_candidate)
    OR (SELECT count(*) FROM jsonb_object_keys(p_candidate)) <> 11
    OR NOT (p_candidate ?& ARRAY['schemaVersion','validationState','projectId','workspaceId',
      'brainRevisionId','brainDigest','sourceRevision','inputDigest','manifestDigest',
      'applicableItemIds','proofs'])
    OR p_candidate->>'schemaVersion' <> 'conexus-brain-binding-validation/v1'
    OR p_candidate->>'validationState' <> 'VALID'
    OR p_candidate->>'projectId' <> p_project_id::text
    OR p_candidate->>'brainRevisionId' <> p_brain_revision_id::text
    OR p_candidate->>'brainDigest' <> p_brain_digest
    OR jsonb_typeof(p_candidate->'proofs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_candidate->'applicableItemIds') IS DISTINCT FROM 'array'
    OR encode(sha256(convert_to(brn.canonical_binding_json(p_candidate), 'UTF8')), 'hex')
      <> p_project_binding_digest THEN
    RAISE EXCEPTION 'BRAIN_BINDING_VALIDATION_REFUSED' USING ERRCODE = '22023';
  END IF;
  INSERT INTO brn.binding_validation(
    binding_validation_id, project_id, brain_revision_id, brain_digest,
    project_binding_digest, validation_state, candidate
  ) VALUES (
    p_binding_validation_id, p_project_id, p_brain_revision_id, p_brain_digest,
    p_project_binding_digest, 'VALID', p_candidate
  ) ON CONFLICT (binding_validation_id) DO NOTHING;
  SELECT * INTO STRICT stored FROM brn.binding_validation
    WHERE binding_validation_id = p_binding_validation_id;
  IF stored.project_id <> p_project_id OR stored.brain_revision_id <> p_brain_revision_id
    OR stored.brain_digest <> p_brain_digest
    OR stored.project_binding_digest <> p_project_binding_digest
    OR stored.validation_state <> 'VALID' OR stored.candidate IS DISTINCT FROM p_candidate THEN
    RAISE EXCEPTION 'BRAIN_BINDING_VALIDATION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION brn.get_project_binding_attestation(
  p_project_id uuid,
  p_brain_revision_id uuid,
  p_brain_digest text,
  p_project_binding_digest text
) RETURNS TABLE(validation_state text, candidate jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT validation.validation_state, validation.candidate
  FROM brn.binding_validation AS validation
  WHERE validation.project_id = p_project_id
    AND validation.brain_revision_id = p_brain_revision_id
    AND validation.brain_digest = p_brain_digest
    AND validation.project_binding_digest = p_project_binding_digest
  ORDER BY validation.validated_at DESC, validation.binding_validation_id DESC
  LIMIT 1;
$$;

-- BRN-14 raw owner basis. This is intentionally not the final Product
-- presentation: callers receive authoritative inputs and must still perform
-- the typed source/attestation/health/local-realization checks in the Brain
-- owner. Candidate sourceRevision and current Project sourceRevision remain
-- separate fields so this port never claims that a binding commit proves the
-- candidate's source closure is current.
CREATE FUNCTION brn.get_project_brain_basis(
  p_account_id uuid,
  p_project_id uuid
) RETURNS TABLE(
  project_id uuid,
  workspace_id uuid,
  current_project_source_revision text,
  brain_revision_id uuid,
  brain_digest text,
  project_binding_digest text,
  validation_state text,
  update_available boolean,
  validation_source_revision text,
  validation_candidate jsonb,
  revision_source_revision text,
  revision_payload jsonb,
  published_brain_revision_id uuid,
  published_brain_digest text,
  health_snapshot_digest text,
  health_items jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  admission record;
  binding record;
  snapshot record;
  attestation record;
  health record;
BEGIN
  SELECT * INTO admission
  FROM iam.admit_project_brain_context(p_account_id, p_project_id);
  IF NOT FOUND OR admission.scope_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CONTEXT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF admission.project_read IS DISTINCT FROM true
    OR admission.brain_read IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_CONTEXT_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO binding
  FROM project.get_project_brain_read_basis(p_project_id, ARRAY[p_project_id]::uuid[]);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO snapshot FROM reg.get_project_brain_snapshot(
    binding.workspace_id, binding.brain_revision_id, binding.brain_digest
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_REVISION_UNAVAILABLE' USING ERRCODE = 'P0004';
  END IF;
  SELECT * INTO attestation FROM brn.get_project_binding_attestation(
    binding.project_id, binding.brain_revision_id, binding.brain_digest,
    binding.project_binding_digest
  );
  IF NOT FOUND OR attestation.validation_state IS DISTINCT FROM 'VALID'
    OR jsonb_typeof(attestation.candidate) IS DISTINCT FROM 'object'
    OR attestation.candidate->>'projectId' IS DISTINCT FROM binding.project_id::text
    OR attestation.candidate->>'workspaceId' IS DISTINCT FROM binding.workspace_id::text
    OR attestation.candidate->>'brainRevisionId' IS DISTINCT FROM binding.brain_revision_id::text
    OR attestation.candidate->>'brainDigest' IS DISTINCT FROM binding.brain_digest
    OR jsonb_typeof(attestation.candidate->'sourceRevision') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_ATTESTATION_UNAVAILABLE' USING ERRCODE = 'P0004';
  END IF;
  SELECT * INTO health FROM brn.get_brain_health(
    binding.brain_revision_id, binding.brain_digest
  );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_HEALTH_UNAVAILABLE' USING ERRCODE = 'P0004';
  END IF;

  RETURN QUERY SELECT binding.project_id, binding.workspace_id,
    binding.current_project_source_revision, binding.brain_revision_id,
    binding.brain_digest, binding.project_binding_digest, binding.validation_state,
    binding.update_available, attestation.candidate->>'sourceRevision',
    attestation.candidate, snapshot.source_revision, snapshot.payload,
    snapshot.published_brain_revision_id, snapshot.published_brain_digest,
    health.health_snapshot_digest, health.items;
END;
$$;

REVOKE EXECUTE ON FUNCTION brn.get_project_binding_attestation(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION brn.get_project_brain_basis(uuid, uuid) FROM PUBLIC;
RESET ROLE;

-- Runtime roles receive only narrow owner ports. The independent attester can
-- read one immutable Brain candidate and persist one validated candidate; it
-- receives no Project settlement, Brain publication, health-write or table
-- capability.
GRANT USAGE ON SCHEMA reg TO project_owner;
GRANT EXECUTE ON FUNCTION reg.get_project_binding_update(uuid, uuid) TO project_owner;
GRANT USAGE ON SCHEMA project TO hub_s3_read, hub_r2_project_binding, brain_owner;
GRANT EXECUTE ON FUNCTION project.get_project_brain_binding(uuid, uuid)
  TO hub_r2_project_binding;
GRANT EXECUTE ON FUNCTION project.admit_brain_binding_preflight(uuid, uuid)
  TO hub_r2_project_binding;
GRANT EXECUTE ON FUNCTION project.get_project_brain_read_basis(uuid, uuid[]) TO brain_owner;
GRANT USAGE ON SCHEMA iam TO brain_owner;
GRANT EXECUTE ON FUNCTION iam.admit_project_brain_context(uuid, uuid) TO brain_owner;
GRANT USAGE ON SCHEMA reg TO brain_owner;
GRANT EXECUTE ON FUNCTION reg.get_project_brain_snapshot(uuid, uuid, text) TO brain_owner;
REVOKE EXECUTE ON FUNCTION reg.get_project_brain_candidate(uuid, uuid) FROM hub_r2_brain_bootstrap;
REVOKE EXECUTE ON FUNCTION brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)
  FROM hub_r2_brain_bootstrap;
REVOKE EXECUTE ON FUNCTION reg.get_project_brain_candidate(uuid, uuid) FROM hub_r2_project_binding;
REVOKE EXECUTE ON FUNCTION brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)
  FROM hub_r2_project_binding;
REVOKE USAGE ON SCHEMA reg, brn FROM hub_r2_project_binding;
GRANT USAGE ON SCHEMA reg, brn TO hub_r2_brain_attester;
GRANT EXECUTE ON FUNCTION reg.get_project_brain_candidate(uuid, uuid)
  TO hub_r2_brain_attester;
GRANT EXECUTE ON FUNCTION brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)
  TO hub_r2_brain_attester;
GRANT USAGE ON SCHEMA brn TO hub_r2_brain_read;
GRANT EXECUTE ON FUNCTION brn.get_project_brain_basis(uuid, uuid) TO hub_r2_brain_read;

DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hub_s3_read, hub_r2_brain_attester, hub_r2_brain_read, hub_r2_project_binding', current_database());
END $$;

COMMIT;
