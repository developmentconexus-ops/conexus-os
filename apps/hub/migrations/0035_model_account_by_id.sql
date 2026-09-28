BEGIN;

-- A run holds one model account row for its whole life, own or shared (spec 0002, Value sourcing),
-- and a refreshed OAuth token goes back to that same row before the run's copy is dropped (AC-22).
-- The shared row belongs to someone else, so the write-back is by the row's id, not by the caller.

-- The row a run holds, sealed. NULL when it no longer exists.
CREATE FUNCTION model.read_model_account_by_id(p_model_account_id uuid) RETURNS TABLE(secret text, kind text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.secret, stored.kind FROM model.model_account AS stored WHERE stored.model_account_id = p_model_account_id;
$$;

ALTER FUNCTION model.read_model_account_by_id(p_model_account_id uuid) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.read_model_account_by_id(p_model_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION model.read_model_account_by_id(p_model_account_id uuid) TO hub_model_account;

-- Replaces the sealed secret of the row a run holds, keeping its owner, provider, kind and sharing.
-- False when the row is gone.
CREATE FUNCTION model.rewrite_model_account_secret(p_model_account_id uuid, p_secret text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  UPDATE model.model_account SET secret = p_secret, updated_at = clock_timestamp() WHERE model_account_id = p_model_account_id;
  RETURN FOUND;
END;
$$;

ALTER FUNCTION model.rewrite_model_account_secret(p_model_account_id uuid, p_secret text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.rewrite_model_account_secret(p_model_account_id uuid, p_secret text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.rewrite_model_account_secret(p_model_account_id uuid, p_secret text) TO hub_model_account;

COMMIT;
