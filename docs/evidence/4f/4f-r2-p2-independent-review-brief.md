# 4F(R2) — P2 independent closure review brief

> **Mode:** two fresh isolated read-only lanes over one frozen candidate
> **Candidate:** `docs/evidence/4f/4f-r2-p2-review-candidate.json`
> **Implementation commit:** `025339096af65d19a7aa9bd07892262367cc6644`
> **State:** `CANDIDATE / INDEPENDENT REVIEW PENDING`
> **Authority:** reviewer output is Evidence; Lead adjudication owns closure

## Exact review question

Determine whether R2-P2 implements one independent canonical Workspace Brain
bootstrap, publishes exactly one immutable Registry revision, settles exact
Brain health and exposes only `BRN-01/02/03/10` through production modules,
without a false-PASS route across Git custody, PostgreSQL owner isolation,
authorization or proof classification.

## Authority bootstrap and bounded subject

Start from `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`, Engineering Method
1.2, Repository Method, the R2 stage code packet and the candidate manifest.
Inspect the implementation commit and only the current P2 production/test paths
needed to challenge the claims below: migration 011 and `atlas.sum`; Registry,
Brain, configuration and composition modules; bootstrap and migration runners;
P2 tests; package scripts; required CI. Treat accepted Product contracts and
the stage packet as authority. Reviewer output cannot open P3 or change Product
meaning.

## Frozen protected claims

1. **Exact reachability:** only `BRN-01/02/03/10` first become reachable in P2;
   no later R2 operation, generic dispatcher or Registry payload leaks through
   the DTO boundary.
2. **Independent source custody:** Brain source is an exact Git revision beneath
   a Brain-owned root physically and logically distinct from Project Git roots.
   Bootstrap admits only the exact Git OCI index, version and executable bytes,
   and local verification prevents a remote-Docker or mutable-image false PASS.
3. **Immutable publication:** the deterministic root commit, Registry artifact
   and revision are immutable and retry/concurrency safe; publication cannot
   expose partial Git state or advance database truth before durable local Git
   bytes exist.
4. **Health truth:** `UNVERIFIED`, `VALID`, `SUSPECT`, `INVALID` and
   `CHECK_ERROR` remain distinct; health identity binds the immutable Brain
   revision and JSON `null` cannot masquerade as a state.
5. **Authorization isolation:** `brain.read` is independent, default-deny and
   granted only by exact Workspace membership/capability settlement. Runtime,
   bootstrap and owner principals cannot acquire one another's authority through
   schema/table/column/function/default ACL, membership, RLS, rule or trigger
   drift.
6. **Filesystem and input safety:** authority files, Brain roots, mounts,
   hardlinks, symlinks, refs, alternates, objects and pending recovery fail
   closed at their exact boundaries; required file and directory durability is
   established before publication.
7. **Honest proof:** real PostgreSQL 17.10 and the exact admitted Git OCI execute
   the production bootstrap CLI and the four production routes. The source is
   explicitly synthetic/non-production. Static/local stand-ins do not claim
   live Git, production admission, Mastra, LLM or provider proof.
8. **R1 and scope preservation:** R1, P0 and P1 remain green; no production
   effect, provider/model call, dependency addition, push, PR, merge, P3 work or
   later-tranche authority occurs.

## Falsifiers and proof reconstruction

Return a blocking finding only for a reproducible false PASS, false STOP,
protected-property violation, unauthorized effect or correctness-critical
missing authority affecting claims 1–8. In particular, challenge nested mounts,
remote-daemon success without local bytes, hardlinks, rogue refs/alternates,
partial durability, concurrent entrypoints, `.pending` recovery, state JSON
`null`, same-content cross-revision health, latent ACLs, arbitrary principals,
grant options, disabled triggers and non-empty rules/default ACLs.

Reconstruct proof from current production bytes, firing RED controls and the
manifested real executions. Do not invoke Docker, mutate the repository or
database, access secrets, call a provider/model from Product code, push or open
a PR. The independent reviewer CLI call itself is the authorized review
provider call and is not Product runtime Evidence.

The operational bootstrap role is intentionally trusted and not server-exposed;
SQL alone does not prove Git source-revision truth. The production bootstrap
script plus exact local Git verifier owns that proof. The owner-custodied
human-review receipt is sufficient only for this exact synthetic non-production
bootstrap; P2 does not claim a generic signed production review system.

Generic hardening, future production admission, stateful upgrade from disposable
pre-integration P1 databases and later P3–P7 lifecycle/recovery behavior are
non-goals unless a concrete current route falsifies one of claims 1–8.

## Output contract

Return one verdict: `CLEAR`, `REVISE` or `STOP`. For every finding provide its
classification (`METHOD FINDING`, `PRODUCT / PLAN GAP`, `LOCAL EXECUTION GAP` or
`NO FINDING`), exact file/line, reproducible failure route, protected claim,
smallest correction and scope that must not reopen. Mark non-blockers `DEFER
SAFELY` with why-safe, revisit trigger and later owner. Do not compare lanes,
ask another reviewer or recommend a rerun unless a material correction would
invalidate a challenged protected property or its deciding proof.
