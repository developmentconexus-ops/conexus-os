# Q4.7 run 1 — the Builder built the app without the connector

**Result:** the Q4.7 check fails. The handler does not call `sankhya.purchase-order.read`, and no
Sankhya data was read. The cause is configuration: the Q3 Project held no grant, so the Builder
had no operation to call. The run is the first of the two-run budget.

## The run

`scripts/builder-eval/run.mjs` ran on 2026-09-26 from 23:00:19 to 23:05:51 UTC, with the case
[`q4-sankhya-purchase-order.json`](../../../../scripts/builder-eval/cases/q4-sankhya-purchase-order.json),
`--project 2b9d2bbb-6336-4957-bb55-78e5fdd228cd`, `--max-repairs 1` and
`--model google-ai-pro/gemini-3.8-flash-high`. [`summary.json`](summary.json) holds the run facts, the
changed files, the check results and every application API answer as paths, types, counts and a
digest. The raw `result.json` and the screenshots stay outside the repository.

- One Builder run, `ce1ee90e`, `SUCCEEDED` with `SOURCE_CHANGED`, no repair. Source `1caed906` to
  `7a58a198` in 329 s to a usable Preview.
- The builder-eval checks passed, before and after the reload. They could not catch this failure:
  they look for the document number and a saved note, and the case may assert no business value.
- An earlier attempt at 22:42 UTC stopped before the Builder, because the Project's GitHub
  repository was unreachable. It spent no run.

## What the Builder wrote

- `conexus/handlers/orders.ts` has no `connectors.call`. Its operations are `listPurchaseOrders`,
  `upsertPurchaseOrder`, `listNotes`, `addNote` and `updateNoteStatus`.
- `conexus/migrations/004_add_sankhya_details_to_purchase_order.sql` adds supplier, total, date,
  status, payment and item columns to the Project's `purchase_order` table and inserts order 22790
  with values the Builder wrote itself.
- `app/src/main.tsx` shows those columns under a "Sankhya ERP" label. They are not Sankhya data.
- The changed files and the 56 transcript messages hold no credential word, no gateway host and no
  Sankhya service name. The transcript mentions `connectors.call` twice, both times quoting the
  generic `conexus-server` skill, and never the operation id.

## Why

- `connector.project_grant` held no row at 23:10 UTC. The Sankhya Connection exists in the
  Workspace of the Q3 Project, created at 22:05:56 UTC. The grant of Q4.6 was never recorded.
- With no open grant, the Builder's brief lists no operation ("No grant, no brief", Q4.5), so the
  Builder could only store typed-in fields.
- `hub.log` lines 662 to 683, the run's window, hold no `connector.call` and no `connector.brief`
  line. No broker call happened, and the brief read did not fail.

## Before run 2

The Workspace Owner grants `sankhya.purchase-order.read` to the Q3 Project in the Integrações
screen, and the grant appears in `connector.project_grant`. Whether run 1 counts against the
budget is the operator's call: the task's Q4.7 starts from the Q4.6 grant, which did not exist.
