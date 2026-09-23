-- Two-Project tenancy test: shape (a) from the spike handoff.
-- Isolation has two independent layers so we can measure each:
--   1. Hard DB permission boundary: PostgREST switches Postgres role from the
--      JWT `role` claim (a per-project role granted to `authenticator`).
--      A token minted for project_a carries role=proj_a_role, which has no
--      grant at all on the project_b schema.
--   2. RLS keyed on the JWT `sub` claim, so two different users inside the
--      SAME project cannot read each other's rows.

create schema if not exists project_a;
create schema if not exists project_b;

create role proj_a_role nologin noinherit;
create role proj_b_role nologin noinherit;
grant proj_a_role to authenticator;
grant proj_b_role to authenticator;

create table project_a.items (
  id bigserial primary key,
  owner_sub text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table project_b.items (
  id bigserial primary key,
  owner_sub text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table project_a.items enable row level security;
alter table project_b.items enable row level security;

-- Only the grant below makes a row visible; RLS is a second, independent gate.
grant usage on schema project_a to proj_a_role;
grant select, insert on project_a.items to proj_a_role;
grant usage, select on sequence project_a.items_id_seq to proj_a_role;

grant usage on schema project_b to proj_b_role;
grant select, insert on project_b.items to proj_b_role;
grant usage, select on sequence project_b.items_id_seq to proj_b_role;

create policy items_owner_only on project_a.items
  for all
  to proj_a_role
  using (owner_sub = current_setting('request.jwt.claims', true)::json->>'sub')
  with check (owner_sub = current_setting('request.jwt.claims', true)::json->>'sub');

create policy items_owner_only on project_b.items
  for all
  to proj_b_role
  using (owner_sub = current_setting('request.jwt.claims', true)::json->>'sub')
  with check (owner_sub = current_setting('request.jwt.claims', true)::json->>'sub');

insert into project_a.items (owner_sub, body) values
  ('user-a1', 'A1 seed row'),
  ('user-a2', 'A2 seed row (same project, different owner)');
insert into project_b.items (owner_sub, body) values ('user-b1', 'B1 seed row');

-- Latency benchmark table: 500 rows, no RLS, public schema, anon-readable.
create table if not exists public.bench_items (
  id bigserial primary key,
  body text not null
);
grant select on public.bench_items to anon;
insert into public.bench_items (body)
select 'row ' || g from generate_series(1, 500) g
where not exists (select 1 from public.bench_items limit 1);
