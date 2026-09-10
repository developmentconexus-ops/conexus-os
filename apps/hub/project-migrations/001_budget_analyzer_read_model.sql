BEGIN;

DO $$
DECLARE
  v_suffix text := md5(current_database());
  v_migration_role text := 'project_migration_owner_' || v_suffix;
  v_sync_role text := 'project_sync_runtime_' || v_suffix;
  v_query_role text := 'project_query_runtime_' || v_suffix;
BEGIN
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS', v_migration_role);
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS', v_sync_role);
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS', v_query_role);
END $$;

DO $$
DECLARE
  v_owner_role text := 'project_migration_owner_' || md5(current_database());
BEGIN
  EXECUTE format('CREATE SCHEMA project_meta AUTHORIZATION %I', v_owner_role);
  EXECUTE format('CREATE SCHEMA budget_analyzer AUTHORIZATION %I', v_owner_role);
END $$;

REVOKE ALL ON SCHEMA project_meta, budget_analyzer FROM PUBLIC;
DO $$
DECLARE
  v_sync_role text := 'project_sync_runtime_' || md5(current_database());
  v_query_role text := 'project_query_runtime_' || md5(current_database());
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA budget_analyzer TO %I, %I', v_sync_role, v_query_role);
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I, %I', current_database(), v_sync_role, v_query_role);
END $$;

DO $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'project_migration_owner_' || md5(current_database()));
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA budget_analyzer
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE project_meta.schema_migration (
  version text PRIMARY KEY CHECK (version ~ '^[0-9]{3}$'),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  project_source_revision text NOT NULL CHECK (project_source_revision ~ '\S'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE budget_analyzer.sync_checkpoint (
  sync_id text PRIMARY KEY CHECK (sync_id ~ '\S'),
  checkpoint_revision bigint NOT NULL DEFAULT 0 CHECK (checkpoint_revision >= 0),
  committed_generation bigint NOT NULL DEFAULT 0 CHECK (committed_generation >= 0),
  working_generation bigint CHECK (working_generation IS NULL OR working_generation > committed_generation),
  committed_cursor jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(committed_cursor) = 'object'),
  working_cursor jsonb CHECK (working_cursor IS NULL OR jsonb_typeof(working_cursor) = 'object'),
  observation_kind text CHECK (observation_kind IN ('FULL_SNAPSHOT', 'INCREMENTAL_DELTA')),
  freshness text NOT NULL DEFAULT 'UNKNOWN' CHECK (freshness IN ('CURRENT', 'STALE', 'UNKNOWN')),
  coverage text NOT NULL DEFAULT 'UNKNOWN' CHECK (coverage IN ('COMPLETE', 'PARTIAL', 'UNKNOWN')),
  merge_state text NOT NULL DEFAULT 'IDLE' CHECK (merge_state IN ('IDLE', 'INGESTING', 'UNKNOWN')),
  source_binding_revision text CHECK (source_binding_revision IS NULL OR source_binding_revision ~ '\S'),
  semantic_revision text CHECK (semantic_revision IS NULL OR semantic_revision ~ '\S'),
  last_observation_id text CHECK (last_observation_id IS NULL OR last_observation_id ~ '\S'),
  last_observation_digest text CHECK (last_observation_digest IS NULL OR last_observation_digest ~ '^[a-f0-9]{64}$'),
  last_completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((working_generation IS NULL) = (working_cursor IS NULL)),
  CHECK (merge_state <> 'INGESTING' OR working_generation IS NOT NULL),
  CHECK (merge_state = 'IDLE' OR working_generation IS NOT NULL OR merge_state = 'UNKNOWN'),
  CHECK (freshness <> 'CURRENT' OR coverage = 'COMPLETE'),
  CHECK (coverage <> 'COMPLETE' OR working_generation IS NULL)
);

CREATE TABLE budget_analyzer.pending_budget (
  generation bigint NOT NULL CHECK (generation > 0),
  budget_ref text NOT NULL CHECK (budget_ref ~ '\S'),
  canonical_business_date date NOT NULL,
  last_change_at timestamptz,
  budget_value numeric NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  seller_id text NOT NULL CHECK (seller_id ~ '\S'),
  seller_name text NOT NULL CHECK (seller_name ~ '\S'),
  customer_id text NOT NULL CHECK (customer_id ~ '\S'),
  customer_name text NOT NULL CHECK (customer_name ~ '\S'),
  source_company_id text NOT NULL CHECK (source_company_id ~ '\S'),
  pending_evidence_state text NOT NULL CHECK (pending_evidence_state IN ('CONFIRMED', 'AMBIGUOUS', 'UNVERIFIED')),
  PRIMARY KEY (generation, budget_ref)
);

INSERT INTO budget_analyzer.sync_checkpoint (sync_id)
VALUES ('budget-analyzer-sync/v1');

CREATE OR REPLACE FUNCTION budget_analyzer.apply_budget_observation(
  p_sync_id text,
  p_expected_checkpoint_revision bigint,
  p_observation_id text,
  p_observation_digest text,
  p_observation_kind text,
  p_complete boolean,
  p_cursor jsonb,
  p_freshness text,
  p_coverage text,
  p_source_binding_revision text,
  p_semantic_revision text,
  p_rows jsonb,
  p_removed_budget_refs text[] DEFAULT ARRAY[]::text[]
) RETURNS TABLE(
  status text,
  checkpoint_revision bigint,
  committed_generation bigint,
  freshness text,
  coverage text,
  merge_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, budget_analyzer, pg_temp
AS $$
DECLARE
  v_checkpoint budget_analyzer.sync_checkpoint%ROWTYPE;
  v_working_generation bigint;
  v_removed_budget_refs text[] := COALESCE(p_removed_budget_refs, ARRAY[]::text[]);
  v_status text;
BEGIN
  IF p_sync_id IS NULL OR p_sync_id <> 'budget-analyzer-sync/v1' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_ID_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_checkpoint_revision IS NULL OR p_expected_checkpoint_revision < 0 THEN
    RAISE EXCEPTION 'PROJECT_SYNC_REVISION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_observation_id IS NULL OR p_observation_id !~ '\S' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_OBSERVATION_ID_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_observation_digest IS NULL OR p_observation_digest !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_OBSERVATION_DIGEST_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_observation_kind IS NULL OR p_observation_kind NOT IN ('FULL_SNAPSHOT', 'INCREMENTAL_DELTA') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_OBSERVATION_KIND_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_cursor IS NULL OR jsonb_typeof(p_cursor) <> 'object' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_CURSOR_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_ROWS_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_rows) > 10000 OR cardinality(v_removed_budget_refs) > 10000 THEN
    RAISE EXCEPTION 'PROJECT_SYNC_BATCH_LIMIT_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_freshness IS NULL OR p_freshness NOT IN ('CURRENT', 'STALE', 'UNKNOWN') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_FRESHNESS_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_coverage IS NULL OR p_coverage NOT IN ('COMPLETE', 'PARTIAL', 'UNKNOWN') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_COVERAGE_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_source_binding_revision IS NULL OR p_source_binding_revision !~ '\S'
    OR p_semantic_revision IS NULL OR p_semantic_revision !~ '\S' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_BINDING_REVISION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_complete IS DISTINCT FROM (p_coverage = 'COMPLETE') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_COMPLETION_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_complete AND p_freshness = 'UNKNOWN' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_COMPLETE_UNKNOWN_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT p_complete AND (p_coverage = 'COMPLETE' OR p_freshness = 'CURRENT') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_INCOMPLETE_STATE_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_observation_kind = 'FULL_SNAPSHOT' AND cardinality(v_removed_budget_refs) > 0 THEN
    RAISE EXCEPTION 'PROJECT_SYNC_SNAPSHOT_TOMBSTONE_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_removed_budget_refs) AS removed(budget_ref) WHERE removed.budget_ref IS NULL OR removed.budget_ref !~ '\S') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_TOMBSTONE_REFUSED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO STRICT v_checkpoint
  FROM budget_analyzer.sync_checkpoint
  WHERE sync_id = p_sync_id
  FOR UPDATE;

  IF v_checkpoint.last_observation_id = p_observation_id THEN
    IF v_checkpoint.last_observation_digest IS DISTINCT FROM p_observation_digest THEN
      RAISE EXCEPTION 'PROJECT_SYNC_OBSERVATION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT
      'REPLAYED'::text,
      v_checkpoint.checkpoint_revision,
      v_checkpoint.committed_generation,
      v_checkpoint.freshness,
      v_checkpoint.coverage,
      v_checkpoint.merge_state;
    RETURN;
  END IF;

  IF v_checkpoint.checkpoint_revision <> p_expected_checkpoint_revision THEN
    RAISE EXCEPTION 'PROJECT_SYNC_STALE_WRITER' USING ERRCODE = 'P0001';
  END IF;

  IF v_checkpoint.source_binding_revision IS NOT NULL
    AND v_checkpoint.merge_state <> 'UNKNOWN'
    AND (
      v_checkpoint.source_binding_revision IS DISTINCT FROM p_source_binding_revision
      OR v_checkpoint.semantic_revision IS DISTINCT FROM p_semantic_revision
    ) THEN
    DELETE FROM budget_analyzer.pending_budget
    WHERE generation > v_checkpoint.committed_generation;
    UPDATE budget_analyzer.sync_checkpoint AS checkpoint
    SET working_generation = NULL,
        working_cursor = NULL,
        observation_kind = NULL,
        freshness = 'UNKNOWN',
        coverage = 'UNKNOWN',
        merge_state = 'UNKNOWN',
        checkpoint_revision = checkpoint.checkpoint_revision + 1,
        updated_at = clock_timestamp()
    WHERE checkpoint.sync_id = p_sync_id
    RETURNING checkpoint.* INTO STRICT v_checkpoint;
    RETURN QUERY SELECT
      'REJECTED_DRIFT'::text,
      v_checkpoint.checkpoint_revision,
      v_checkpoint.committed_generation,
      v_checkpoint.freshness,
      v_checkpoint.coverage,
      v_checkpoint.merge_state;
    RETURN;
  END IF;

  IF v_checkpoint.merge_state = 'UNKNOWN'
    AND p_observation_kind <> 'FULL_SNAPSHOT' THEN
    RAISE EXCEPTION 'PROJECT_SYNC_REBASELINE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_checkpoint.working_generation IS NOT NULL
    AND v_checkpoint.observation_kind IS DISTINCT FROM p_observation_kind THEN
    RAISE EXCEPTION 'PROJECT_SYNC_OBSERVATION_KIND_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF v_checkpoint.working_generation IS NULL THEN
    IF p_observation_kind = 'INCREMENTAL_DELTA' AND v_checkpoint.committed_generation = 0 THEN
      RAISE EXCEPTION 'PROJECT_SYNC_DELTA_REBASELINE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    v_working_generation := v_checkpoint.committed_generation + 1;
    IF p_observation_kind = 'INCREMENTAL_DELTA' THEN
      INSERT INTO budget_analyzer.pending_budget (
        generation, budget_ref, canonical_business_date, last_change_at, budget_value,
        currency_code, seller_id, seller_name, customer_id, customer_name, source_company_id,
        pending_evidence_state
      )
      SELECT
        v_working_generation, budget_ref, canonical_business_date, last_change_at, budget_value,
        currency_code, seller_id, seller_name, customer_id, customer_name, source_company_id,
        pending_evidence_state
      FROM budget_analyzer.pending_budget
      WHERE generation = v_checkpoint.committed_generation;
    END IF;
  ELSE
    v_working_generation := v_checkpoint.working_generation;
  END IF;

  INSERT INTO budget_analyzer.pending_budget (
    generation, budget_ref, canonical_business_date, last_change_at, budget_value,
    currency_code, seller_id, seller_name, customer_id, customer_name, source_company_id,
    pending_evidence_state
  )
  SELECT
    v_working_generation, row_data.budget_ref, row_data.canonical_business_date, row_data.last_change_at,
    row_data.budget_value, row_data.currency_code, row_data.seller_id, row_data.seller_name,
    row_data.customer_id, row_data.customer_name, row_data.source_company_id,
    row_data.pending_evidence_state
  FROM jsonb_to_recordset(p_rows) AS row_data(
    budget_ref text,
    canonical_business_date date,
    last_change_at timestamptz,
    budget_value numeric,
    currency_code text,
    seller_id text,
    seller_name text,
    customer_id text,
    customer_name text,
    source_company_id text,
    pending_evidence_state text
  )
  ON CONFLICT (generation, budget_ref) DO UPDATE SET
    canonical_business_date = EXCLUDED.canonical_business_date,
    last_change_at = EXCLUDED.last_change_at,
    budget_value = EXCLUDED.budget_value,
    currency_code = EXCLUDED.currency_code,
    seller_id = EXCLUDED.seller_id,
    seller_name = EXCLUDED.seller_name,
    customer_id = EXCLUDED.customer_id,
    customer_name = EXCLUDED.customer_name,
    source_company_id = EXCLUDED.source_company_id,
    pending_evidence_state = EXCLUDED.pending_evidence_state;

  IF p_observation_kind = 'INCREMENTAL_DELTA' THEN
    DELETE FROM budget_analyzer.pending_budget
    WHERE generation = v_working_generation
      AND budget_ref = ANY(v_removed_budget_refs);
  END IF;

  IF NOT p_complete THEN
    UPDATE budget_analyzer.sync_checkpoint AS checkpoint
    SET working_generation = v_working_generation,
        working_cursor = p_cursor,
        observation_kind = p_observation_kind,
        freshness = p_freshness,
        coverage = p_coverage,
        merge_state = 'INGESTING',
        source_binding_revision = p_source_binding_revision,
        semantic_revision = p_semantic_revision,
        last_observation_id = p_observation_id,
        last_observation_digest = p_observation_digest,
        checkpoint_revision = checkpoint.checkpoint_revision + 1,
        updated_at = clock_timestamp()
    WHERE checkpoint.sync_id = p_sync_id
    RETURNING checkpoint.* INTO STRICT v_checkpoint;
    v_status := 'STAGED';
  ELSE
    DELETE FROM budget_analyzer.pending_budget
    WHERE generation <> v_working_generation;
    UPDATE budget_analyzer.sync_checkpoint AS checkpoint
    SET committed_generation = v_working_generation,
        working_generation = NULL,
        committed_cursor = p_cursor,
        working_cursor = NULL,
        observation_kind = NULL,
        freshness = p_freshness,
        coverage = 'COMPLETE',
        merge_state = 'IDLE',
        source_binding_revision = p_source_binding_revision,
        semantic_revision = p_semantic_revision,
        last_observation_id = p_observation_id,
        last_observation_digest = p_observation_digest,
        last_completed_at = clock_timestamp(),
        checkpoint_revision = checkpoint.checkpoint_revision + 1,
        updated_at = clock_timestamp()
    WHERE checkpoint.sync_id = p_sync_id
    RETURNING checkpoint.* INTO STRICT v_checkpoint;
    v_status := 'COMMITTED';
  END IF;

  RETURN QUERY SELECT
    v_status,
    v_checkpoint.checkpoint_revision,
    v_checkpoint.committed_generation,
    v_checkpoint.freshness,
    v_checkpoint.coverage,
    v_checkpoint.merge_state;
END;
$$;

CREATE VIEW budget_analyzer.current_pending_budget AS
SELECT
  p.budget_ref,
  p.canonical_business_date,
  p.last_change_at,
  p.budget_value,
  p.currency_code,
  p.seller_id,
  p.seller_name,
  p.customer_id,
  p.customer_name,
  p.source_company_id,
  p.pending_evidence_state,
  s.committed_generation AS generation
FROM budget_analyzer.pending_budget AS p
JOIN budget_analyzer.sync_checkpoint AS s
  ON s.sync_id = 'budget-analyzer-sync/v1'
 AND p.generation = s.committed_generation;

CREATE VIEW budget_analyzer.current_sync_state AS
SELECT
  sync_id,
  checkpoint_revision,
  committed_generation,
  committed_cursor,
  working_generation,
  working_cursor,
  observation_kind,
  freshness,
  coverage,
  merge_state,
  source_binding_revision,
  semantic_revision,
  last_observation_id,
  last_observation_digest,
  last_completed_at,
  updated_at
FROM budget_analyzer.sync_checkpoint
WHERE sync_id = 'budget-analyzer-sync/v1';

REVOKE ALL ON ALL TABLES IN SCHEMA project_meta, budget_analyzer FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA budget_analyzer FROM PUBLIC;
DO $$
DECLARE
  v_sync_role text := 'project_sync_runtime_' || md5(current_database());
  v_query_role text := 'project_query_runtime_' || md5(current_database());
BEGIN
  EXECUTE format('REVOKE ALL ON budget_analyzer.pending_budget, budget_analyzer.sync_checkpoint FROM %I, %I', v_sync_role, v_query_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION budget_analyzer.apply_budget_observation(text, bigint, text, text, text, boolean, jsonb, text, text, text, text, jsonb, text[]) TO %I', v_sync_role);
  EXECUTE format('GRANT SELECT ON budget_analyzer.current_pending_budget, budget_analyzer.current_sync_state TO %I', v_query_role);
END $$;

RESET ROLE;
COMMIT;
