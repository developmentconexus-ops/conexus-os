# R3 P2/P3 implementation checkpoint — independent review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Subject:** bounded Project read-model and MAR admission implementation
> **Authority:** operator P2/P3 decision; review output remains Evidence only

## Review question

Does the bounded P2/P3 implementation preserve the operator decision and
Engineering Method Global Maximum: one Project-owned committed read model and
merge authority, one MAR-owned occurrence authority, queue mechanics strictly
subordinate, and no inherited proof from the historical Package-D tuple?

## Read order

Read the current `AGENTS.md`, `docs/roadmap.md`, `docs/tasks/r3.md`, the
operator decision, and the Astra advisor receipt first. Then inspect only this
implementation subject:

```text
apps/hub/project-migrations/001_budget_analyzer_read_model.sql
apps/hub/migrations/024_mar_pg_boss_projection.sql
apps/hub/migrations/025_mar_admission_function.sql
scripts/run-project-migrations.mjs
scripts/run-hub-migrations.mjs
apps/hub/src/project/read-model.ts
apps/hub/src/mar/admission.ts
tests/implementation/r3-project-read-model.test.mjs
tests/implementation/r3-mar-admission.test.mjs
tests/implementation/r3-mar-migration.test.mjs
package.json
package-lock.json
```

Do not run a live JobRun, Sankhya/provider/model call, deployment or
publication. The historical Package-D qualification is not a substitute for
root-tuple requalification (Node 24.20.0, `pg` 8.23.0, `pg-boss` 12.26.3 and
the controlled PostgreSQL subject).

## Protected properties and falsifiers

1. **Project ownership:** business rows, checkpoint, cursor, merge, freshness
   and committed-generation visibility are Project-owned. A Hub/MAR queue
   table, generic JSON projection or direct runtime table DML is a finding.
2. **Generation semantics:** a working generation is never queryable before
   commit; a complete snapshot replaces the committed generation; a delta
   deletes only explicit tombstones; omission from a delta is not deletion.
3. **Honest degradation:** incomplete/drifted observations cannot advance
   committed cursor/generation or supported truth; an already confirmed
   generation remains queryable with its degraded state disclosed.
4. **Concurrency and idempotency:** checkpoint revision rejects stale writers;
   repeated observation identity is replay-safe; digest conflict is refused.
5. **MAR boundary:** `mar.job_run` is the owner record; a bounded definer
   function and same-client pg-boss projection are co-admitted in one
   transaction; null queue projection aborts; queue identifiers and retry
   settings are subordinate mechanics.
6. **Migration custody:** Project migrations use their own native checksum and
   `project_meta.schema_migration` ledger, exact source-revision input and a
   separate database/credential boundary; Hub migration custody is not silently
   delegated to Atlas, Kysely or pg-boss.
7. **Qualification scope:** no P2/P3 result may turn green as root-tuple or
   live proof until the exact controlled requalification runs and reproduces
   the named falsifiers.

Classify every finding as `METHOD FINDING`, `PRODUCT / PLAN GAP`, `LOCAL
EXECUTION GAP` or `NO FINDING`. For each material finding state the smallest
owner, protected property, failure mode, stop condition and required
re-evaluation. Reviewer output is advisory Evidence; the Lead adjudicates.

The review is read-only and may only support the implementation checkpoint. It
cannot authorize P4 fixtures, root-tuple qualification, live execution, R4+,
deployment or Git publication.
