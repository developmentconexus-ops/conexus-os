BEGIN;

-- A run records the model account that paid for it (spec 0002, Value sourcing), so the two read
-- functions answer the row's id beside its sealed secret. Their result type changes, so each is
-- dropped and created again with the same grants.
DROP FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text);

CREATE FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) RETURNS TABLE(model_account_id uuid, secret text, kind text, sharing text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.model_account_id, stored.secret, stored.kind, stored.sharing
  FROM model.model_account AS stored
  WHERE stored.owner_account_id = p_owner_account_id AND stored.provider = p_provider;
$$;

ALTER FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.read_model_account(p_owner_account_id uuid, p_provider text) TO hub_model_account;

DROP FUNCTION model.read_shared_model_account(p_provider text);

CREATE FUNCTION model.read_shared_model_account(p_provider text) RETURNS TABLE(model_account_id uuid, secret text, kind text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.model_account_id, stored.secret, stored.kind
  FROM model.model_account AS stored
  WHERE stored.provider = p_provider AND stored.sharing = 'everyone';
$$;

ALTER FUNCTION model.read_shared_model_account(p_provider text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.read_shared_model_account(p_provider text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.read_shared_model_account(p_provider text) TO hub_model_account;

-- The installation's default model for a role, or NULL until an administrator sets it.
CREATE FUNCTION model.read_installation_default(p_role text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT stored.model_id FROM model.installation_default AS stored WHERE stored.role = p_role;
$$;

ALTER FUNCTION model.read_installation_default(p_role text) OWNER TO model_owner;

REVOKE ALL ON FUNCTION model.read_installation_default(p_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION model.read_installation_default(p_role text) TO hub_model_account;

-- No foreign key: an account deleted later leaves the run's record of who paid as it was.
ALTER TABLE builder.builder_run ADD COLUMN model_account_id uuid;

-- Binds a running run to the account its model calls use, once; the same value again converges.
CREATE FUNCTION builder.bind_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF p_model_account_id IS NULL THEN RETURN false; END IF;
  UPDATE builder.builder_run SET model_account_id = p_model_account_id
  WHERE builder_run_id = p_builder_run_id AND state = 'RUNNING'
    AND (model_account_id IS NULL OR model_account_id = p_model_account_id);
  RETURN FOUND;
END;
$$;

ALTER FUNCTION builder.bind_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) OWNER TO builder_owner;

REVOKE ALL ON FUNCTION builder.bind_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION builder.bind_builder_run_model_account(p_builder_run_id uuid, p_model_account_id uuid) TO hub_builder_executor;

COMMIT;
