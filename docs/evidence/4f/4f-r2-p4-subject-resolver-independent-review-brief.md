# 4F(R2) — P4 trusted key-conformance subject independent review brief

> **Mode:** two fresh isolated read-only lanes over one frozen implementation
> **Implementation candidate:** `b5e58a4140afc3c1646fd59db4ecdfa6dd28dd2d`
> **Comparison base:** `f25d48e68ef6c989c56ef99aa3b4d440cac806ac`
> **State:** `CANDIDATE / INDEPENDENT REVIEW PENDING`
> **Authority:** reviewer output is Evidence; Lead adjudication owns acceptance

## Exact review question

Determine whether R2-P4 resolves one current trusted registered Sankhya
key-conformance subject from independent Project source, Project/IAM and
Connections authority, derives the exact closed `sourceScopeId` in Gateway and
refuses false positive observation across malformed source, revoked authority,
stale qualification, subject drift or resolver failure, without acquiring
credential, mutation, live-provider or later-stage authority.

## Authority bootstrap and bounded subject

Start from `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`, Engineering Method
§1.2, Repository Method, `docs/evidence/4f/4f-r2-stage-code-packet.md` (especially
the ratified registered key-conformance subject),
`docs/reference/integrations-and-gateway.md` §19.1.1 and
`docs/product/permission-contract.md`'s R2-P4 successor. Accepted Product,
architecture and contract owners remain authority; reviewer output may expose a
falsifier but cannot replace them or close P4.

Inspect candidate `b5e58a4` against base `f25d48e`: migration `017` and
`atlas.sum`; the shared closed manifest parser; Project source/basis resolver;
Gateway registered subject and observer composition; Brain acceptance changes;
migration runner; package scripts; and directly deciding P4 tests. Expand only
for a named contradiction or proof need.

## Frozen protected claims

1. **No self-attestation:** Gateway supplies only a frozen server registration
   to the trusted resolver. Neither caller nor Brain-provided
   `expectedInputDigest`, source revision, source scope, qualification, config or
   credential coordinate may manufacture the resolver's current subject.
2. **Exact owner split:** Project resolves current Project/source/binding and
   stored Project-scoped `brain.bind` + `connection.use`; Connections resolves
   owner containment, exact current Connection revision, admitted
   `sankhya-om@1.0.0` config, credential generation and exact latest passing
   qualification; Gateway alone derives source scope and controls the
   registered observation. No layer gains credentials, mutation or generic read.
3. **Closed source scope:** `sourceScopeId` is lowercase SHA-256 over the exact
   ordered UTF-8 JSON ratified by the stage packet. The canonical lowercase
   Connection UUID, integer company code and closed environment token are used;
   all Gateway, Brain and SQL acceptance boundaries agree on the 64-hex identity.
4. **Independent current source:** production Project source reading validates
   the current source revision, closed Brain manifest, APP-owned source inputs,
   exact mapping registration and exact `PLATFORM-CONTRACT` Connection
   declaration. Database authority is re-read after source I/O; Git declaration
   and database basis must be concordant.
5. **Fail-closed observation:** missing, malformed, revoked, cross-owner or stale
   authority refuses before observation. Resolver failure or before/after subject
   drift is `INDETERMINATE`, never a positive conformance result. Empty complete
   data remains distinct from unavailable/incomplete data.
6. **Least privilege and migration custody:** role
   `hub_r2_key_conformance_subject` has only database connect, Project schema
   usage and execution of the exact owner-composed resolver. It cannot bypass
   owner/IAM checks, inspect credentials/tables directly or acquire authority via
   grants, memberships, default ACL, RLS, rules or triggers. Migration `017`
   preserves prior migration bytes, repeatability and the cumulative role census.
7. **Composition and honest proof:** production composition uses the trusted
   resolver and controlled registered observer; an empty, caller-backed or
   fixture-only adapter cannot silently satisfy production admission. Tests
   label controlled PostgreSQL/observer and real OCI Git truth accurately and
   claim no live Sankhya/provider behavior.
8. **Scope preservation:** no Product operation, public route, server activation,
   arbitrary query/SQL/URL, durable receipt, credential materialization,
   production query registration, physical Sankhya mapping, network/provider
   call, dependency, push, PR, merge or P5+ work is admitted.

## Falsifiers and proof reconstruction

Return a blocking finding only for a reproducible false PASS, false STOP,
protected-property violation, unauthorized effect or correctness-critical
missing authority affecting claims 1–8. In particular, challenge caller digest
reuse, source/database declaration disagreement, noncanonical UUID or JSON,
revision/qualification/credential-generation races, source changes during I/O,
cross-owner Connections, historical passing qualification, SQL privilege
leakage, malformed manifests and positive results after any indeterminate path.

Lead reconstruction on pinned WSL Node `24.20.0` / npm `12.0.2`:

- `npm ci` passed (two low audit advisories, no install failure).
- clean `npm run verify` passed after the implementation commit, including P0–P4,
  repository/current-state, custody and complete wire checks.
- the integrated P4 local gate passed `89`, failed `0`, with `12` explicitly
  opt-in environment skips; its authority group passed `29`, failed `0`, with
  `19` explicit environment skips.
- an independently provisioned disposable PostgreSQL `17.10` rerun passed the
  migration, subject authority and composed subject suites `6/6`, with zero
  skips. The composed real OCI Git + PostgreSQL + controlled-observer proof
  passed in `171.7 s`; the combined run completed in `211.5 s`. The container
  was removed afterward.
- focused pure/regression checks passed `43`, failed `0`; one real-OCI opt-in
  case was intentionally skipped in that local-only invocation. Typecheck,
  import law, Biome and `git diff --check` passed.

Reconstruct claims from production bytes and deciding RED controls. Do not run
Docker, mutate the checkout/database, access secrets, call Sankhya or a Product
provider, install dependencies, push, open a PR or merge. The independent
reviewer CLI call itself is an authorized review-provider call and is not
Product runtime Evidence.

Production registration and the real Sankhya observer remain explicitly
unproved and gated. Generic hardening, future registration design and P5+ are
non-goals unless a concrete current candidate path violates claims 1–8.

## Output contract

Return exactly one verdict: `CLEAR`, `REVISE` or `STOP`. For every finding give
its classification (`METHOD FINDING`, `PRODUCT / PLAN GAP`,
`LOCAL EXECUTION GAP` or `NO FINDING`), exact file/line evidence, reproducible
failure path, violated protected claim, smallest correction and scope that must
not reopen. Mark non-blockers `DEFER SAFELY` with why-safe, revisit trigger and
later owner. Do not compare lanes, consult another reviewer's output or propose
a rerun unless a material correction changes the reviewed property or deciding
proof.
