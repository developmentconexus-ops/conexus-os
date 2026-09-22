BEGIN;

-- An installation administrator may act on the whole installation, such as connecting the company
-- GitHub organization. It is a fact about an Account, not a Workspace role, and it admits nothing
-- inside any Workspace or Project. Each row is one tenure: granted by the operator's bootstrap or
-- by another administrator, and closed by the administrator who revoked it. Closed rows are kept,
-- so the table is also the record of who granted and revoked what, and when.
CREATE TABLE iam.installation_administrator (
    tenure_id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    granted_via text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone,
    CONSTRAINT installation_administrator_pkey PRIMARY KEY (tenure_id),
    CONSTRAINT installation_administrator_account_id_fkey FOREIGN KEY (account_id) REFERENCES iam.account(account_id),
    CONSTRAINT installation_administrator_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES iam.account(account_id),
    CONSTRAINT installation_administrator_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES iam.account(account_id),
    CONSTRAINT installation_administrator_granted_via_check CHECK ((granted_via = ANY (ARRAY['OPERATOR_BOOTSTRAP'::text, 'ADMINISTRATOR'::text]))),
    CONSTRAINT installation_administrator_grant_attribution_check CHECK (((granted_via = 'ADMINISTRATOR'::text) = (granted_by IS NOT NULL))),
    CONSTRAINT installation_administrator_revoke_attribution_check CHECK (((revoked_at IS NULL) = (revoked_by IS NULL))),
    CONSTRAINT installation_administrator_tenure_order_check CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at)))
);

ALTER TABLE iam.installation_administrator OWNER TO iam_owner;

CREATE UNIQUE INDEX installation_administrator_open_tenure ON iam.installation_administrator USING btree (account_id) WHERE (revoked_at IS NULL);

REVOKE ALL ON TABLE iam.installation_administrator FROM PUBLIC;

CREATE FUNCTION iam.is_installation_administrator(p_account_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM iam.installation_administrator AS tenure
    JOIN iam.account AS administrator
      ON administrator.account_id = tenure.account_id AND administrator.active
    WHERE tenure.account_id = p_account_id AND tenure.revoked_at IS NULL
  );
$$;

ALTER FUNCTION iam.is_installation_administrator(p_account_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.is_installation_administrator(p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.is_installation_administrator(p_account_id uuid) TO hub_iam_runtime;

-- Every change to the set takes this table lock first, so two administrators revoking each other
-- at once are serialized and the second sees the first's revocation. Plain reads are not blocked.
CREATE FUNCTION iam.grant_installation_administrator(p_actor uuid, p_account_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE;
  IF NOT iam.is_installation_administrator(p_actor) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM iam.account AS target_account
    WHERE target_account.account_id = p_account_id AND target_account.active)
  THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO iam.installation_administrator (account_id, granted_via, granted_by)
  VALUES (p_account_id, 'ADMINISTRATOR', p_actor)
  ON CONFLICT (account_id) WHERE revoked_at IS NULL DO NOTHING;
END;
$$;

ALTER FUNCTION iam.grant_installation_administrator(p_actor uuid, p_account_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.grant_installation_administrator(p_actor uuid, p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.grant_installation_administrator(p_actor uuid, p_account_id uuid) TO hub_iam_runtime;

CREATE FUNCTION iam.revoke_installation_administrator(p_actor uuid, p_account_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE;
  IF NOT iam.is_installation_administrator(p_actor) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  IF iam.is_installation_administrator(p_account_id)
    AND NOT EXISTS (
      SELECT 1
      FROM iam.installation_administrator AS other_tenure
      JOIN iam.account AS other_administrator
        ON other_administrator.account_id = other_tenure.account_id AND other_administrator.active
      WHERE other_tenure.revoked_at IS NULL AND other_tenure.account_id <> p_account_id)
  THEN
    RAISE EXCEPTION 'LAST_INSTALLATION_ADMINISTRATOR' USING ERRCODE = '42501';
  END IF;
  UPDATE iam.installation_administrator AS tenure
  SET revoked_by = p_actor, revoked_at = clock_timestamp()
  WHERE tenure.account_id = p_account_id AND tenure.revoked_at IS NULL;
END;
$$;

ALTER FUNCTION iam.revoke_installation_administrator(p_actor uuid, p_account_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.revoke_installation_administrator(p_actor uuid, p_account_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.revoke_installation_administrator(p_actor uuid, p_account_id uuid) TO hub_iam_runtime;

-- The first administrator is set from the operator shell, never by the Hub: no Hub role may
-- execute this. It also recovers an installation whose administrators are all inactive, because
-- it refuses only while an active administrator other than the named Account exists.
CREATE FUNCTION iam.bootstrap_installation_administrator(p_account_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE;
  IF NOT EXISTS (
    SELECT 1 FROM iam.account AS target_account
    WHERE target_account.account_id = p_account_id AND target_account.active)
  THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF iam.is_installation_administrator(p_account_id) THEN
    RETURN 'ALREADY_ADMINISTRATOR';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM iam.installation_administrator AS tenure
    JOIN iam.account AS administrator
      ON administrator.account_id = tenure.account_id AND administrator.active
    WHERE tenure.revoked_at IS NULL)
  THEN
    RAISE EXCEPTION 'INSTALLATION_ADMINISTRATOR_EXISTS' USING ERRCODE = '42501';
  END IF;
  INSERT INTO iam.installation_administrator (account_id, granted_via)
  VALUES (p_account_id, 'OPERATOR_BOOTSTRAP');
  RETURN 'GRANTED';
END;
$$;

ALTER FUNCTION iam.bootstrap_installation_administrator(p_account_id uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.bootstrap_installation_administrator(p_account_id uuid) FROM PUBLIC;

COMMIT;
