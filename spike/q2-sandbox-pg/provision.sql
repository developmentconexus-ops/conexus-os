-- Adapted from spike/q1-runner/provision.mjs (origin/spike/q1-runner-arena), translated to raw
-- SQL run locally via psql as the cluster's unprivileged owner (conexus-agent, the initdb
-- superuser here) instead of a Node pg client over the network. Same topology: one app database,
-- a hub stand-in with a secret table no Project role may read, and per-Project schema + two roles
-- (runtime DML-only, migrator schema-owner) with public revoked.
create database conexus_apps;
create database hub;

\c hub
create table if not exists hub_secret(k text primary key, v text);
insert into hub_secret values('factory-token','TOP-SECRET-DO-NOT-LEAK') on conflict do nothing;

\c conexus_apps
revoke all on schema public from public;
revoke all on database conexus_apps from public;

create role p_a_runtime login password 'rt_a' nosuperuser nocreatedb nocreaterole;
create role p_a_migrator login password 'mg_a' nosuperuser nocreatedb nocreaterole;
create role p_b_runtime login password 'rt_b' nosuperuser nocreatedb nocreaterole;
create role p_b_migrator login password 'mg_b' nosuperuser nocreatedb nocreaterole;

create schema p_a_preview authorization p_a_migrator;
grant connect on database conexus_apps to p_a_runtime;
grant connect on database conexus_apps to p_a_migrator;
grant usage on schema p_a_preview to p_a_runtime;
alter default privileges for role p_a_migrator in schema p_a_preview grant select, insert, update, delete on tables to p_a_runtime;
alter default privileges for role p_a_migrator in schema p_a_preview grant usage, select on sequences to p_a_runtime;
alter role p_a_runtime set search_path to p_a_preview;
alter role p_a_migrator set search_path to p_a_preview;

create schema p_b_preview authorization p_b_migrator;
grant connect on database conexus_apps to p_b_runtime;
grant connect on database conexus_apps to p_b_migrator;
grant usage on schema p_b_preview to p_b_runtime;
alter default privileges for role p_b_migrator in schema p_b_preview grant select, insert, update, delete on tables to p_b_runtime;
alter default privileges for role p_b_migrator in schema p_b_preview grant usage, select on sequences to p_b_runtime;
alter role p_b_runtime set search_path to p_b_preview;
alter role p_b_migrator set search_path to p_b_preview;

\c hub
revoke connect on database hub from p_a_runtime;
revoke connect on database hub from p_a_migrator;
revoke connect on database hub from p_b_runtime;
revoke connect on database hub from p_b_migrator;
