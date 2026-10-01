# 0005. Rationale: cargos, perfis and a platform row floor

## Context

An app the Builder makes knows who the person is (`caller`) but not what they may do. Every
operation is open to everyone who opens the app, and "see only your own rows" exists only when the
generated handler remembers to filter. The Q3 task listed "no groups, roles or per-row data policy
inside an application" as a non-goal with a reopen trigger; real company apps (sales, purchasing,
approvals) trigger it.

Facts from today's code shape the answer:

- Every call passes one Hub choke point (`application-invoker.ts`) into one runner, and the runner
  admits the manifest again from the exact bytes it runs (`supervisor.ts:254-261`). A guard can sit
  next to those bytes.
- The handler gets a raw `db.query` on a runtime role that is `NOBYPASSRLS` and owns nothing
  (`data-plane.ts:59`). It can call `set_config`, so a session variable cannot carry identity.
- The pg relay already reads each session's `BackendKeyData` (`pg-relay.ts:211`) and is the only path
  from the sandbox to Postgres.
- Tables belong to the Project's migration role, so enabled (not forced) row security binds the
  runtime role while backfills still see every row.
- The access rule today is "open grant or Workspace member" (`0023_application_session.sql:31`),
  checked on every request by seven functions.
- CVE-2025-48757 is the failure to avoid: a generated app platform whose access lived only in
  generated code, with tables shipped without row policies.

The operator decided on 2026-10-01 (records D1 to D6 of the study): cargos live in Conexus IAM, one
list per installation, managed by the administrator; each app declares its own perfis; the owner
maps perfis to cargos; perfis control operations (platform) and rows. Keycloak only proves identity.

## Options considered

### Option 1: Access in code, `defineOperation({ allow, run })`, rows filtered by the handler

**Pros**:
- The nicest authoring; common in SDKs.

**Cons**:
- The platform must run or parse generated code to learn the guard.
- Rows stay protected only by generated filters: the CVE case.

### Option 2: Access as manifest data, runner guard, pid binding, platform policies (chosen)

The manifest declares perfis, `allow` per operation, `reads` per operation and a row scope per
table. The runner refuses before any sandbox; the relay binds the acting principal to the backend
pid; the platform writes the policies and a census proves nothing else exists.

**Pros**:
- Generated code never decides access and never writes a policy; a missing filter cannot cross the
  floor.
- One rule each: the door is one SQL function, the guard one pure function.
- Narrowing per operation keeps types, guard and policies in agreement.
- No secret enters the sandbox.

**Cons**:
- A coarse row vocabulary (`OWNER`, `INHERIT`, `SHARED`); teams and regions are handler filters.
- Migrations lose rules, triggers, owner cascades and definer views.
- One provisioner round trip per database session.

### Option 3: Option 2 with a signed session variable, forced row security and separate grants

**Pros**:
- The PostgREST pattern most people know.

**Cons**:
- The relay drops startup parameters, so the token needs a `SET` after connect and a bearer lives
  inside the untrusted worker.
- Forced row security makes backfills by the owner touch zero rows.
- Grants beside bindings are two sources for "who opens the app".

Also rejected: a policy engine (a sidecar and a language for a two dimensional problem), Mastra
RBAC and FGA (they guard Mastra routes, not the runner socket, and need an Enterprise license), and
a Postgres role per perfil (roles multiply by Project and still cannot say "own rows").

## Rationale

Two independent design runs converged on access as data, a guard at the runner, perfis without
cargos in the principal, platform generated policies and a census. A cross judge and the operator's
session picked the first run's design as the base and grafted from the second: the authorization
matrix proved against the real runner, one normalization for both manifest stages with a generated
`Handler<'op'>` type, and a hard cutover where v1 manifests fail closed.

Two adversarial reviews then found defects the design had as written, and this spec carries their
fixes (R1 to R10): bind before any client byte reaches the backend, key the binding on pid,
`session_user` and expiry because the provisioner cannot read other roles' `backend_start`, run
converge and census inside the migration transaction and quarantine on a finding, refuse rules,
triggers, routines, inheritance and owner cascades, ship IAM, manifest v2 and enforcement together,
keep the Hub and runner in one image, run the matrix Hub side at prepare (the check sandbox has no
Postgres), add a people lookup, inherited row scope, per operation `reads` and a system owner for
backfills, drop the email holder, and state the limits that remain.

Operator decisions of 2026-10-01: the door rule (opening the live app requires a perfil; developers
use the Preview); everyone in the company excludes external accounts; the owner may map a perfil to
a single person, shown apart; Entra group sync later, only on a real need; cargos have a kind,
`INTERNAL` or `EXTERNAL`, and external accounts hold only external cargos (R11); `EVERYONE` covers
every active person from the company, with or without a cargo, and the Pessoas screen warns about
people with no cargo without blocking them, so a new hire is not locked out of apps meant for
everyone while the administrator catches up.

## Evidence

- Platform identity study, 2026-10-01, in the operator's study notes: current model and decisions
  D1 to D6, the code map of the authority path (seams A to I), the authorization research, the
  Keycloak administration study.
- The design arena: two candidates, the cross judge, and the synthesis with R1 to R11.
- Two interrogations of the chosen design against the code: findings A1 to A9, B1 to B5, C1 to C4,
  and H1 to H8, M1 to M12, L1 to L5.

## References

**Project sources**:
- `docs/decisions/index.md`: C-015, C-026, C-028, C-030.
- `docs/tasks/stage2-q3-application-identity-qualification.md` section 9 (the non-goal).
- `docs/product/permission-contract.md` sections 4 and 5; `docs/product/operation-ledger.md`
  `IAM-11` to `IAM-13`.
- `apps/hub/src/app-runner/{supervisor,data-plane,pg-relay,worker,requests,server-manifest}.ts`,
  `apps/hub/src/platform/caller.ts`, `apps/hub/src/identity-access/host-sessions.ts`,
  `apps/hub/src/mar/application-host-routes.ts`, `apps/hub/src/builder/application-check.ts`,
  `apps/hub/compiler-template/generate-client.mjs`, migrations 0022 to 0030 and 0042,
  `scripts/provision-application-database.mjs`, `builder-skills/conexus-server/SKILL.md`.

**Practices & standards**:
- Default deny; authorization declared outside the handler body; UI hiding is cosmetic.
- Row security with `WITH CHECK` per command, `security_invoker` views, no definer bypass.
- Derive generated types from the authoritative schema.

**Links**:
- PostgreSQL row security policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- CVE-2025-48757: https://nvd.nist.gov/vuln/detail/CVE-2025-48757
