# Builder own harness evidence

**Verdict:** pending. No declared run has been recorded here yet.

Task: [Builder own harness qualification](../../tasks/stage2-builder-own-harness-qualification.md).
Proposed decisions: [C-032 and C-033](../../decisions/index.md#proposed-pending-the-operator).

Record every business value masked. A screenshot shows no Sankhya value, no credential and no token.
A result names field names, counts, durations and digests, never a value.

## Heads

| What | Value |
| --- | --- |
| Candidate branch | `feat/builder-own-harness` |
| Census head | `40d9671d` (merge base with `main` `eb564cfe`) |
| Frozen candidate head | to fill |
| E2B template pin at the frozen head | to fill (`apps/hub/src/platform/application-template-pins.ts`) |
| Pull request | to fill |
| CI `verify` at the frozen head | to fill |
| Factory review | to fill |

## Declared runs

The night run of 2026-09-29 declared these runs as gate proof before any of them ran
([task, section 6](../../tasks/stage2-builder-own-harness-qualification.md#6-deciding-proof-route)).
A run counts only on the head recorded when it starts.

### AC-28: the browser run as a person

| Field | Value |
| --- | --- |
| Head at start | to fill |
| Started, ended (UTC) | to fill |
| Model per mode | to fill |
| Request, in the person's words | to fill |
| Result | to fill |

The Builder proof rule items, each with its screenshot:

| Item | Seen | Screenshot |
| --- | --- | --- |
| Normal product request in Portuguese | to fill | to fill |
| Plan card with the plan text | to fill | to fill |
| Approval continues the same run in Construir | to fill | to fill |
| Build on the v2 starter | to fill | to fill |
| `conexus_check` with counts, "Verificando o app" and "Verificou o app" | to fill | to fill |
| A skill loaded | to fill | to fill |
| The app used in the Preview | to fill | to fill |
| A deep link rendered | to fill | to fill |
| Zero CSP violations | to fill | to fill |
| Planejar interview: an `ask_user` card, an answer that resumes, an unanswered question that becomes an assumption | to fill | to fill |
| The Builder reports counts, never "validado" | to fill | to fill |

Last `CheckReport`: to fill.

### AC-27: the three-case eval

One run each, one rerun per failed case. The gate passes when all three pass.

| Case | Head at start | Run | Result | Rerun | Last `CheckReport` | `result.json` |
| --- | --- | --- | --- | --- | --- | --- |
| `todo-reload` | to fill | to fill | to fill | to fill | to fill | to fill |
| `erp/sankhya-not-connected` | to fill | to fill | to fill | to fill | to fill | to fill |
| `erp/sales-dashboard` | to fill | to fill | to fill | to fill | to fill | to fill |

## Proofs not yet declared

Declare each in the task before it runs.

| AC | Proof | State |
| --- | --- | --- |
| AC-29 | An app built by the new Builder reads the pilot's Sankhya and shows the data in the Preview, values masked | not declared |
| AC-30 | The operator reads the model input for both modes, and his yes is recorded in the pull request | not declared |
| AC-31 | A backup of the Conexus Git folder with the database dump, and one tested restore, before the switch | not declared |

## Failures and repairs

The Builder proof rule asks for every repair iteration and failure. One row each: head, run, what
failed, root cause, fix commit and re-proof.

| Head | Run | What failed | Root cause | Fix | Re-proof |
| --- | --- | --- | --- | --- | --- |

## Verdict

To fill: ACCEPT, ACCEPT_WITH_BOUNDARY or REWORK, with every open limit of the task's section 7 that
remains.
