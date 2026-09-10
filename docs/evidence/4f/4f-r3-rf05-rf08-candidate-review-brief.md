# R3 — RF-05/RF-08 exact candidate independent review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Review target:** [exact candidate freeze](4f-r3-rf05-rf08-candidate-freeze.md)
> **Implementation authority:** `0` — R3 remains preparation only

## Review question

Does the frozen RF-05/RF-08 candidate preserve the accepted Conexus owners and
proof boundaries, or does it silently create a second migration authority,
transfer an inapplicable Package-D qualification, or leave a material R3
falsifier unowned?

## Read order and custody

Reconstruct current authority from `AGENTS.md`, `docs/roadmap.md`,
`docs/index.md`, the Engineering and Repository Methods, and the review-protocol
sections 10.4–10.6. Then read the **core route** below. This route is the
material subject; it is deliberately smaller than the complete custody table.

```text
docs/evidence/4f/4f-r3-rf05-rf08-candidate-freeze.md
docs/evidence/4f/4f-r3-rf05-rf08-candidate-attestation.json
docs/evidence/4f/4f-r3-rf05-rf08-owner-decision.md
docs/decisions/index.md
docs/reference/data-and-persistence.md
docs/reference/managed-execution-qualification.md
contracts/api/product/builder-paths.yaml
scripts/run-hub-migrations.mjs:1-120,3230-3418
apps/hub/src/platform/postgres.ts
apps/hub/src/connections/store.ts
apps/hub/src/brain/store.ts
apps/hub/src/workspace/store.ts
apps/hub/src/project/store.ts
apps/hub/src/project/inception.ts
apps/hub/src/project/binding-recovery.ts
apps/hub/src/identity-access/store.ts
apps/hub/src/builder/store.ts
tests/implementation/r1-s2-postgres.test.mjs
```

The following are **machine-custody or escalation evidence**, not default model
context: `scripts/check-r3-candidate-freeze.mjs`,
`tests/repository/r3-candidate-freeze.test.mjs`, both lockfiles, the selection
packet, the B02/B03 studies, `criteria.json`, `dt1p.json` and the pinned vendor
SQL. The wrapper records their digests when they are in the attestation. Open
one only when a concrete falsifier names it; do not replay historical prose or
full lockfiles to establish a claim already covered by the attestation.

The current checkpoint changed the vendor-DDL trust boundary and deciding-proof
identity. It therefore requires the `material` profile (fresh Opus and Gemini
lanes). A later correction that changes only already-proven custody wording may
use the `delta` profile, but only after the Lead confirms that no protected
property or deciding-proof reliability changed.

The review is read-only. Do not edit, install dependencies, call providers,
run a real JobRun, access Sankhya, publish Git or merge. Do not treat the
candidate's accepted recommendation as authority; attack it against the
current owner decisions and exact source/version evidence.

## Protected claims and falsifiers

1. **RF-05 access custody:** `pg 8.23.0` remains the current root driver, with
   one checked-out client per protected transaction and no Kysely schema
   authority. The transaction-owning Hub sources are part of the exact custody
   envelope; the freeze checker derives every Hub source containing a pool
   checkout and refuses a candidate when one is absent from that envelope. The
   law is a target contract pending its R3 enforcement proof.
   Falsifier: a transaction/pool path or query projection that can bypass owner
   capabilities, split a protected transaction or mask its primary failure.
2. **RF-05 migration custody:** Project SQL, the Conexus runner and
   `iam.schema_migration` form one admitted lineage. `atlas.sum` is historical
   Evidence only and is not selected or enforced. Falsifier: a claim that Atlas
   owns runtime apply, missing checksum/order enforcement, or a real-target
   drift path that cannot fail closed.
3. **RF-08 qualification scope:** `pg-boss 12.26.3` is only the first proof
   candidate, and Package-D's PostgreSQL/`pg`/Node tuple, runtime configuration
   (`schema=mar`, `createSchema=false`, `migrate=false`, `schedule=false`,
   `retryLimit=0`) and vendor DDL digest are isolated custody. Falsifier:
   version, DDL, configuration or fixture-identity transfer without
   requalification, or queue state becoming MAR occurrence authority.
4. **Owner boundaries:** Project owns migration/cursor/merge/freshness;
   MAR owns occurrence/recovery; queue mechanics remain subordinate.
   Falsifier: duplicate authority, missing terminal owner or a hidden scheduler
   or retry Product meaning.
5. **R3 proof census:** R3 must cover all seven admitted proofs: atomic
   cursor/merge (`R3-P1`), single-flight/coalescing (`R3-P2`), quiescence
   refusal (`R3-P3`), missing-observation honesty (`R3-P4`), coverage/drift
   (`R3-P5`), one-current-catch-up/`3N-V18` (`R3-P6`) and read-only authority/
   `3N-V19` (`R3-P7`). Falsifier: any row is absent or routed only by prose.
6. **R3/R7 boundary:** R3 controls contract and bounded recovery fixtures;
   R7 controls real served Release, JobRun, live source and reconciliation.
   Falsifier: a live claim inferred from controlled proof or a missing
   `3N-V18`/`3N-V19` route.
7. **Subject custody:** the candidate proves non-consumption of the qualified
   `BLD10_PREVIEW_SUBJECT_DIGEST` (`BuildPreview.subjectDigest` backed by
   `builder.read_preview_subject`), or stops for the separately admitted
   R1/Builder requalification. Unrelated `Evidence.subjectDigest` and
   Brain/Gateway canonical subject digests are outside this gate. Falsifier:
   an untracked consumer or generated projection that derives the qualified
   BLD-10 field.

Classify every finding as `METHOD FINDING`, `PRODUCT / PLAN GAP`,
`LOCAL EXECUTION GAP` or `NO FINDING`. For each material finding include the
evidence, failure mode, materiality, smallest owner/stage, protected property,
stop condition and required re-evaluation. Reviewer output is Evidence only;
the Lead adjudicates it. If a conclusion is included, emit only your own line
as `VERDICT = ...`.

## Closure condition

The review may support the R3 implementation checkpoint only if both fresh
lanes finish against the exact candidate base plus aggregate manifest digest,
the migration-corpus digest, the separate candidate attestation and the complete required custody path set, no
unresolved material finding remains, and the Lead records adjudication. The
candidate freeze check is an explicit review-lane gate, not a permanent
required-main CI property while R3 is unadmitted. A review pass does not authorize
dependency installation, live execution, Release/serving, or Git publication.
