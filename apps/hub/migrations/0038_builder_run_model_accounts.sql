BEGIN;

-- A run pays for each model call with the account of the model being called, and the model can
-- change between calls (spec 0002 AC-23), so a run records every account that paid for one of its
-- calls instead of one account chosen when it started. No foreign key to the account, for the
-- same reason as the column this replaces: an account deleted later leaves the record as it was.
CREATE TABLE builder.builder_run_model_account (
    builder_run_id uuid NOT NULL REFERENCES builder.builder_run(builder_run_id) ON DELETE CASCADE,
    model_account_id uuid NOT NULL,
    first_used_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT builder_run_model_account_pkey PRIMARY KEY (builder_run_id, model_account_id)
);

ALTER TABLE builder.builder_run_model_account OWNER TO builder_owner;

REVOKE ALL ON TABLE builder.builder_run_model_account FROM PUBLIC;

INSERT INTO builder.builder_run_model_account (builder_run_id, model_account_id)
SELECT builder_run_id, model_account_id FROM builder.builder_run WHERE model_account_id IS NOT NULL;

-- Records an account that paid for a call of a running run; the same one again converges.
CREATE FUNCTION builder.record_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF p_model_account_id IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM builder.builder_run WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO builder.builder_run_model_account (builder_run_id, model_account_id)
  VALUES (p_builder_run_id, p_model_account_id) ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

ALTER FUNCTION builder.record_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.record_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.record_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) TO hub_builder_executor;

DROP FUNCTION builder.bind_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid);
ALTER TABLE builder.builder_run DROP COLUMN model_account_id;

COMMIT;
