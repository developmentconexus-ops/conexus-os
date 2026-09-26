# Q4.7 run 2 — the handler reads order 22790 through the broker

**Result:** the handler calls `sankhya.purchase-order.read` through `connectors.call`, and the
Preview's Sankhya card shows what the broker returns. Two of the three real reads answered `OK`
with one order. The first answered `PROVIDER_ERROR`, which is under diagnosis. builder-eval graded
`FAIL`: after the reload the saved note did not show, because the notes list was refused with 429.

## The run

`scripts/builder-eval/run.mjs` started on 2026-09-26 at 23:11:57 UTC with the same case, Project,
`--max-repairs 1` and `--model google-ai-pro/gemini-3.8-flash-high` as run 1. The grant existed from
23:10:46 UTC. [`summary.json`](summary.json) holds the run facts, the changed files, the check
results and every application API answer as paths, types, counts and a digest.

- One Builder run, `9e4fcfc2`, `SUCCEEDED` with `SOURCE_CHANGED`, no repair. Source `7a58a198` to
  `16eaeb8e` in 378 s to a usable Preview.
- The checks passed before the reload. After the reload, `22790` passed and the note failed.
- The runner then hung for 17 minutes. Three answers refused with 429 around the reload never
  delivered a body, and the API recorder waited on them. The result was read from the runner's
  memory through the Node inspector before it was stopped, so `finishedAt` is null. The recorder now
  stops waiting on a body after 5 s.

## What the Builder wrote

- `conexus/handlers/orders.ts` adds `readSankhyaOrders`, which calls
  `connectors.call('sankhya.purchase-order.read', { documentNumber })`, answers every closed error
  code with a message, and returns the orders it received. It also writes supplier, total, date,
  status and items of each order into the Project's `purchase_order` table.
- `app/src/main.tsx` fills the Sankhya card (supplier, date, status, total, items) from
  `readSankhyaOrders` on every open. The order list shows supplier and total from `purchase_order`.
  Run 1 had inserted made-up values there. Each `OK` read overwrites them with the broker's
  values where those are not empty.
  Run 1's made-up supplier registry number, payment terms and buyer remain in that table, and the
  page shows none of them.
- The changed files and the 67 transcript messages hold no credential word, no gateway host and no
  Sankhya service name. The transcript names the operation id in 2 messages and `connectors.call`
  in 3.

## The reads

The three `connector.call` lines are rows 2 to 4 of "Real Sankhya calls" in the
[evidence README](../README.md#real-sankhya-calls). The two answers the builder-eval browser received
have the fields `$.orders[].number`, `internalId`, `date`, `supplier`, `status`, `total` and
`items[]` (`sequence`, `productCode`, `description`, `quantity`, `unit`, `unitPrice`, `total`),
with one order and one item each.

## Open

- `PROVIDER_ERROR` on the first read: under diagnosis with the operator, not fixed here.
- The note after reload: the page sends `listPurchaseOrders`, `listNotes` and `readSankhyaOrders`
  at once. The Hub admits two invocations per Project (`APPLICATION_PROJECT_BUSY`, 429), and the
  page does not retry a refused call.
- The handler keeps a copy of the order's values in the Preview's Project data, which the Q3 app
  user's application also reads.
