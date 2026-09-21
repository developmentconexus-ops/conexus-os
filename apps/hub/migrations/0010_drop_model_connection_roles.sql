BEGIN;

-- 0009 dropped these roles only when nothing depended on them, but a login role is provisioned with
-- CONNECT on its own database, and a database ACL is a cluster-level dependency 0009 never revoked.
-- So the drop was skipped everywhere. This revokes what the roles hold on the current database and
-- drops them. A role another database on the same cluster still grants to is left for that
-- database's own run of this migration.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['hub_model_connection', 'model_connection_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON DATABASE %I FROM %I', current_database(), role_name);
      BEGIN
        EXECUTE format('DROP ROLE %I', role_name);
      EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

COMMIT;
