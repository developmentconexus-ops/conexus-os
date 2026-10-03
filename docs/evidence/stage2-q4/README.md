# Stage 2 Q4 connector evidence

**Task:** [Stage 2 Q4 — Connector qualification, with Sankhya as the first integrator](../../tasks/stage2-q4-sankhya-connector-qualification.md#amendment-2026-09-28-the-question-is-connector-generic)

## Verdict

**ACCEPT_WITH_BOUNDARY**, frozen on 2026-10-03 UTC (2026-10-02 in the operator's time, -03:00) for the operator's decision (task section 11,
point 6). The operator accepted it on 2026-10-03 and scoped the proofs that did not run on the pilot
out of Q4, each with its next owner
([amendment](../../tasks/stage2-q4-sankhya-connector-qualification.md#amendment-2026-10-03-the-operator-closes-q4-on-the-frozen-evidence)).
Every time below is UTC.

A Project on the pilot read the company's Sankhya through the Connection bound to it as `erp`. The
Builder investigated with 20 native reads before it wrote any application file. It then built a
sales dashboard per salesperson whose handler reads the ERP through the binding, and it changed that
application in a second conversation. No request to the vendor used a service outside the
allow-list. The Hub and the runner run `main`, and no spike branch merged.

The verdict is not ACCEPT for four reasons:

1. **The read-only confirmation is missing.** The amendment caps the verdict at ACCEPT_WITH_BOUNDARY
   until the Sankhya administrator confirms that the integration user can only read. The roadmap
   still lists this confirmation as owed by the operator, and `connector.connection` has no field
   that records it.
2. **Some evidence exists only in CI.** The negative cases, the generic seam and the marker run
   pass against a fake vendor and real PostgreSQL. The pilot recorded no refusal for another Project
   or a removed binding, and the Q4.11 leak scan did not run as a script.
3. **The application was named in the request that started the build.** The conversation opened
   with "Hey". No declaration of the application exists before that conversation.
4. **The platform proves neither data correctness nor the screens.** The Builder tested its
   operations with real reads, but it did not see the screen it built.

The verdict is not REJECT, because no falsifier of task section 8 fired:

1. No pilot request reached a service outside the allow-list. The CI cases of Q4.10, restated for
   bindings, all hold. The Q4.11 counts do not exist, so this falsifier is open, not fired.
2. The restated properties hold on the installed mechanisms. The tests that prove each one are
   listed in [#477](https://github.com/developmentconexus-ops/conexus-os/pull/477).
3. The executor resolves authority from the consumer's context and the Project's bindings. A
   Project, a scope or a Connection in the request changes nothing
   (`connector-handler-port.test.mjs`, `connector-handler-fetch.test.mjs`).
4. The Builder built the application in one run and changed it twice. No failure repeated.
5. The gateway credential alone authenticated and read. Eight `authenticate` calls answered `OK`.
6. A sync job and inbound events were not exercised. The executor already serves two consumer kinds,
   `agent` and `handler`, through one shape.

## Pilot and exact heads

| Fact | Value | How it was read |
| --- | --- | --- |
| Hub and runner | `main` at `f7967b81`, both processes started at 02:19 in `~/wt-builder` | `branch hub starting 2026-10-03T02:19:03Z head f7967b81` and `branch runner starting 2026-10-03T02:19:13Z head f7967b81` in the pilot logs; each process's working directory |
| Main heads during the proof | `ce75ef7b` from 23:12 (#477), `c57b4a2c` from 23:57 (#479), `f7967b81` from 02:19 (#481) | The same log lines |
| Compiler template | `REACT_VITE_V2`, `537fnzf4c16x9d7oz21k:449fd9f1-3b61-4c88-9a06-fd61bbfb4060`, recipe `4ce6f3a6b123…` | `CURRENT_TEMPLATE_PIN` in `apps/hub/src/platform/application-template-pins.ts`, equal to the pilot's `CONEXUS_BUILDER_E2B_TEMPLATE_ID` and to the `templateRef` of both stored builds |
| Schema head | Migration `0052`, checksum `ad64d6e9…`, equal to `sha256sum` of `apps/hub/migrations/0052_builder_parked_run_expiry.sql` on `main` | `iam.schema_migration` |
| Project | `dd5961d1-8a12-4fca-8bd5-2c06e2418813` | `builder.builder_run` |
| Binding | `erp`, environment `preview`, on the Workspace's one Sankhya Connection, bound at 23:16:13, before the build run | `connector.project_binding` |
| Model | The Anthropic subscription account. `claude-opus-5-5` in the first conversation and `claude-sonnet-5` in the second. `claude-haiku-4-5` also appears in the traces of both | `builder.builder_run_model_account`, `factory.mastra_ai_spans` |

## Closure set

| Item | State | Evidence |
| --- | --- | --- |
| 1. One reconciled contract | Holds | C-030, the amendment, contract section 12.6, the "Project Connection bindings" row of the permission contract and the "Enterprise integrators" row of the single-owner map describe one shape. The amendment's size sentence was corrected on 2026-10-03 (open limit 9). |
| 2. The executor on `main` | Holds | #369, #372 and #378 landed the executor, `connector_fetch` and `connectors.fetch`. #477 deleted `connectors.call`, `/v1/call` and `sankhya.purchase-order.read`. No file under `apps/`, `packages/` or `builder-skills/` names them. |
| 3. The pilot on `main` | Holds | [Pilot and exact heads](#pilot-and-exact-heads). |
| 4. One autonomous investigation | Holds | [Item 4](#item-4-the-autonomous-investigation). |
| 5. One useful application and one later change | Holds with boundaries 3 and 4 | [Item 5](#item-5-the-application-and-the-later-change). |
| 6. One frozen verdict | This file | Exact heads above, [repairs](#repairs), [open limits](#open-limits), [Factory review and CI](#factory-review-and-ci-at-each-head). |

### Item 4: the autonomous investigation

The investigation ran in conversation `18b4f470-bf20-4785-aa11-12d133c441e0`, run
`0c3c3eac-ba35-448f-a3f1-7e17d6f49ffb`, on `main` at `ce75ef7b`. The run started at 23:17:05. The
Mastra thread in `factory.mastra_messages` and the connector spans in the Hub log give this order:

1. At 23:17:14 the Builder loaded the planning skill and the integrator skill `conexus-sankhya`, and
   read its `references/topics.md` and `references/traps.md`. That skill is the vendor
   documentation the platform gives the Builder: the request format, the two read services, the
   standard tables and the per-company traps (P11).
2. From 23:17:22 to 23:25:59 it made 15 reads through `connector_fetch`. Between those reads it
   asked the person two rounds of four questions.
3. At 23:26:50 it wrote `.conexus/plan.md` and submitted the plan. That is the first file it wrote.
4. From 23:30:03 to 23:31:01 it made 5 more reads, then wrote `conexus/manifest.json` and the
   handler. No application file existed before the 20th read.

The 20 reads are materially different. Every read uses `DbExplorerSP.executeQuery`. By kind, they
are:

- an engine probe, which the skill prescribes;
- a read of the vendor's own data dictionary, for field descriptions;
- a read of the database catalog, to confirm that columns exist;
- censuses of sales documents by operation type and status, of salesperson records, of product
  classification and of the product group hierarchy;
- reads of document lineage, which document became which;
- sales queries per salesperson, per partner and per category over a period.

Two reads, at 23:21:19, are stored only as their projection, so the record gives their service but
not their kind.

The model received the vendor body, not only the projection. Read 11 filters by 19 operation-type
codes that first appear in the body of read 2. No earlier request, no message from the person, no
question answer and no Builder skill holds them. Read 18 filters by a salesperson key that first
appears in the body of read 17. This file gives neither the key nor its digest, because the
digest of a short key can be reversed by trying every value.

### Item 5: the application and the later change

The operator's request, in product language, asked for an application to pick a period and see the
customers, product categories and partners each salesperson serves. The Builder built a sales
dashboard per salesperson. Its handler reads the ERP only through `connectors.fetch` on the binding
name `erp`, through the generated reader `sankhya.gen.ts`. It declares three operations.

| Run | Conversation | `main` | Request | Result | Revision |
| --- | --- | --- | --- | --- | --- |
| `f9339ecf` | `18b4f470` | `ce75ef7b` | "Hey" | `RESPONSE_ONLY` | none |
| `0c3c3eac` | `18b4f470` | `ce75ef7b` | Build the dashboard | `FAILED`, `SOURCE_CHANGED_BUILD_FAILED`, `APPLICATION_ARTIFACT_INPUT_REFUSED` | source `10c33eb2`, no stored build |
| `f8b6cdc2` | `18b4f470` | `c57b4a2c` | "publica de novo", with no change | `RESPONSE_ONLY` | none |
| `0f7b9ede` | `18b4f470` | `f7967b81` | Add an average ticket column to the customers tab | `SOURCE_CHANGED`, gate `GREEN` | `41ecf7e5`, stored at 02:35:29 |
| `ee5f1ce0` | `c4602297` | `f7967b81` | Sort the partners tab by net value | `RESPONSE_ONLY`: the Builder answered that the tab already sorts that way | none |
| `4dd8377f` | `53a9f96a` | `f7967b81` | The same request, in a new conversation | `RESPONSE_ONLY`, the same answer | none |
| `6a4ce88b` | `53a9f96a` | `f7967b81` | "deixe a tabela ordenavel" | `SOURCE_CHANGED`, gate `GREEN` | `277ce6f1`, stored at 02:48:31 |

The build and the first change ran on different `main` heads. The build source `10c33eb2` passed
`BUILDER_CHECK:admission` and `BUILDER_CHECK:preview` at 23:35, and then the store refused the
artifact. #479 fixed that defect. The first stored build, `41ecf7e5`, holds the build and the first
change together. The second conversation changed the application to `277ce6f1`, with sortable
columns on its three tables.

Run `d2a495c1`, a new investigation in the second conversation, started at 02:49:56 and was still
running when the evidence was frozen. It is outside this verdict.

The [Builder proof rule](../../development/delivery.md#builder-proof-rule) holds as follows:

| Rule item | Evidence |
| --- | --- |
| A real Project and a product-language request | The runs above. The operator named no file, operation or query. |
| The current real model path | The Anthropic subscription account, on `main`. |
| The Builder found the paved-road guidance | The thread shows `conexus-sankhya`, `conexus-plan-new`, `conexus-build`, `conexus-app` and `conexus-server` loaded. The second conversation also used the Context7 tools for TanStack Table. |
| Builder-generated source | `10c33eb2` changed 9 files: the manifest, the handler, two screen files and five Project memory files. `41ecf7e5` and `277ce6f1` changed `app/src/routes/home.tsx`. |
| The Project's own check | `conexus_check` passed six times across the runs. |
| A Conexus build and Preview | `BUILDER_CHECK:gate:0f7b9ede…:41ecf7e5290f` and `BUILDER_CHECK:gate:6a4ce88b…:277ce6f1ae80` passed generate, typecheck, build, server and boot. `BUILDER_GATE_SETTLED` was `GREEN` for both. `reg.artifact_revision` holds both builds. |
| Browser interaction | From the first publish at 02:35 to 02:49, the runner served 60 handler calls that no Builder tool made. All answered 200. The Hub does not log Preview requests, so these calls are the record. |
| The gate's negative proof | CI only (boundary 2). |
| Repair iterations | [Repairs inside the Builder runs](#repairs-inside-the-builder-runs). |

### Reads in the proof window

Between 23:17 and 02:49 the Hub log holds 86 `connector.fetch` spans for the Project, all on the
binding `erp`:

| Consumer | Reads | `OK` | `PROVIDER_ERROR` | Vendor services sent |
| --- | --- | --- | --- | --- |
| `agent` (the Builder's `connector_fetch`) | 20 | 19 | 1 | 4 `authenticate`, 20 `DbExplorerSP.executeQuery` |
| `handler` (`connectors.fetch` in the application) | 66 | 66 | 0 | 4 `authenticate`, 66 `DbExplorerSP.executeQuery` |

The `PROVIDER_ERROR` was an envelope error, HTTP 200 with envelope status `0`, on a category query.
The next read, a corrected query, answered `OK`. The median read took 1,315 ms and the slowest
5,857 ms. The largest answer was 11,873 bytes. Since the log began on 2026-09-28, the only vendor
services in it are `authenticate` and `DbExplorerSP.executeQuery`.

## Repairs

### Platform repairs during the gate

| PR | Repair | Merged as |
| --- | --- | --- |
| [#477](https://github.com/developmentconexus-ops/conexus-os/pull/477) | Deleted the per-operation path (closure item 2) and restored C-029's envelope status on every `connectors.fetch` record. The no-leak scans stopped matching random hex ids. | `ce75ef7b` |
| [#478](https://github.com/developmentconexus-ops/conexus-os/pull/478) | The question card stopped jumping, and its disabled state shows a not-allowed cursor. | `c4006e75` |
| [#479](https://github.com/developmentconexus-ops/conexus-os/pull/479) | The build thumbnail is stored beside the compiled application. Its absence refused the artifact of run `0c3c3eac` with `APPLICATION_ARTIFACT_INPUT_REFUSED`. #456 introduced the defect. | `c57b4a2c` |
| [#480](https://github.com/developmentconexus-ops/conexus-os/pull/480) | The roadmap records the done check and defers the proof of data correctness. | `8e16488c` |
| [#481](https://github.com/developmentconexus-ops/conexus-os/pull/481) | A run cannot end as done while its application fails the check. The failure goes back to the agent in the same run, and the check runs once per candidate. | `f7967b81` |

### Repairs inside the Builder runs

- At 23:33 the runner refused the output of one handler call with `HANDLER_OUTPUT_REFUSED`, because
  the handler returned a field the manifest did not declare. The Builder edited the handler in the
  same run, and the next call answered 200.
- At 23:30:52 one investigation read failed with an envelope error. The Builder corrected the query
  and the next read answered `OK`.
- The two changes passed the done gate on the first check. No repair ran.

### Earlier repairs

- Part 1 resolved findings 1 to 8 [below](#findings).
- The executor PRs went through review rounds before the Factory approved them: #369 one round,
  #372 three, #378 three.
- Work that changed the runs of this proof: #451 names an oversized sandbox result, #460 retries and
  logs a failed run settle, and #469 gives the Project check and the runner one server admission.

## Factory review and CI at each head

The `verify` check and its five groups were `success` at every head below. No review was dismissed.

| PR | Head at merge | Factory review at that head |
| --- | --- | --- |
| #369 | `e7e5d536` | `approve`, after one request for changes |
| #372 | `d23fc789` | `approve`, after three requests for changes |
| #378 | `df971d52` | `approve`, after three requests for changes. The operator wrote "merge" |
| #477 | `49f85d91` | `approve`, after one request for changes |
| #478 | `c8ee6ef3` | `approve`, after one request for changes |
| #479 | `6fa929d4` | `approve` |
| #480 | `ed800531` | `approve` |
| #481 | `7a9dea4a` | `approve`, after one request for changes |

The push runs on `main` at `ce75ef7b` and at `f7967b81` were also `success`. The Factory reviewed
#451, #456 and #469 with comments only, and gave no `approve`. The Factory review and CI of this
verdict are on its own pull request.

## Open limits

1. **No vendor-side read-only confirmation.** The executor's allow-list and its SQL check are a
   tripwire. The vendor principal is the guard, and nobody has confirmed its scope.
2. **Data correctness.** The platform does not prove that a number matches the source. On
   2026-10-02 the operator deferred that proof to the redesign of the Builder's planning flow.
3. **Screen QA.** The Builder tested its operations with real reads and said it did not see the
   screen. The roadmap places the screen check in phase 3, after the structural waves of phase 2
   (operator, 2026-10-03).
4. **The gate's repair budget lives in memory.** A Hub restart while a run waits on a question
   resets the count of three (#481).
5. **The first conversation keeps the platform failure.** Its transcript holds the
   `APPLICATION_ARTIFACT_INPUT_REFUSED` notice, and source `10c33eb2` has no stored build.
6. **A request to publish again without a change publishes nothing.** Run `f8b6cdc2` settled
   `RESPONSE_ONLY`, while the Builder's reply said it had asked Conexus to publish. #481 removed
   the retry button.
7. **The Hub stores raw vendor bodies.** The stored thread keeps the raw `connector_fetch`
   arguments and results for 18 of the 20 investigation reads, and the traces keep the model's
   input (#372, upstream items U8 and U9). The browser routes serve only the projection, which
   `connector-builder-tool.test.mjs` proves. A later turn receives the body. Observational memory
   was not measured.
8. **Evidence that exists only in CI.** The refusals of another Project and a removed binding, the
   origin and write cases, the generic seam and the marker run pass against a fake vendor. The
   marker test covers the stream and the messages route, not the rendered page. The Q4.11 credential
   scan, the scan of the sandbox's files and process arguments, and a non-developer app user's view
   did not run on the pilot.
9. **The size sentence of the amendment was stale.** It said the executor cuts an oversized answer
   and marks it truncated. `main` refuses it with `RESPONSE_TOO_LARGE` and returns no vendor byte
   (#369). The task now says so (amendment of 2026-10-03).
10. **Smaller limits from the executor PRs.** A bearer split across two values is not redacted. A
    run scope revoked while a request is past admission does not stop that request. The call budget
    is spent before the send. A vendor that keys an object by a value would show that value as a
    field name in the projection.
11. **Owner reconciliation.** Task section 14 asks for the security reference, the Stage 2 reference
    and the product owners to record what Q4 proved. That reconciliation follows the operator's
    verdict.

## What this file holds

The repository is public. This file holds field kinds, counts, status codes, durations, run and
revision ids, and one digest prefix. It holds no value read from Sankhya, no name of a partner,
customer or salesperson, no amount, no operation-type code, no custom field name and no credential.
Before the commit, a script searched the added lines of this change for the 757 distinct values in
the 25 stored vendor bodies and the stored operation results of both conversations. The only matches
were the service name, a Conexus error code, a pull request number and two short codes that occur
inside ordinary words.

## Rerun

Every fact above comes from read-only queries on the pilot:

```bash
docker exec conexus-branch-postgres psql -U postgres -d conexus_branch -c \
  "select builder_run_id, conversation_id, state, result_kind, failure_code, base_source_revision,
          result_source_revision, created_at from builder.builder_run
   where project_id = 'dd5961d1-8a12-4fca-8bd5-2c06e2418813' order by created_at"
docker exec conexus-branch-postgres psql -U postgres -d conexus_branch -c \
  "select source_revision, digest, payload->>'templateRef', created_at from reg.artifact_revision
   where artifact_id = '2d949342-ceaf-4030-a52d-5b9445780b24'"
docker exec conexus-branch-postgres psql -U postgres -d conexus_branch -c \
  "select version, checksum_sha256 from iam.schema_migration order by version desc limit 1"
grep -E 'branch (hub|runner) starting|BUILDER_CHECK:|BUILDER_GATE_SETTLED' ~/conexus-branch-state/logs/hub.log
```

The connector counts come from the `{"span":…}` lines of `hub.log` whose `projectId` is the
Project's. The investigation order comes from the `tool-invocation` parts of the thread's rows in
`factory.mastra_messages`.

## Part 1 record

The sections below record part 1 as it closed. Later pull requests changed the code they name: #477
deleted the purchase-order operation and moved every read to `connectors.fetch`. The verdict above
is current.

## Contents

- [census.md](census.md): the Q4.0 native census, with installed versions, files and dated URLs.
- [design.md](design.md): the Q4.1 frozen design, the runner-to-Hub comparison the manager ruled on,
  and the map from P1 to P13 to tests.
- `integrations-screen.png`: the Integrações screen of Q4.2, drawn from fixture data. It shows no
  credential.

## Gate G0: read allow-list

The operator decided on 2026-09-24 that Q4 proceeds without relying on the scope of the gateway
credential. The broker is the barrier: it calls only the read services on its allow-list and refuses
any other before a request leaves the Hub. The operator watches the first real call.

| G0 item | State | Where |
| --- | --- | --- |
| The allow-list names only read services, each citing the documentation that shows it reads | Done | [census.md, "Sankhya read services admitted for G0"](census.md#sankhya-read-services-admitted-for-g0): the authentication and `CRUDServiceProvider.loadRecords`. `SANKHYA_SERVICES` in `apps/hub/src/connectors/sankhya/gateway.ts` holds `CRUDServiceProvider.loadRecords` alone. |
| A test proves the broker refuses a service outside the allow-list without any network call | Done | `tests/implementation/connector-broker.test.mjs`, "P4 (G0)": an operation asking for another service answers `SERVICE_REFUSED`, and a `write` operation answers `EFFECT_REFUSED`. In both cases the fake gateway records zero requests, the authentication included. |
| The adapter's source has no write-capable service name | Done | `tests/repository/connector-adapter-source.test.mjs`: the service literals in `apps/hub/src/connectors/sankhya/*.ts` are exactly `CRUDServiceProvider.loadRecords`, no known write service name appears, and only the gateway file carries wire vocabulary. |
| The evidence records the decision and its date, never the credential | Done | This section. |

Until part 2, the Hub runs with no gateway destination configured
(`CONEXUS_SANKHYA_GATEWAY_ORIGIN` absent). Every call and every credential check then answers
`CONNECTOR_UNCONFIGURED` with no network, which `connector-broker.test.mjs` also proves.

### Real Sankhya calls

None. Each real call in part 2 is logged here with the service name, time and status, never a value.

## Part 1 proof

Every test below ran green on the executor's machine against a throwaway PostgreSQL and a throwaway
Applications cluster, never the pilot. CI runs the same tests at the pull request's head.

| Step | Check | Tests |
| --- | --- | --- |
| Q4.2 | A stored Connection holds only ciphertext; no Hub operation returns a credential field. A browser creates a Connection and a Grant, reloads, and finds no credential value in the page, the input values, the network responses or the Hub's log. | `connector-postgres`, `connector-routes`, `connector-integrations-browser` |
| Q4.3 | P7 and P8 against real PostgreSQL; `wire:bijection` at 31 operations. | `connector-postgres`, `connector-broker-postgres` |
| Q4.4 | A handler reads a fake order through the grant; the fake saw one fixed service with fixed fields; ten concurrent calls cause one authentication; a token is refreshed before it expires; the worker holds no credential; P3 to P6, P9 and P10. The manager's four conditions M1 to M4 (design.md section 5). | `connector-broker`, `connector-token-cache`, `connector-handler-port`, `connector-broker-postgres`, `application-runner-sandbox`, `application-invoker` |
| Q4.5 | No grant, no brief; with the grant, the operation's id and both contracts; the brief and the Skill hold no wire vocabulary, gateway origin or credential field name; an unreadable store gives a notice and the run goes on. | `connector-builder-brief`, `builder-factory-runtime` |

For M3, the socket on the host belongs to uid 1000 with mode `0600`. Inside the sandbox the handler
runs as uid 1000 and connects without any permission change.

## What public evidence may hold

The repository is public. Part 1 holds no value from Sankhya, because no request was made. The
fixture order in `tests/implementation/connector-fake-gateway.mjs` is invented, apart from the
document number 22790. From Q4.6 on, public artifacts keep only field names, types, counts, status
codes and digests. They never keep an order value or a raw response from Sankhya or a handler. The
document number 22790 is the one exception.

## Findings

1. **Resolved in part 1.** A second open Connection in one Workspace surfaced as a server error. It
   now answers 409, and the screen offers the form only when no Connection is open (`8f9ea4d1`).
2. **Resolved in review.** A create retry could not tell an identical credential from a changed one,
   so a changed credential was silently dropped, and every retry answered 201. The Connection now
   stores a keyed digest of the credential. An identical retry answers 200, a changed one 409, and
   concurrent retries converge on one row. `connector-postgres`, `connector-routes`.
3. **Resolved in review.** A malformed id in a path or body reached PostgreSQL as a `uuid` parameter
   and failed as a server error. The contract now types `connectionId` and `grantId` as uuids, in
   paths, bodies and responses, and the generated routes validate them, so a malformed one gets the
   declared 400. The shared `workspaceId` and `projectId` stay plain strings and are parsed in the
   handler, which answers 404, or 422 on create. None of these reaches the store. A create in a
   Workspace that does not exist answers 422. `connector-routes`, `connector-postgres`.
4. **Resolved in review.** A failed read of the grants aborted the Builder run. The run now goes on
   with a fixed notice in place of the brief (design.md section 9). `connector-builder-brief`,
   `builder-factory-runtime`.
5. **Resolved in review.** Disabling a Connection left the Project's grant open on it. Granting the
   replacing Connection then answered 200 with that old grant, and every call was `NOT_GRANTED`.
   Disabling a Connection now revokes its open grants in the same transaction, and a grant racing
   the disable is revoked by it. `connector-postgres` (P8 and the race test).
6. **Resolved in review.** An identical create retry answered 409 after a key rotation, because the
   digest came from the current key alone. The retry now matches the stored digest under the current
   key or any retired key still configured. `connector-postgres`.
7. **Resolved in review.** A document number from 1,000,000,000 up, which the input admits, came back
   as `NaN` and the whole read was refused. The parse now takes every number up to 2,147,483,647.
   `connector-broker`.
8. **Resolved in review.** A failed revoke now closes its dialog, as a failed disable does, and
   shows the error in the row. The browser run showed that the dialog's confirm button already
   closed it and the error was visible, so this makes the close explicit.
   `connector-integrations-browser`.

## Open for part 2

- The invocation timeout is 5 s and the broker deadline is 4 s. Q4.6 measures a cold call on the
  pilot before any bound changes.
- The field mapping in `sankhya/purchase-order.ts` is unverified: `NUMNOTA` with `TIPMOV = 'O'`, the
  status values, the date and decimal formats, and the reference field names. So is whether a
  refused token arrives as HTTP 401. Each lives in one file or one function.
- One authentication serves every concurrent miss under the first caller's deadline. If that caller
  times out, the others waiting on it fail too.
- The pilot needs `CONEXUS_CONNECTOR_SOCKET_DIR` for the Hub and the runner, and
  `CONEXUS_SANKHYA_GATEWAY_ORIGIN` for the Hub after G0. Both are operator configuration.
