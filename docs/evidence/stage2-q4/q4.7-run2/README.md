# Q4.7 run 2 — the handler reads order 22790 through the broker

**Result: Q4.7's end-to-end proof is incomplete.** The Q4.7 check needs the Preview to show the
real order beside its notes after a reload, and after the reload the saved note did not show.
builder-eval graded `FAIL`. The handler does call `sankhya.purchase-order.read` through
`connectors.call`, and two of the three real reads answered `OK` with one order. Those two reads
show that the connector path works; they do not complete Q4.7. The first read answered
`PROVIDER_ERROR`, which is under diagnosis. The [path to a passing check](#path-to-a-passing-check)
is decided.

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

## Why the note check failed

After the reload the page sends `listPurchaseOrders`, `listNotes` and `readSankhyaOrders` at once.
The Hub's application invoker admits two invocations per Project and refuses the next one with 429
`APPLICATION_PROJECT_BUSY` (`apps/hub/src/mar/application-invoker.ts:76`). A Sankhya read holds its
slot for up to 2 s. `listNotes` was refused at 23:18:18.650 UTC, and the page does not retry a
refused call, so the note never rendered.

## Path to a passing check

Decided by the operator on 2026-09-26. Nothing below has run yet.

1. [conexus-os#312](https://github.com/developmentconexus-ops/conexus-os/issues/312): the invoker
   waits in a bounded first-in, first-out line instead of refusing when a Project's two slots are
   busy.
2. [conexus-os#313](https://github.com/developmentconexus-ops/conexus-os/issues/313): every connector
   call is recorded natively with Mastra observability.
3. The generated application must not keep a copy of Sankhya order data. It reads the order live
   and stores only what the person writes. Run 2's handler writes the order's values into the
   Project's `purchase_order` table, so run 3 removes that copy.
4. Run 1's made-up values are cleaned from the Project's `purchase_order` table.
5. After the changes for #312 and #313 merge and are deployed on the pilot, Q4.7 run 3 closes Q4.7.
   Its note check passes after the reload, and its first read's evidence is recorded as for runs 1
   and 2.

The `PROVIDER_ERROR` of the first read stays under diagnosis with the operator and is not fixed
here. Whether runs 1 and 2 count against the two-run budget waits for the operator's decision.
