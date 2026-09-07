BEGIN;

SET LOCAL ROLE project_owner;

LOCK TABLE project.binding_source_intent IN SHARE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM project.binding_source_intent
    WHERE state IN ('PREPARING', 'APPLYING', 'ABORTING')) THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_MIGRATION_ACTIVE_INTENT' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER TABLE project.binding_source_intent
  ADD COLUMN operation_kind text NOT NULL DEFAULT 'CONNECTION'
    CHECK (operation_kind IN ('CONNECTION', 'BRAIN')),
  ADD COLUMN brain_revision_id uuid,
  ADD COLUMN brain_digest text CHECK (brain_digest ~ '^[0-9a-f]{64}$'),
  ALTER COLUMN connection_id DROP NOT NULL,
  ALTER COLUMN connection_revision_id DROP NOT NULL,
  ALTER COLUMN environment DROP NOT NULL,
  ADD CONSTRAINT binding_source_intent_operation_shape CHECK (
    (operation_kind = 'CONNECTION' AND connection_id IS NOT NULL
      AND connection_revision_id IS NOT NULL AND environment IS NOT NULL
      AND brain_revision_id IS NULL AND brain_digest IS NULL)
    OR
    (operation_kind = 'BRAIN' AND connection_id IS NULL
      AND connection_revision_id IS NULL AND environment IS NULL
      AND brain_revision_id IS NOT NULL AND brain_digest IS NOT NULL
      AND remove_binding = false)
  );

RESET ROLE;

SET LOCAL ROLE iam_owner;

CREATE FUNCTION iam.admit_brain_binding(p_account_id uuid, p_project_id uuid)
RETURNS TABLE(project_id uuid, workspace_id uuid, scope_exists boolean,
  permitted boolean, connection_permitted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  stored_project record;
  project_grant iam.account_project_grant%ROWTYPE;
  membership iam.workspace_membership%ROWTYPE;
BEGIN
  SELECT candidate.project_id, candidate.workspace_id INTO stored_project
  FROM project.project AS candidate WHERE candidate.project_id = p_project_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO project_grant FROM iam.account_project_grant AS candidate
  WHERE candidate.account_id = p_account_id AND candidate.project_id = p_project_id FOR SHARE;
  SELECT * INTO membership FROM iam.workspace_membership AS candidate
  WHERE candidate.account_id = p_account_id
    AND candidate.workspace_id = stored_project.workspace_id FOR SHARE;
  RETURN QUERY SELECT stored_project.project_id, stored_project.workspace_id,
    project_grant.account_id IS NOT NULL AND membership.account_id IS NOT NULL,
    project_grant.account_id IS NOT NULL AND membership.account_id IS NOT NULL
      AND project_grant.can_manage AND project_grant.can_bind_brain,
    project_grant.account_id IS NOT NULL AND membership.account_id IS NOT NULL
      AND project_grant.can_manage AND project_grant.can_use_connection;
END;
$$;

REVOKE EXECUTE ON FUNCTION iam.admit_brain_binding(uuid, uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA iam TO project_owner;
GRANT EXECUTE ON FUNCTION iam.admit_brain_binding(uuid, uuid) TO project_owner;

RESET ROLE;

SET LOCAL ROLE registry_owner;

CREATE FUNCTION reg.admit_project_brain_revision(
  p_workspace_id uuid, p_brain_revision_id uuid, p_brain_digest text, p_candidate jsonb
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM reg.artifact AS artifact
    JOIN reg.artifact_revision AS revision ON revision.artifact_id = artifact.artifact_id
    WHERE artifact.workspace_id = p_workspace_id AND artifact.kind = 'brain'
      AND revision.artifact_revision_id = p_brain_revision_id
      AND revision.digest = p_brain_digest AND revision.availability = 'AVAILABLE'
      AND jsonb_typeof(p_candidate->'applicableItemIds') = 'array'
      AND jsonb_typeof(p_candidate->'proofs') = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_candidate->'applicableItemIds') AS applicable(value)
        WHERE jsonb_typeof(applicable.value) <> 'string' OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(revision.payload->'items') AS item(value)
          WHERE item.value->>'itemId' = applicable.value #>> '{}'
        )
      )
      AND jsonb_array_length(p_candidate->'proofs') = (
        SELECT count(*) FROM jsonb_array_elements(revision.payload->'assertions') AS assertion(value)
        WHERE assertion.value->>'scope' = 'REVISION'
          OR p_candidate->'applicableItemIds' ? (assertion.value->>'itemId')
      )
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_candidate->'proofs') AS proof(value)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(revision.payload->'assertions') AS assertion(value)
          JOIN jsonb_array_elements(revision.payload->'items') AS item(value)
            ON item.value->>'itemId' = assertion.value->>'itemId'
          WHERE assertion.value->>'assertionId' = proof.value->>'assertionId'
            AND assertion.value->>'itemId' = proof.value->>'itemId'
            AND assertion.value->>'predicateVersion' = proof.value->>'predicateVersion'
            AND proof.value->'registration'->>'datasetId' = item.value->>'itemId'
            AND proof.value->'registration'->>'grainId' = item.value->>'grainId'
            AND (assertion.value->>'scope' = 'REVISION'
              OR p_candidate->'applicableItemIds' ? (assertion.value->>'itemId'))
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION reg.admit_project_brain_revision(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA reg TO project_owner;
GRANT EXECUTE ON FUNCTION reg.admit_project_brain_revision(uuid, uuid, text, jsonb) TO project_owner;

RESET ROLE;

SET LOCAL ROLE connections_owner;

CREATE FUNCTION con.admit_brain_proof_subject(
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

REVOKE EXECUTE ON FUNCTION con.admit_brain_proof_subject(uuid, uuid, uuid, uuid, uuid, bigint, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA con TO project_owner;
GRANT EXECUTE ON FUNCTION con.admit_brain_proof_subject(uuid, uuid, uuid, uuid, uuid, bigint, text)
  TO project_owner;

RESET ROLE;

SET LOCAL ROLE brain_owner;

ALTER TABLE brn.binding_validation ADD COLUMN candidate jsonb;

CREATE FUNCTION brn.canonical_binding_json(p_value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp
AS $$
DECLARE result text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(to_jsonb(entry.key)::text || ':' ||
        brn.canonical_binding_json(entry.value), ',' ORDER BY entry.key), '') || '}'
      INTO result FROM jsonb_each(p_value) AS entry;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(brn.canonical_binding_json(entry.value),
        ',' ORDER BY entry.ordinality), '') || ']'
      INTO result FROM jsonb_array_elements(p_value) WITH ORDINALITY AS entry(value, ordinality);
    ELSE result := p_value::text;
  END CASE;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION brn.canonical_binding_json(jsonb) FROM PUBLIC;

CREATE FUNCTION brn.admit_binding_candidate(p_candidate jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  proof jsonb;
  registration jsonb;
  subject jsonb;
  counts jsonb;
  total_rows numeric;
  null_key_rows numeric;
  duplicate_key_groups numeric;
BEGIN
  IF jsonb_typeof(p_candidate) <> 'object'
    OR octet_length(convert_to(brn.canonical_binding_json(p_candidate), 'UTF8')) > 1048576
    OR (SELECT count(*) FROM jsonb_object_keys(p_candidate)) <> 11
    OR NOT (p_candidate ?& ARRAY['schemaVersion','validationState','projectId','workspaceId',
      'brainRevisionId','brainDigest','sourceRevision','inputDigest','manifestDigest',
      'applicableItemIds','proofs'])
    OR jsonb_typeof(p_candidate->'schemaVersion') <> 'string'
    OR jsonb_typeof(p_candidate->'validationState') <> 'string'
    OR jsonb_typeof(p_candidate->'projectId') <> 'string'
    OR jsonb_typeof(p_candidate->'workspaceId') <> 'string'
    OR jsonb_typeof(p_candidate->'brainRevisionId') <> 'string'
    OR jsonb_typeof(p_candidate->'brainDigest') <> 'string'
    OR jsonb_typeof(p_candidate->'sourceRevision') <> 'string'
    OR jsonb_typeof(p_candidate->'inputDigest') <> 'string'
    OR jsonb_typeof(p_candidate->'manifestDigest') <> 'string'
    OR p_candidate->>'schemaVersion' <> 'conexus-brain-binding-validation/v1'
    OR p_candidate->>'validationState' <> 'VALID'
    OR (p_candidate->>'projectId')::uuid IS NULL
    OR (p_candidate->>'workspaceId')::uuid IS NULL
    OR (p_candidate->>'brainRevisionId')::uuid IS NULL
    OR p_candidate->>'brainDigest' !~ '^[0-9a-f]{64}$'
    OR p_candidate->>'sourceRevision' !~ '^[0-9a-f]{40}$'
    OR p_candidate->>'inputDigest' !~ '^[0-9a-f]{64}$'
    OR p_candidate->>'manifestDigest' !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_candidate->'proofs') <> 'array'
    OR jsonb_typeof(p_candidate->'applicableItemIds') <> 'array'
    OR jsonb_array_length(p_candidate->'proofs') > 4096
    OR jsonb_array_length(p_candidate->'applicableItemIds') > 2048
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_candidate->'applicableItemIds') AS item(value)
      WHERE jsonb_typeof(item.value) <> 'string' OR length(item.value #>> '{}') NOT BETWEEN 1 AND 256
    )
    OR (SELECT count(*) FROM jsonb_array_elements(p_candidate->'applicableItemIds')) <>
      (SELECT count(DISTINCT value) FROM jsonb_array_elements(p_candidate->'applicableItemIds')) THEN
    RETURN false;
  END IF;
  FOR proof IN SELECT value FROM jsonb_array_elements(p_candidate->'proofs') LOOP
    registration := proof->'registration';
    subject := proof->'subject';
    counts := proof->'counts';
    IF jsonb_typeof(proof) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(proof)) <> 13
      OR NOT (proof ?& ARRAY['assertionId','itemId','predicateVersion','outcome','registration',
        'registrationDigest','subject','subjectDigest','observationId','coherence','counts','empty','proofDigest'])
      OR jsonb_typeof(proof->'assertionId') <> 'string'
      OR jsonb_typeof(proof->'itemId') <> 'string'
      OR jsonb_typeof(proof->'predicateVersion') <> 'string'
      OR jsonb_typeof(proof->'outcome') <> 'string'
      OR jsonb_typeof(proof->'observationId') <> 'string'
      OR jsonb_typeof(proof->'coherence') <> 'string'
      OR jsonb_typeof(proof->'empty') <> 'boolean'
      OR length(proof->>'assertionId') NOT BETWEEN 1 AND 256
      OR length(proof->>'itemId') NOT BETWEEN 1 AND 256
      OR proof->>'predicateVersion' <> '1' OR proof->>'outcome' <> 'PASS'
      OR proof->>'coherence' NOT IN ('SINGLE_STATEMENT','IMMUTABLE_SNAPSHOT')
      OR length(proof->>'observationId') NOT BETWEEN 1 AND 256
      OR jsonb_typeof(registration) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(registration)) <> 9
      OR NOT (registration ?& ARRAY['queryId','queryVersion','workspaceId','projectId','connectionId',
        'environment','datasetId','grainId','mappingDigest'])
      OR EXISTS (SELECT 1 FROM jsonb_each(registration) AS field(key, value)
        WHERE jsonb_typeof(field.value) <> 'string')
      OR jsonb_typeof(subject) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(subject)) <> 10
      OR NOT (subject ?& ARRAY['workspaceId','projectId','connectionId','connectionRevisionId',
        'qualificationId','credentialGeneration','environment','sourceScopeId','sourceRevision','inputDigest'])
      OR EXISTS (SELECT 1 FROM jsonb_each(subject) AS field(key, value)
        WHERE jsonb_typeof(field.value) <> 'string')
      OR jsonb_typeof(counts) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(counts)) <> 3
      OR NOT (counts ?& ARRAY['totalRows','nullKeyRows','duplicateKeyGroups'])
      OR EXISTS (SELECT 1 FROM jsonb_each(counts) AS field(key, value)
        WHERE jsonb_typeof(field.value) <> 'string')
      OR length(registration->>'queryId') NOT BETWEEN 1 AND 256
      OR length(registration->>'queryVersion') NOT BETWEEN 1 AND 256
      OR length(registration->>'datasetId') NOT BETWEEN 1 AND 256
      OR length(registration->>'grainId') NOT BETWEEN 1 AND 256
      OR registration->>'environment' NOT IN ('SANDBOX','PRODUCTION')
      OR registration->>'mappingDigest' !~ '^[0-9a-f]{64}$'
      OR (registration->>'connectionId')::uuid IS NULL
      OR (subject->>'connectionId')::uuid IS NULL
      OR (subject->>'connectionRevisionId')::uuid IS NULL
      OR (subject->>'qualificationId')::uuid IS NULL
      OR (subject->>'sourceScopeId')::uuid IS NULL
      OR subject->>'environment' NOT IN ('SANDBOX','PRODUCTION')
      OR subject->>'sourceRevision' !~ '^[0-9a-f]{40}$'
      OR subject->>'inputDigest' !~ '^[0-9a-f]{64}$'
      OR subject->>'credentialGeneration' !~ '^(0|[1-9][0-9]{0,18})$'
      OR counts->>'totalRows' !~ '^(0|[1-9][0-9]{0,18})$'
      OR counts->>'nullKeyRows' !~ '^(0|[1-9][0-9]{0,18})$'
      OR counts->>'duplicateKeyGroups' !~ '^(0|[1-9][0-9]{0,18})$'
      OR proof->>'registrationDigest' !~ '^[0-9a-f]{64}$'
      OR proof->>'subjectDigest' !~ '^[0-9a-f]{64}$'
      OR proof->>'proofDigest' !~ '^[0-9a-f]{64}$'
      OR proof->>'registrationDigest' <> encode(sha256(convert_to(
        brn.canonical_binding_json(registration), 'UTF8')), 'hex')
      OR proof->>'subjectDigest' <> encode(sha256(convert_to(
        brn.canonical_binding_json(subject), 'UTF8')), 'hex') THEN
      RETURN false;
    END IF;
    total_rows := (counts->>'totalRows')::numeric;
    null_key_rows := (counts->>'nullKeyRows')::numeric;
    duplicate_key_groups := (counts->>'duplicateKeyGroups')::numeric;
    IF (subject->>'credentialGeneration')::numeric > 9223372036854775807
      OR total_rows > 9223372036854775807 OR null_key_rows > total_rows
      OR duplicate_key_groups > (total_rows - null_key_rows) / 2
      OR (proof->>'empty')::boolean IS DISTINCT FROM (total_rows = 0)
      OR proof->>'proofDigest' <> encode(sha256(convert_to(brn.canonical_binding_json(
        jsonb_build_object('registrationDigest', proof->>'registrationDigest',
          'subjectDigest', proof->>'subjectDigest', 'observationId', proof->>'observationId',
          'coherence', proof->>'coherence', 'totalRows', counts->>'totalRows',
          'nullKeyRows', counts->>'nullKeyRows', 'duplicateKeyGroups', counts->>'duplicateKeyGroups',
          'outcome', proof->>'outcome')), 'UTF8')), 'hex') THEN
      RETURN false;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(p_candidate->'proofs')) <>
    (SELECT count(DISTINCT value->>'assertionId') FROM jsonb_array_elements(p_candidate->'proofs')) THEN
    RETURN false;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION brn.admit_binding_candidate(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brn.admit_binding_candidate(jsonb) TO project_owner;

CREATE FUNCTION brn.persist_binding_validation(
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
  ) ON CONFLICT (project_id, project_binding_digest) DO NOTHING;
  SELECT * INTO STRICT stored FROM brn.binding_validation
    WHERE project_id = p_project_id AND project_binding_digest = p_project_binding_digest;
  IF stored.brain_revision_id <> p_brain_revision_id OR stored.brain_digest <> p_brain_digest
    OR stored.validation_state <> 'VALID' OR stored.candidate IS DISTINCT FROM p_candidate THEN
    RAISE EXCEPTION 'BRAIN_BINDING_VALIDATION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA brn TO project_owner, hub_r2_brain_bootstrap;
GRANT EXECUTE ON FUNCTION brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb)
  TO hub_r2_brain_bootstrap;

CREATE FUNCTION brn.admit_binding_validation(
  p_binding_validation_id uuid, p_project_id uuid, p_brain_revision_id uuid,
  p_brain_digest text, p_project_binding_digest text, p_candidate jsonb
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM brn.binding_validation AS validation
    WHERE validation.binding_validation_id = p_binding_validation_id
      AND validation.project_id = p_project_id
      AND validation.brain_revision_id = p_brain_revision_id
      AND validation.brain_digest = p_brain_digest
      AND validation.project_binding_digest = p_project_binding_digest
      AND validation.validation_state = 'VALID'
      AND validation.candidate = p_candidate
  );
$$;

REVOKE EXECUTE ON FUNCTION brn.admit_binding_validation(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION brn.admit_binding_validation(uuid, uuid, uuid, text, text, jsonb) TO project_owner;

RESET ROLE;

SET LOCAL ROLE project_owner;

CREATE FUNCTION project.prepare_brain_binding(
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

CREATE FUNCTION project.begin_brain_binding_intent(
  p_account_id uuid, p_project_id uuid, p_brain_revision_id uuid,
  p_brain_digest text, p_expected_current jsonb, p_candidate jsonb,
  p_project_binding_digest text, p_intent_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE prepared record; stored project.binding_source_intent%ROWTYPE;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  IF EXISTS (SELECT 1 FROM project.binding_source_intent WHERE project_id = p_project_id
    AND state IN ('PREPARING','APPLYING','ABORTING')) THEN
    RAISE EXCEPTION 'PROJECT_BINDING_IN_PROGRESS' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT prepared FROM project.prepare_brain_binding(p_account_id, p_project_id,
    p_brain_revision_id, p_brain_digest, p_expected_current, p_candidate, p_project_binding_digest,
    p_intent_id);
  INSERT INTO project.binding_source_intent(intent_id, project_id, account_id, workspace_id,
    operation_kind, brain_revision_id, brain_digest, expected_current, remove_binding,
    source_revision, declaration, prepared_result)
  SELECT p_intent_id, p_project_id, p_account_id, candidate.workspace_id, 'BRAIN',
    p_brain_revision_id, p_brain_digest, p_expected_current, false,
    prepared.source_revision, prepared.declaration, prepared.result
  FROM project.project AS candidate WHERE candidate.project_id = p_project_id
  RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

CREATE FUNCTION project.settle_brain_binding(
  p_intent_id uuid, p_account_id uuid, p_project_id uuid, p_brain_revision_id uuid,
  p_brain_digest text, p_expected_current jsonb, p_old_source_revision text,
  p_new_source_revision text, p_candidate jsonb, p_declaration_digest text,
  p_binding_validation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE prepared record;
BEGIN
  IF p_old_source_revision !~ '^[0-9a-f]{40}$' OR p_new_source_revision !~ '^[0-9a-f]{40}$'
    OR p_old_source_revision = p_new_source_revision OR p_declaration_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_SETTLEMENT_INPUT_REFUSED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT prepared FROM project.prepare_brain_binding(p_account_id, p_project_id,
    p_brain_revision_id, p_brain_digest, p_expected_current, p_candidate, p_declaration_digest,
    p_binding_validation_id);
  IF prepared.source_revision <> p_old_source_revision OR prepared.declaration IS DISTINCT FROM p_candidate THEN
    RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_BASIS_STALE' USING ERRCODE = 'P0412';
  END IF;
  INSERT INTO project.brain_binding(project_id, brain_revision_id, brain_digest,
    project_binding_digest, validation_state, project_source_revision)
  VALUES (p_project_id, p_brain_revision_id, p_brain_digest, p_declaration_digest,
    'VALID', p_new_source_revision)
  ON CONFLICT (project_id) DO UPDATE SET brain_revision_id = EXCLUDED.brain_revision_id,
    brain_digest = EXCLUDED.brain_digest, project_binding_digest = EXCLUDED.project_binding_digest,
    validation_state = EXCLUDED.validation_state,
    project_source_revision = EXCLUDED.project_source_revision, updated_at = clock_timestamp();
  UPDATE project.project SET source_revision = p_new_source_revision
    WHERE project_id = p_project_id AND source_revision = p_old_source_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_BINDING_SOURCE_STALE' USING ERRCODE = 'P0412'; END IF;
  RETURN prepared.result;
END;
$$;

CREATE OR REPLACE FUNCTION project.validate_binding_source_intent(
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
  IF stored.operation_kind = 'CONNECTION' THEN
    SELECT * INTO STRICT prepared FROM project.prepare_connection_binding(stored.account_id,
      stored.project_id, stored.connection_id, stored.connection_revision_id,
      stored.environment, stored.expected_current, stored.remove_binding);
  ELSE
    SELECT * INTO STRICT prepared FROM project.prepare_brain_binding(stored.account_id,
      stored.project_id, stored.brain_revision_id, stored.brain_digest,
      stored.expected_current, stored.declaration, stored.prepared_result->>'projectBindingDigest',
      stored.intent_id);
  END IF;
  IF prepared.source_revision IS DISTINCT FROM stored.source_revision
    OR prepared.declaration IS DISTINCT FROM stored.declaration THEN
    RAISE EXCEPTION 'PROJECT_BINDING_BASIS_STALE' USING ERRCODE = 'P0412';
  END IF;
  RETURN to_jsonb(stored);
END;
$$;

CREATE OR REPLACE FUNCTION project.complete_binding_source_intent(
  p_account_id uuid, p_project_id uuid, p_intent_id uuid, p_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE stored project.binding_source_intent%ROWTYPE; settled jsonb;
BEGIN
  PERFORM project.lock_binding_project(p_account_id, p_project_id);
  SELECT * INTO STRICT stored FROM project.binding_source_intent
    WHERE project_id = p_project_id AND intent_id = p_intent_id FOR UPDATE;
  IF p_version IS NULL OR stored.state <> 'APPLYING' OR stored.version <> p_version THEN
    RAISE EXCEPTION 'PROJECT_BINDING_INTENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF stored.operation_kind = 'CONNECTION' THEN
    settled := project.settle_connection_binding(stored.account_id, stored.project_id,
      stored.connection_id, stored.connection_revision_id, stored.environment,
      stored.expected_current, stored.remove_binding, stored.source_revision,
      stored.apply_source_revision, stored.declaration, stored.declaration_digest);
  ELSE
    IF stored.declaration_digest <> stored.prepared_result->>'projectBindingDigest' THEN
      RAISE EXCEPTION 'PROJECT_BRAIN_BINDING_DIGEST_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    settled := project.settle_brain_binding(stored.intent_id, stored.account_id, stored.project_id,
      stored.brain_revision_id, stored.brain_digest, stored.expected_current,
      stored.source_revision, stored.apply_source_revision, stored.declaration,
      stored.declaration_digest, stored.intent_id);
  END IF;
  UPDATE project.binding_source_intent SET state = 'COMPLETED', version = version + 1,
    terminal_source_revision = apply_source_revision, terminal_result = settled,
    completed_at = clock_timestamp() WHERE intent_id = p_intent_id RETURNING * INTO stored;
  RETURN to_jsonb(stored);
END;
$$;

REVOKE EXECUTE ON FUNCTION project.prepare_brain_binding(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION project.settle_brain_binding(uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid)
  TO hub_r2_project_binding;

RESET ROLE;

COMMIT;
