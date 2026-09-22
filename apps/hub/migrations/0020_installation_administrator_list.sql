BEGIN;

-- The settings screen lists every open tenure and grants a new one by email, rather than by
-- account id: an administrator names a person by the address they sign in with, never by a uuid
-- they cannot see. Both functions sit beside iam.grant_installation_administrator and answer the
-- same actor check and the same table lock, so a listing always reflects a concurrent grant or
-- revoke rather than racing it.
CREATE FUNCTION iam.list_installation_administrators(p_actor uuid) RETURNS TABLE (
    account_id uuid,
    display_name text,
    email text,
    granted_via text,
    granted_by uuid,
    granted_by_display_name text,
    granted_at timestamp with time zone
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
BEGIN
  IF NOT iam.is_installation_administrator(p_actor) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      administrator.account_id,
      administrator.display_name,
      administrator.email,
      tenure.granted_via,
      tenure.granted_by,
      grantor.display_name,
      tenure.granted_at
    FROM iam.installation_administrator AS tenure
    JOIN iam.account AS administrator
      ON administrator.account_id = tenure.account_id AND administrator.active
    LEFT JOIN iam.account AS grantor ON grantor.account_id = tenure.granted_by
    WHERE tenure.revoked_at IS NULL
    ORDER BY tenure.granted_at ASC;
END;
$$;

ALTER FUNCTION iam.list_installation_administrators(p_actor uuid) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.list_installation_administrators(p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.list_installation_administrators(p_actor uuid) TO hub_iam_runtime;

-- Resolves the target the same way the operator's bootstrap script does: an active Account whose
-- email matches case- and whitespace-insensitively. Zero matches and more than one match are
-- distinct refusals, because "nobody has this address" and "this address is ambiguous" call for
-- different next steps from whoever is granting.
CREATE FUNCTION iam.grant_installation_administrator_by_email(p_actor uuid, p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  v_matches uuid[];
BEGIN
  LOCK TABLE iam.installation_administrator IN SHARE ROW EXCLUSIVE MODE;
  IF NOT iam.is_installation_administrator(p_actor) THEN
    RAISE EXCEPTION 'NOT_ADMITTED' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(account_id) INTO v_matches
  FROM iam.account
  WHERE active AND lower(btrim(email)) = lower(btrim(p_email));
  IF v_matches IS NULL OR array_length(v_matches, 1) = 0 THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF array_length(v_matches, 1) > 1 THEN
    RAISE EXCEPTION 'ACCOUNT_EMAIL_AMBIGUOUS' USING ERRCODE = 'P0003';
  END IF;
  INSERT INTO iam.installation_administrator (account_id, granted_via, granted_by)
  VALUES (v_matches[1], 'ADMINISTRATOR', p_actor)
  ON CONFLICT (account_id) WHERE revoked_at IS NULL DO NOTHING;
  RETURN v_matches[1];
END;
$$;

ALTER FUNCTION iam.grant_installation_administrator_by_email(p_actor uuid, p_email text) OWNER TO iam_owner;

REVOKE ALL ON FUNCTION iam.grant_installation_administrator_by_email(p_actor uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam.grant_installation_administrator_by_email(p_actor uuid, p_email text) TO hub_iam_runtime;

COMMIT;
