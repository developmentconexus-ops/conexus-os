SELECT 'version', version();
SELECT 'setting', name, setting, unit, source, context FROM pg_settings WHERE name IN (
  'max_connections', 'reserved_connections', 'superuser_reserved_connections', 'shared_buffers', 'work_mem',
  'statement_timeout', 'transaction_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout',
  'temp_file_limit', 'max_wal_size', 'min_wal_size', 'shared_preload_libraries', 'logging_collector',
  'log_directory', 'data_directory', 'ssl', 'listen_addresses', 'temp_tablespaces') ORDER BY name;
SELECT 'hba', line_number, type, database, user_name, auth_method, coalesce(error, '') FROM pg_hba_file_rules ORDER BY line_number;
SELECT 'role', rolname, rolsuper, rolcreaterole, rolinherit, rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY 2;
SELECT 'db', datname, pg_get_userbyid(datdba), datacl FROM pg_database ORDER BY 2;
SELECT 'ext', extname, extversion FROM pg_extension ORDER BY 2;
SELECT 'pg_stat_statements', count(*) FROM pg_stat_statements;
