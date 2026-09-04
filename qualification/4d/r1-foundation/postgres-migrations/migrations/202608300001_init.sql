CREATE SCHEMA app AUTHORIZATION migration_owner;

CREATE TABLE app.items (
  item_id text PRIMARY KEY,
  name text NOT NULL,
  revision integer NOT NULL CHECK (revision >= 0)
);

ALTER TABLE app.items OWNER TO migration_owner;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON TABLE app.items FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO migration_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE app.items TO migration_runtime;
