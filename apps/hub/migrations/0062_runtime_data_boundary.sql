BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_runtime') THEN
    CREATE ROLE hub_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'conexus_owner') THEN
    CREATE ROLE conexus_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iam_rls') THEN
    CREATE ROLE iam_rls NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA platform AUTHORIZATION conexus_owner;
REVOKE ALL ON SCHEMA platform FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO hub_runtime;

CREATE TABLE platform.operation_receipt (
  operation_id text NOT NULL,
  authority text NOT NULL,
  account_id uuid REFERENCES iam.account,
  key_digest bytea NOT NULL,
  request_digest bytea NOT NULL,
  resource_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved', 'completed')),
  response_status smallint,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (operation_id, authority, key_digest),
  CHECK ((account_id IS NULL) = (authority LIKE 'bootstrap:%')),
  CHECK ((state = 'completed') = (response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL))
);
ALTER TABLE platform.operation_receipt OWNER TO conexus_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.operation_receipt TO hub_runtime;

DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT n.nspname AS schema_name
    FROM pg_namespace n
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg', 'model', 'connector')
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO hub_runtime', item.schema_name);
  END LOOP;

  FOR item IN
    SELECT DISTINCT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(p.proacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg', 'model', 'connector')
      AND r.rolname LIKE 'hub\_%' ESCAPE '\'
      AND acl.privilege_type = 'EXECUTE'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO hub_runtime', item.signature);
  END LOOP;

  FOR item IN
    SELECT n.nspname AS schema_name, c.relname AS object_name,
      string_agg(DISTINCT acl.privilege_type, ', ') AS privileges
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END::"char", c.relowner))) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE n.nspname IN ('iam', 'workspace', 'project', 'builder', 'reg', 'model', 'connector')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND r.rolname LIKE 'hub\_%' ESCAPE '\'
      AND acl.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'USAGE')
    GROUP BY n.nspname, c.relname
  LOOP
    EXECUTE format('GRANT %s ON %I.%I TO hub_runtime', item.privileges, item.schema_name, item.object_name);
  END LOOP;
END $$;
COMMIT;
