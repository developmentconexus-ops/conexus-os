BEGIN;

-- Resolving a model needs to know which of the two shapes a credential takes before it decrypts
-- anything: an Anthropic OAuth token set builds a provider instance, because a bounded egress
-- fetch, the beta headers and the identity rewrite cannot ride a config object, while an API key
-- builds Mastra's native config object. The Hub's connection role holds no SELECT on the table,
-- by design, so it asks through a function like every other read in this schema.
--
-- read_current_generation already answers half of this. It stays, because the credential store's
-- refresh loop calls it on a path that must not care what kind of credential it is looking at.

SET LOCAL ROLE claude_connection_owner;

CREATE FUNCTION model_connection.read_connection_credential(p_connection_id uuid)
RETURNS TABLE(provider_id text, credential_kind text, current_generation bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT connection_row.provider_id, connection_row.credential_kind, connection_row.current_generation
  FROM model_connection.connection AS connection_row
  WHERE connection_row.connection_id = p_connection_id AND connection_row.state = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION model_connection.read_connection_credential(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_connection.read_connection_credential(uuid)
  TO hub_r2_connections, hub_rb_ingress, hub_rb_executor, builder_owner;

RESET ROLE;

COMMIT;
