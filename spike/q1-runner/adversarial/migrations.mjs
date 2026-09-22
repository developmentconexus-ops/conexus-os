// Migration-role attacks: each statement must be REFUSED by Postgres privileges.
// Run as p_a_migrator against conexus_apps. BREACH = any statement succeeded.
export const MIGRATION_ATTACKS = [
  { id: 'mig_create_extension', sql: 'create extension if not exists dblink' },
  { id: 'mig_security_definer', sql: 'create or replace function p_a_preview.esc() returns text language sql security definer as $$ select current_user $$' },
  { id: 'mig_copy_program', sql: "copy (select 1) to program 'id > /tmp/pwn'" },
  { id: 'mig_alter_role', sql: 'alter role p_a_runtime superuser' },
  { id: 'mig_grant_cross', sql: 'grant usage on schema p_a_preview to p_b_runtime' },
  { id: 'mig_create_schema_foreign', sql: 'create schema evil authorization p_a_migrator' },
  { id: 'mig_read_hub_fdw', sql: 'create extension if not exists postgres_fdw' },
  { id: 'mig_write_pg_catalog', sql: "update pg_authid set rolsuper=true where rolname='p_a_migrator'" },
];
