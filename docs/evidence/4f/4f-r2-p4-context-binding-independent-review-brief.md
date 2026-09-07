# 4F(R2) — P4 Project Brain binding/context independent review brief

> **Mode:** completed fresh isolated AGY read-only lane over the frozen corrected candidate
> **Implementation candidate:** `ea98b49abbe50fefd3a30774cd28fe14447df032`
> **Implementation base:** `fdbf2bfaa8bb1f391574c651076034d6be2e7ecc`
> **State:** `P4 CORRECTED LOCAL CHECKPOINT REVIEWED / LEAD ADJUDICATED IN STAGE PACKET`
> **Authority:** reviewer output is Evidence; Lead adjudication owns disposition

## Exact review question

Determine whether the candidate safely realizes the bounded PRJ-10/PRJ-11 and
BRN-14 Project Brain binding/context increment without a false-PASS path across
authorization, strong representation preconditions, asynchronous conformance,
Brain/Registry/Project ownership, shared Git/PostgreSQL recovery or migration
least privilege. Also determine whether its deliberately unregistered or
unreachable production paths and stated remaining blockers are honest and
minimal, rather than concealed completion claims or avoidable local gaps.

This is a meaningful P4 implementation checkpoint, not a request to declare P4
closed. Do not infer successful production conformance, live Sankhya behavior,
PRJ-12 clear semantics or BUILD-purpose HTTP admission from controlled fixtures.

## Authority bootstrap and bounded subject

Start from `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`, Engineering Method
1.2, Repository Method, the Conexus development skill and the R2 stage code
packet. Then inspect the exact implementation range
`fdbf2bfaa8bb1f391574c651076034d6be2e7ecc..ea98b49abbe50fefd3a30774cd28fe14447df032`
and only the current Product/architecture/contracts/code/tests needed to
challenge the claims below.

The material implementation surface is migration 015 and the accumulated
migration verifier; Project Brain binding routes/service/database adapters and
shared recovery; Brain Project-context resolver/routes/database adapters and
production composition; platform configuration/server composition; generated
R2 contracts; P4 authority tests and their P1–P3 regression consumers.

Fable review `81e8a0c2-20a9-4530-b7d0-5d89d310d408` over `7efd500`
returned `REVISE`; its repository, authorization and composed-recovery gaps
were corrected. Fresh Fable review `327eb876-ec32-4c9d-aef7-5480b84ddaf4`
over `8bdad7b` also returned `REVISE`: Project settlement credentials could
read a Brain candidate and persist the attestation later consumed by Project.
The frozen candidate separates those operations into the dedicated
least-privilege `hub_r2_brain_attester` pool, proves Project denial, reconciles
durable intent before new-command preflight and adds behavioral pool-wiring and
lifecycle proof. Treat these corrections as claims to attack, not accepted
reviewer conclusions. The earlier AGY attempts produced no report because two
exact composite read-only Git diagnostics were denied; only those exact forms
are now minimally admitted, without a permission bypass.

Accepted R1, R2-P0..P3, the 128-operation Product census and the existing shared
Project recovery design remain upstream. Reopen one only with a concrete
falsifier. Reviewer output cannot invent Product meaning, activate R3/RB, grant
production effects or replace the unresolved owners named below.

## Frozen protected claims

1. **PRJ-10 authorization and representation:** absent and present reads require
   `project.manage`, not `brain.bind`; the strong ETag covers the complete
   response representation, including derived `updateAvailable`, and malformed
   or non-matching conditions fail closed.
2. **PRJ-11 authority before proof:** mutation requires current
   `project.manage + brain.bind`, plus independently current `connection.use`
   for every exact proof subject, before any Git, observer or settlement effect.
   Creator status, stored candidates and prior validation cannot self-authorize.
3. **PRJ-11 current conformance:** Project obtains the authoritative current
   Brain/Registry/source tuple, validates the complete frozen local realization,
   accepts only matching registered conformance Evidence, rereads the complete
   binding representation after asynchronous validation and refuses stale or
   revoked state before attestation/recovery. Dedicated Brain-attester
   credentials alone read the candidate and persist the immutable attestation;
   Project cannot self-attest.
4. **Shared atomic settlement:** the same UUID and discriminated Project intent
   bind candidate, immutable Brain attestation, canonical source declaration,
   deterministic Git child and PostgreSQL source/binding CAS. Failure, replay,
   cancellation, concurrent writers and response loss cannot manufacture
   success or mutate outside the fixed declaration path.
5. **BRN-14 current context:** ordinary HTTP access is READ-purpose and requires
   compound current Brain + Project authority. The resolver joins the current
   binding, current Project Git realization, current local validation and
   current critical health; stale, foreign, missing or blocking dependencies
   are unavailable, while a genuinely validated known-empty context remains a
   successful empty result.
6. **No authority inflation:** BRN-14 exposes Project context and bounded
   authoring references, not Workspace publication, runtime effective slices,
   tools, credentials or provider authority. The local BUILD resolver cannot
   become public BUILD admission while physical IAM lacks the accepted
   `project.build` fact.
7. **Migration 015 least privilege:** owner/runtime function capabilities,
   schemas, tables, columns, default ACLs, grant options and role memberships
   are closed against arbitrary-principal drift while preserving only exact
   predecessor cross-owner references and runtime grants. Migration 015 also
   preserves the deciding 011–014 catalog/source/ACL invariants.
8. **Honest composition and proof:** configuration is closed and optional. The
   server does not register a successful PRJ-11 production path without a
   trusted complete conformance producer. Controlled PostgreSQL, Git-program and
   contract fixtures prove only their named subjects; no fixture, always-refused
   adapter or represented PRODUCTION value proves live Gateway/Sankhya behavior.
9. **Scope preservation:** no dependency, Product operation/record class,
   generic dispatcher, live provider call, credential disclosure, R1 custody
   rewrite, push, PR, merge, deployment, R3 or RB work enters this candidate.

## Concrete falsifiers and proof reconstruction

Attempt to reconstruct a concrete route for any of these failures:

- PRJ-10 absence accidentally invokes the stronger PRJ-11 permission, or the
  full ETag changes without making a supplied precondition stale;
- Registry publication, authorization, Project source, binding or conformance
  changes while validation awaits and PRJ-11 still attests or settles;
- a candidate/validation record proves itself, incomplete/foreign observation
  becomes PROVEN, or caller-selected mapping/source authority reaches an
  observer;
- Git and database truth diverge, another writer's objects are pruned, a stale
  deterministic child wins, or an error/replay reports another binding;
- BRN-14 discloses context without both current authority dimensions, from stale
  Git/validation/health, or treats missing input as known-empty;
- a runtime/arbitrary role gains an unlisted function, table/column privilege,
  grant option, default ACL or protected role membership without the migration
  verifier rejecting it;
- an unconfigured production composition becomes reachable or a controlled
  fixture is described as production conformance/end-to-end proof.

Reconstruct the deciding local proof from production bytes and firing RED
controls. At the frozen candidate, the Lead ran on WSL Ubuntu with Node
24.20.0, npm 12.0.2 and PostgreSQL 17.10:

```text
npm ci + npm run verify + npm run verify:extended PASS / clean committed tree
focused r2:p4:check with real PostgreSQL           82 pass / 8 admitted OCI skips
focused r2:p4:authority PostgreSQL proof          36 pass / 11 admitted OCI skips
cumulative P1 real PostgreSQL regression            6 pass / 0 skips
composed BRAIN restart PostgreSQL + admitted OCI   1 pass / 0 skips / 345.7 s
native R1C-14 successor proof                      31 pass / 0 skips
```

The skips must not be promoted into successful real-Git or production-provider
claims. Previously accepted shared recovery Evidence may support the unchanged
recovery mechanism, but this review should identify any candidate-specific
integration claim that still requires a fresh exact production composition.

Do not mutate the repository or databases, run Docker, access credentials, call
Sankhya or another Product provider, push, create a PR or deploy. The isolated
reviewer CLI invocation itself is the explicitly authorized review provider
call and is not Product runtime Evidence.

## Known incomplete boundaries and non-goals

- **Production PRJ-11 conformance:** the generic closed registry and controlled
  producer proof exist, but no accepted production Gateway registration maps an
  exact source subject to a trusted observer. The server therefore does not
  activate PRJ-10/11 through an empty or always-refused validator. Classify
  whether this is the smallest genuine missing owner/dependency or whether a
  concrete already-authorized production composition was missed.
- **PRJ-12 clear:** current authority does not choose deletion of
  `.conexus/project/brain-binding.json` versus a canonical empty declaration.
  Do not select one by reviewer preference; identify only evidence that an
  accepted owner already decides it or that another smaller ambiguity exists.
- **BRN-14 BUILD:** implementation supports a purpose-bound resolver, but HTTP
  remains ordinary READ because physical IAM has no `project.build` admission
  fact. Do not infer the fact from another permission.
- Live Sankhya credentials, company codes, ERP reads, production deployment,
  browser work, Mastra/LLM execution, R3/RB and general framework hardening are
  outside this checkpoint.

## Output contract

Return one verdict: `CLEAR`, `REVISE` or `STOP`.

For every finding provide exactly:

```text
classification: METHOD FINDING | PRODUCT / PLAN GAP | LOCAL EXECUTION GAP | NO FINDING
evidence: exact file/line and reproducible observation
failure mode and materiality
protected claim or target invariant
smallest real owner/stage
must current work stop: yes/no and exact affected path
smallest correction or owner decision required
scope that must NOT reopen
```

Mark non-blockers `DEFER SAFELY` with why-safe, revisit trigger and later owner.
Do not compare lanes, request another reviewer or recommend a second review
round unless a surviving material correction would invalidate a protected
property or the reliability of its deciding proof.
