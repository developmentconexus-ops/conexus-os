BEGIN;

-- The Account the configured bootstrap identity creates through /setup becomes the first
-- installation administrator in the same transaction, so a fresh installation needs no operator
-- shell step. It grants only while the installation has never had an administrator, revoked
-- tenures included, so the Hub can use it once per installation and never to take over later.
-- iam.bootstrap_installation_administrator stays the operator's recovery path.
CREATE FUNCTION iam.grant_first_installation_administrator(p_account_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM iam.installation_administrator) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM iam.account AS target_account
    WHERE target_account.account_id = p_account_id AND target_account.active)
  THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO iam.installation_administrator (account_id, granted_via)
  VALUES (p_account_id, 'OPERATOR_BOOTSTRAP');
  RETURN true;
END;
$$;

ALTER FUNCTION iam.grant_first_installation_administrator(p_account_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.grant_first_installation_administrator(p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.grant_first_installation_administrator(p_account_id uuid) TO hub_iam_runtime;

COMMIT;
