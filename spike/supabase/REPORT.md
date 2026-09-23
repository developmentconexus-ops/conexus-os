# Spike report. Supabase self-hosted as the Stage 2 application backend

Throwaway spike. Not merged, no PR. Run on the operator's laptop (16-core, ~24 GB RAM), WSL2
Ubuntu, native docker-ce. Self-hosted only; Supabase Cloud needs an account the operator has not
created, so Cloud was not tested (see the Cloud paragraph at the end).

## Setup actually run

Official `supabase/supabase` `docker/` compose (current default gateway is `api-gw`, backed by
Envoy, not Kong; no override needed). `.env` patched with freshly generated secrets and custom
host ports: Postgres `5442`, Supavisor pooler `6549`, gateway `8000` (ports `3443`/`3444` and every
`conexus-*` container were left untouched throughout). Two Projects, `project_a` and `project_b`,
each its own Postgres schema, each with its own no-login Postgres role (`proj_a_role`,
`proj_b_role`) granted to `authenticator`, RLS on both `items` tables keyed on the JWT `sub` claim.
Keycloak was stood in for with a locally generated RS256 key pair and a JWKS served through
`JWT_JWKS` in `.env`, so PostgREST verifies tokens against that JWKS the same way it would verify
a real Keycloak-issued token, without touching the pilot Keycloak. Two Edge Functions, `fn-a` and
`fn-b`, one per Project, running the same adversarial-case shape as the Q1 runner arena
(`spike/q1-runner/adversarial/`) so results line up case for case.

## 1. Footprint

11 containers for the full stack (db, rest, auth, realtime, storage, meta, pooler, api-gw/envoy,
imgproxy, studio, edge-functions). Idle, `docker stats --no-stream` totals **~1.36 GiB RAM**
across all 11, no container above 275 MiB, all CPU at or near 0%. Cold start: `docker compose up
-d` returns in 40 s; 10 of 11 healthchecks pass within 51 s. The 11th, `rest` (PostgREST), stays
unhealthy until the Project schemas exist, because it queries the configured schema list at boot
and refuses to serve on a missing schema; it recovers within roughly 10 s of the tenancy SQL
running. In an operational rollout the schema migration would run before or as part of bring-up, so
the realistic all-healthy cold start is **on the order of 60 s** once the data model exists. This
runs beside the pilot Postgres/Keycloak with no measured contention; the pilot Hub itself was not
running during this spike (confirmed before and after), so no interference claim is made either
way.

## 2. Data isolation per Project

Shape (a) from the handoff, one stack with schema-per-Project and a JWT-claim-selected Postgres
role, is what was built and tested; shape (b) (Supabase's own multi-project primitives) does not
exist in self-hosted Supabase at all, only in Cloud, so only (a) applies here.

Two independent layers, tested separately:

- **Hard permission boundary.** A token minted with `role=proj_a_role` (Project A) against
  `Accept-Profile: project_b` gets Postgres error `42501 permission denied for schema project_b`,
  HTTP 403. The reverse (`proj_b_role` against `project_a`) gets the symmetric `42501` on
  `project_a`. Project A cannot read Project B through PostgREST, and vice versa.
- **RLS keyed on `sub`, inside one Project.** Two different callers with the same `role` claim
  (`user-a1` and `user-a2`, both `proj_a_role`) each see only their own row in `project_a.items`,
  confirming RLS enforces per-caller isolation on top of the per-Project role boundary.

## 3. Keycloak trust (stand-in JWKS)

PostgREST, configured with `JWT_JWKS` and no shared HS256 secret, verified RS256 tokens signed by
the locally generated key pair and used the `role` and `sub` claims from that externally-issued
token to select the Postgres role and filter rows. This is the mechanism Keycloak would use in
production: Keycloak stays the only signer, Supabase only ever sees its public JWKS. One real
friction surfaced along the way: Supabase's own legacy `ANON_KEY`/`SERVICE_ROLE_KEY` are HS256
JWTs signed with `JWT_SECRET`. Once the stack is configured for external-JWKS verification only
(no shared HS256 secret registered), those legacy keys stop decoding (`PGRST301: No suitable key
was found to decode the JWT`). Adopting external OIDC trust for end-user tokens does not
automatically carry the platform's own internal keys; those need a separate, deliberate migration
(new opaque `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS`, present in this compose file, look
like the intended replacement but were not exercised here).

## 4. Edge Functions as the handler runtime

Read of `supabase/edge-runtime`'s `main/index.ts` (the function router) shows every invocation
builds its worker's environment as `{ ...Deno.env.toObject(), SUPABASE_FUNCTION_SLUG: service_name
}`: the entire container environment, unfiltered, plus only a per-request slug tag. That container
environment includes `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`, a raw
`postgres://postgres:<password>@...` superuser connection string, both set once for the whole
`functions` service, not per Project. This was proven live, not just read:

| case | expected | observed (fn-a) | observed (fn-b) | pass |
|---|---|---|---|---|
| env_secrets | refuse (no sensitive keys visible) | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `JWT_SECRET`, `SUPABASE_SECRET_KEYS` all visible | same | **no** |
| direct_db_bypass | refuse (0 rows from the other Project) | connected as `postgres`, read 1 row from `project_b.items` (`user-b1`, "B1 seed row") | connected as `postgres`, read 2 rows from `project_a.items` | **no** |
| cross_project_rest | refuse | 401, `PGRST301` (see note) | 401, `PGRST301` | yes, but not for the reason it should be (see note) |
| read_files | refuse | `/etc/passwd`, `/proc/1/environ`, the other function's source all denied | same | yes |
| network_egress | internet ok; pilot Hub and Docker socket blocked | internet reachable; `127.0.0.1:3443` blocked (client error); Docker socket blocked | same | yes |
| time_bound | terminate | killed by supervisor in 3 s (`WorkerRequestCancelled`) | killed in 4 s | yes |
| mem_bound | terminate | killed by supervisor in 1 s | killed in 1 s | yes |
| crash | terminate, others keep serving | HTTP 500, function slug still answers `echo` immediately after | same | yes |

**The key question the handoff asked is answered: no.** Generated function code cannot be confined
to its own Project's data without the service role key, because in this stock configuration every
function gets the service role key and the raw superuser DB URL regardless of which Project it
belongs to, and `direct_db_bypass` demonstrates a Project A function reading Project B's rows (and
the reverse) through that ambient credential, entirely outside PostgREST and RLS. `cross_project_rest`
"passing" is not real protection: it fails only because this spike's JWKS-only PostgREST
configuration cannot verify the legacy HS256 service-role key either (the same friction as
section 3), so the request never gets far enough to test whether the service role's actual grants
would have allowed the read. A stock configuration that keeps the default HS256 secret alongside
JWKS would very likely also pass `cross_project_rest` for the same reason `direct_db_bypass`
passes: `service_role` is designed to bypass RLS and typically holds broad grants. Crash isolation
and resource bounds work well (comparable to the runner arena's Arm A/B); the data boundary does
not, and it fails on the two cases that matter most.

## 5. Latency

200 sequential calls each, against `http://localhost:8000/rest/v1/bench_items` (PostgREST, through
the gateway, 500-row public table) and `http://functions:9000/fn-a?case=echo` (Edge Function,
direct container network, no gateway hop):

| target | p50 | p95 | p99 |
|---|---|---|---|
| PostgREST list | 1.7 ms | 2.6 ms | 3.8 ms |
| Edge Function | 1.7 ms | 3.5 ms | 4.5 ms |
| Runner arena Arm A (bubblewrap, per-invocation) | 49 ms | 60 ms | — |
| Runner arena Arm B (per-Project container) | 91 ms | 110 ms | — |

Both Supabase paths are roughly 30-50x faster than either runner-arena arm on this host. This is
not an apples-to-apples query (a trivial indexed select vs. the arena's Node handler plus process
or sandbox spin-up per call), but the gap is large enough that Supabase's steady-state request path
is not the bottleneck a generated-app backend would hit.

## 6. Operational cost to Conexus

Even adopting Supabase's data layer, Conexus would still own: per-Project provisioning (creating
the schema, roles, grants and RLS policies — none of this exists until something runs
`setup-tenancy.sql`'s equivalent per new Project); migrations (Postgres migrations are Conexus's
concern the same as today, Supabase does not add or remove anything here); backups (self-hosted
ships no backup automation; this is unmanaged Postgres); upgrades (11 pinned image tags to track
and roll forward together); and secret custody (`.env` holds the DB password, JWT signing
material, and now two more key families for the platform's own auth, none of it centrally
rotated). Supabase self-hosted removes the work of writing PostgREST-equivalent CRUD and RLS
plumbing by hand, and removes nothing else on this list.

## Verdict: ADOPT_PARTS

Adopt Postgres + PostgREST + RLS + JWKS-verified external auth as the Stage 2 data layer: schema-
per-Project plus role-per-Project plus `sub`-keyed RLS is a real, proven boundary (section 2), the
JWKS trust model lets Keycloak stay the only signer (section 3), and the latency is not a concern
(section 5). Reject stock Supabase Edge Functions as the handler runtime for generated code: the
ambient `SUPABASE_DB_URL`/`SUPABASE_SERVICE_ROLE_KEY` in every function's environment is a
cross-Project data breach proven live in section 4, not a theoretical one, and closing it means
either forking `edge-runtime` to strip and per-Project-scope that environment before each worker is
created, or not using `edge-runtime` at all. The Q1 runner arena's Arm A or Arm B, which passed the
equivalent case (`cross_project_sql`) cleanly and enforces isolation at the process/sandbox
boundary rather than through an ambient credential, is the safer handler runtime; nothing here
argues for replacing that decision.

## Supabase Cloud, what would differ

Not tested (needs an operator-created account); stated from Supabase's published Cloud terms.
Free tier caps at 2 active projects, 500 MB database, and pauses a project after 7 days of no API
requests, with no automated backups — unworkable for a Stage 2 backend meant to host many
generated Projects continuously. Data would leave the company's own infrastructure onto Supabase's
cloud, a materially different trust posture than self-hosting beside the pilot Hub. A Cloud project
also cannot reach a JWKS served from a laptop (`https://keycloak-stub.local/...` or the real pilot
Keycloak on `127.0.0.1`): Keycloak would need a publicly reachable endpoint for Cloud PostgREST to
fetch its JWKS, which self-hosted does not require. The Edge Functions finding in section 4 is a
property of the `edge-runtime` image itself, not of self-hosting, so it would very likely apply on
Cloud too, though it was not tested there.

## Teardown

Stack was stopped at the end of this spike run:

```
cd ~/spike-supabase/supabase-src/docker && docker compose down
```

Images were kept (D: had 105+ GB free throughout, well above the 40 GB threshold). To remove them
too: `docker compose down --rmi all -v` from the same directory (the `-v` also drops the seeded
tenancy data).
