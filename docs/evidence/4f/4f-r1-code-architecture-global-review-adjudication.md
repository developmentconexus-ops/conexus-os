# 4F(R1) — Code architecture Global-Maximum review adjudication

> **Status:** `OPERATOR APPROVED / CORRECTION CONVERGED / A0-P1 OPEN`
> **Review date:** `2026-08-31`
> **Implementation authority:** `A0 ONLY UNTIL PASS`

## 1. Outcome

The independent passes agree that the approved Product/slice semantics are
strong, but the physical code architecture is not closed enough to grant S2.
The repository itself confirms the gap: the accepted scaffold contract says
`Physical directory/package topology: NOT SELECTED`, while S1 already exposes a
runtime-to-compiler deep import, a generic store surface and central backend/
frontend composition files that would absorb later owners.

The converged resolution is one separately granted engineering boundary:

```text
S1 PASS
→ A0 Code Architecture Conformance
→ S2 separate grant
```

A0 changes no Product meaning and realizes no Product operation. It selects and
proves the physical constitution needed to keep S2–S6 mechanical:

- strict TypeScript Product Hub while the conversion surface is smallest;
- vertical owner modules inside the deployable apps;
- one narrow typed canonical-json module with two existing consumers;
- named composition surfaces, no generic store/repository/service/UnitOfWork;
- exact import matrix and AST-based enforcement with firing controls;
- Router/Query topology selected now but instantiated with S2's first consumer;
- Git remains Project-private after R1C-14;
- Mastra remains Project-private, stateless and last after R1C-13 exact safe pin,
  closed provider entry, telemetry-off-before-import and zero-egress proof.

## 2. Independent and directed review

| Reviewer | Independent verdict | Directed convergence |
| --- | --- | --- |
| Claude Code Fable `claude-fable-5`, `xhigh` | `REVISE_BEFORE_S2` | `ACCEPT`; two MAJOR and three MINOR folds; `MATERIAL 0` |
| AGY Gemini Pro `gemini-3.1-pro-high`, `high` | `REVISE_BEFORE_S2` | `ACCEPT`; no correction; `MATERIAL 0` |

Fable's folds were incorporated:

1. typed `.d.mts` public surface for canonical-json;
2. forbid and RED-test computed dynamic imports;
3. complete the target-tree scope and add Hub tsconfig;
4. state accurately that web strict typechecking is introduced by A0;
5. remove the unused SQL escape and dead digest export explicitly;
6. specify the behavioral test-double replacement for the brittle OIDC source
   regex while retaining Pack C's real cryptographic negative.

Both final reports conclude:

```text
CONVERGENCE = ACCEPT
MATERIAL_REMAINING = 0
GLOBAL_MAXIMUM = CLEAR
```

Reviewer agreement was Evidence, not operator approval. The operator separately
approved the candidate and granted A0 execution in the autonomous execution
charter.

### 2.1 Receipt/type/build correction convergence

The pre-mutation audit found that the prior S1 receipt was only a point-in-time
snapshot and could bless an arbitrary post-state. It also reproduced two exact
type blockers: missing `@types/pg` and one pinned `openid-client 6.8.7`
declaration diagnostic under `exactOptionalPropertyTypes`. The bounded
correction therefore added:

- a canonical prior-to-successor migration plan validated before mutation;
- prior receipt + validated plan as the intermediate A0 conformance authority,
  with one successor receipt published receipt-last only at A0-P5;
- generated server request/response types and generation-time G0 census/OAS
  cross-check, eliminating every production `apps/**` import from `runtime/**`;
- exact `@types/pg` admission plus a standing, fail-closed declaration-drift
  probe and distinct failing fixture; Hub-only bounded waiver and web
  `skipLibCheck: false`;
- explicit import-law RED fixtures and per-part PASS Evidence rather than
  premature receipts.

Fresh final reviews read the corrected bytes directly from disk:

| Reviewer | Fresh session | Verdict |
| --- | --- | --- |
| Claude Code Fable `claude-fable-5`, `xhigh` | `68cc47b5-13b1-4f5f-9e89-c2592419ec2e` | `ACCEPT / MATERIAL_REMAINING=0 / GLOBAL_MAXIMUM=CLEAR` |
| AGY Gemini Pro `gemini-3.1-pro-high`, `high` | `afe1719b-64de-4794-9123-cf065b0921cf` | `ACCEPT / MATERIAL_REMAINING=0 / GLOBAL_MAXIMUM=CLEAR` |

Fable's two remaining MINOR wording findings were closed before the fresh pass:
the migration-validator window now begins at the first post-plan A0.1 mutation,
and completion explicitly requires the declaration probe's distinct failing
fixture to fire. Gemini's useful adversarial extensions broadened the app import
ban from `runtime/r1/**` to all `runtime/**` and added that same declaration RED
control. No Product owner, operation, Permission, schema or behavior reopened.

## 3. Lead adjudication of rejected alternatives

| Alternative | Disposition | Reason |
| --- | --- | --- |
| continue directly into S2 | reject | compounds known coupling and leaves S2 implementers architectural discretion |
| flat feature folders only | reject | boundaries remain conventional and existing `packages/` relation stays unlawful |
| package per semantic owner now | reject | install/build/manifest ceremony without an independent consumer or deployable boundary |
| full Clean Architecture/DDD/CQRS | reject | duplicates generated contracts and creates layers/events with no current consumer |
| generic `shared/`, Repository or UnitOfWork | reject | becomes a cross-owner capability and conflicts with exact SQL/function ownership |
| microservices | reject | contradicts the accepted one-Hub modular monolith without scale/failure/trust falsifier |
| defer backend TypeScript | reject | the conversion surface grows at every remaining R1 slice; exact missing types can be gated now |
| implement Router/Query in A0 | reject | architecture is selected, but no second frontend journey consumes it until S2 |
| move the accepted S1 migration ledger | reject | no falsifier justifies changing its closed ownership |

## 4. Preserved authority and stop state

- Product operations, owners, Permissions, OpenAPI and locked interactions are
  unchanged.
- WS-01 exact initial authority remains membership/access + `project.create`.
- PRJ-03 exact initial authority remains direct grant + `project.read/manage`.
- Cross-owner atomicity remains enumerated SQL functions under operation-specific
  EXECUTE-only database roles, never an owner-to-owner JS import.
- `R1C-14` remains immediately before S3/PRJ-03.
- `R1C-13` and cognition remain last immediately before S6.
- No prose-status, historical-stage or reviewer-ceremony guard is added.
- `.wireframe-preview/`, `PRODUCT.md` and unrelated/unowned state remain outside
  this planning mutation.

```text
A0_IMPLEMENTATION = OPEN / OPERATOR GRANTED
S2_IMPLEMENTATION = BLOCKED / A0 MUST PASS + SEPARATE S2 GRANT
DEPENDENCY_INSTALL = A0-EXACT ONLY
REAL_PROVIDER_CALL = BLOCKED
PUSH / PR / MERGE = BLOCKED
```

## 5. Operator decision

The operator approved the converged
[`A0 Code Architecture Conformance`](4f-r1-code-architecture-directed-convergence-proposal.md)
and separately opened its execution under the
[`autonomous execution charter`](../4d/4d-r1-autonomous-execution-charter.md).
