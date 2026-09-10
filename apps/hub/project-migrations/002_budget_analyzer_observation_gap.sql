BEGIN;

DO $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', 'project_migration_owner_' || md5(current_database()));
END $$;

ALTER TABLE budget_analyzer.sync_checkpoint
  ADD COLUMN last_gap_kind text
  CHECK (last_gap_kind IN ('MISSING', 'AMBIGUOUS'));

CREATE OR REPLACE VIEW budget_analyzer.current_sync_state AS
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
  updated_at,
  last_gap_kind
FROM budget_analyzer.sync_checkpoint
WHERE sync_id = 'budget-analyzer-sync/v1';

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
  v_was_degraded boolean;
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
  IF p_complete AND p_observation_kind = 'FULL_SNAPSHOT' AND jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'PROJECT_SYNC_EMPTY_COMPLETE_REFUSED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS row_data(budget_ref text)
    GROUP BY row_data.budget_ref
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PROJECT_SYNC_DUPLICATE_BUDGET_REF_REFUSED' USING ERRCODE = 'P0001';
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

  v_was_degraded := v_checkpoint.committed_generation = 0
    OR v_checkpoint.merge_state = 'UNKNOWN'
    OR v_checkpoint.last_gap_kind IS NOT NULL;

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
    AND (
      v_checkpoint.merge_state <> 'UNKNOWN'
      OR v_checkpoint.working_generation IS NOT NULL
    )
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
        last_gap_kind = NULL,
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
        freshness = CASE WHEN v_was_degraded THEN 'UNKNOWN' ELSE p_freshness END,
        coverage = CASE WHEN v_was_degraded THEN 'UNKNOWN' ELSE p_coverage END,
        merge_state = CASE WHEN v_was_degraded THEN 'UNKNOWN' ELSE 'INGESTING' END,
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
        last_gap_kind = NULL,
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

CREATE OR REPLACE FUNCTION budget_analyzer.record_observation_gap(
  p_sync_id text,
  p_expected_checkpoint_revision bigint,
  p_observation_id text,
  p_observation_digest text,
  p_gap_kind text
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
  IF p_gap_kind IS NULL OR p_gap_kind NOT IN ('MISSING', 'AMBIGUOUS') THEN
    RAISE EXCEPTION 'PROJECT_SYNC_GAP_KIND_REFUSED' USING ERRCODE = 'P0001';
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

  DELETE FROM budget_analyzer.pending_budget
  WHERE generation > v_checkpoint.committed_generation;

  UPDATE budget_analyzer.sync_checkpoint AS checkpoint
  SET working_generation = NULL,
      working_cursor = NULL,
      observation_kind = NULL,
      freshness = 'UNKNOWN',
      coverage = 'UNKNOWN',
      merge_state = 'UNKNOWN',
      last_gap_kind = p_gap_kind,
      last_observation_id = p_observation_id,
      last_observation_digest = p_observation_digest,
      checkpoint_revision = checkpoint.checkpoint_revision + 1,
      updated_at = clock_timestamp()
  WHERE checkpoint.sync_id = p_sync_id
  RETURNING checkpoint.* INTO STRICT v_checkpoint;

  RETURN QUERY SELECT
    'GAP_RECORDED'::text,
    v_checkpoint.checkpoint_revision,
    v_checkpoint.committed_generation,
    v_checkpoint.freshness,
    v_checkpoint.coverage,
    v_checkpoint.merge_state;
END;
$$;

DO $$
DECLARE
  v_sync_role text := 'project_sync_runtime_' || md5(current_database());
  v_query_role text := 'project_query_runtime_' || md5(current_database());
BEGIN
  EXECUTE format('REVOKE ALL ON FUNCTION budget_analyzer.record_observation_gap(text, bigint, text, text, text) FROM PUBLIC, %I', v_query_role);
  EXECUTE format('REVOKE ALL ON FUNCTION budget_analyzer.apply_budget_observation(text, bigint, text, text, text, boolean, jsonb, text, text, text, text, jsonb, text[]) FROM PUBLIC, %I', v_query_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION budget_analyzer.record_observation_gap(text, bigint, text, text, text) TO %I', v_sync_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION budget_analyzer.apply_budget_observation(text, bigint, text, text, text, boolean, jsonb, text, text, text, text, jsonb, text[]) TO %I', v_sync_role);
END $$;

RESET ROLE;
COMMIT;
