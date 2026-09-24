# Stage 2 Q4 — Sankhya connector qualification

**Status:** PREPARED on 2026-09-24. Not started. No Sankhya call before gate G0 of section 7.  
**Type:** enterprise-credential and trust-boundary qualification (Q-a: the roadmap names it as a
gate; Q-b: it creates a new runtime authority over an enterprise credential; Q-c: the real read and
the pilot proof outlive the pull request)  
**Execution owner:** executor named by the operator  
**Review:** one independent review of the frozen candidate before merge, per
`docs/development/delivery.md`  
**Aprovo:** required. The change adds custody of a company credential and a new grant.

## 1. Authority route

```text
C-021 enterprise connections live in the Workspace and reach a Project as authorized capabilities
+ C-022 model credentials are the Factory's; enterprise connections stay Conexus's
+ C-028 managed-application direction
+ docs/product/contract.md section 12.6
+ docs/product/permission-contract.md (Connector grants row)
+ docs/reference/stage2-managed-application-platform.md (section 5, Q4 row)
+ Q3 verdict ACCEPT_WITH_BOUNDARY (docs/evidence/stage2-q3/README.md)
+ the operator decisions of section 3
        ↓
this qualification
        ↓
evidence + verdict
        ↓
owner reconciliation
```

Repository authority beats this task when they conflict. Evidence that falsifies C-021 section
12.6 or C-028 returns to planning; do not patch around it.

## 2. Protected question

Can Connector Definition -> Workspace Connection -> Project Grant expose one real read-only Sankhya
capability without leaking credentials or generic provider authority?

Prove or falsify this statement:

> A Workspace holds one Sankhya Connection. An Owner grants one Project one read-only operation of
> it. The Builder changes the Q3 purchasing notebook so that its server handler reads purchase order
> 22790 from Sankhya through that grant, and an app-only employee sees the real result. The
> credential never reaches the handler, the worker, the browser, the Builder, a log or the evidence.
> No consumer can name a Sankhya service, entity, query, URL or header. Another Project, another
> Workspace or a revoked grant reads nothing.

## 3. Operator decisions

These were taken by the operator for Q4 and are not reopened by the executor.

1. **Gateway only.** The Connector uses only the Sankhya gateway API: client id, client secret and
   X-Token. The MGE user and password stay out of Conexus, out of the design and out of the
   evidence.
2. **Where the credential comes from.** The credential lives in the operator's credentials file.
   No path, host or value of it appears in this repository, an issue, a pull request, the evidence
   or the generated application. The executor never reads that file; the operator moves the
   credential into the Workspace Connection (section 11, point 3).
3. **Sample.** The sample purchase order is 22790.
4. **Read-only.** Before any Sankhya call, including a test call, the operator confirms that the
   gateway credential is read-only. This is gate G0.
5. **No leak.** The credential never appears in logs, issues, evidence or the generated application.
   The generated application never sees it.
6. **Mastra first.** Where an installed Mastra package ships a mechanism this task needs (tools,
   MCP, authorization, credential encryption, trace redaction), the design uses it or records, with
   the installed version and file, why it does not fit. A second mechanism beside a native one needs
   that record.
7. **Out of scope.** Writing to Sankhya, any other ERP or Connector, and Publish (Q5).

## 4. Preserve

- The Q1 runtime boundary. The worker keeps its empty network namespace, no host files and no
  credential. Its only ways out stay unix sockets the runner binds into it.
- The Q2 handler contract and the Q3 caller. Q4 adds one capability to the handler context and
  changes nothing else in it.
- The Q3 application session, grant and host. The employee still has no Control Plane authority.
- C-015. No Keycloak role, group or claim grants a Connector operation.
- C-022 and C-025. The Factory keeps model credentials. A Sankhya credential is not a model
  credential and never enters the Factory's credential rows or the Builder's sandbox.
- Security 3 (egress): each privileged adapter has a named owner, its own credential and a
  destination pinned by server configuration. There is no universal `fetch(url, secret)`.
- One Conexus installation serves one company (C-024).

## 5. What exists

- **No Connector code.** `apps/` and `packages/` hold no Connector Definition, Workspace Connection
  or Project Grant. `apps/hub/src/platform/config.ts` refuses the retired Sankhya gateway variables.
- **A removed first attempt.** F-06 (`4997162a`, #98) deleted `apps/hub/src/connections/` (a
  `sankhya-om` Connector Definition with a `{ clientId, clientSecret, xToken }` credential schema, a
  response admission and a transport) and `apps/hub/src/gateway/`. Read them from Git history for
  the gateway's shape. Do not restore them: they served a product surface that no longer exists.
- **Research.** `docs/research/stage2/connectors-and-notifications.md` (R09, R10) separates a
  Connection from an authorized operation and names `privilegedFetch(url, method, body)` as the
  anti-example. It names generic Sankhya services (`CRUDServiceProvider`, `DatasetSP`) as leads,
  not contracts. It is not execution authority.
- **The application.** The Q3 purchasing notebook, Project `2b9d2bbb-6336-4957-bb55-78e5fdd228cd`.
  Its handlers receive `{ db, caller }` (`apps/hub/src/app-runner/worker.ts`). The database path is a
  per-invocation relay that authenticates upstream itself (`apps/hub/src/app-runner/pg-relay.ts`).
- **Credential encryption the Hub already uses.** `apps/hub/src/platform/secrets.ts` wraps
  `@mastra/factory/secret-encryption` (0.15.0) with the installation key.
- **Installed Mastra, from `package-lock.json`.** `@mastra/core` 1.67.0, `@mastra/mcp` 1.18.0
  (transitive, through `@mastra/code-sdk`), `@mastra/auth` 1.1.3, `@mastra/server` 1.67.0,
  `@mastra/observability` 1.17.8, `@mastra/factory` 0.15.0. Their embedded documentation is under
  `node_modules/@mastra/*/dist/docs/`.

## 6. Design the executor must produce

### 6.1 Candidates

Compare these with `/pstack:architect` before the first product edit. Each candidate keeps the
three records of section 12.6 of the contract; they differ in where the operation runs and how the
grant is checked.

| | Candidate | Operation runs in | Grant checked by | Native offer used |
| --- | --- | --- | --- | --- |
| A | Hub broker behind a runner relay | the Hub, which holds the Connection | a Conexus grant lookup per call, from the invocation the runner names | `createTool` (`@mastra/core`) for the operation's schema; `@mastra/factory/secret-encryption` for custody |
| B | Mastra MCP server as the broker | the Hub's Mastra server, one tool per operation | Mastra FGA (`fga`, `mapAuthInfoToUser` of `MCPServer`) backed by the Conexus grant | `@mastra/mcp` `MCPServer`, `@mastra/core` FGA, the same custody |
| C | Runner broker | the application runner, outside the worker | the runner, from a grant the Hub hands it | `createTool`; custody still in the Hub, decrypted into the runner |

A is the smallest hypothesis. B earns its place only if one operation served to applications and
later to conversations (contract 12.6) costs less through MCP than through a shared tool definition.
The research found MCP a surface, not a required transport inside one runtime, and the installed
`MCPServer` reference says its tool annotations are hints, not authorization checks. C keeps the Hub
out of each invocation but puts a decrypted enterprise credential in the process that supervises
Project code. It must show why that is not a weaker boundary.

The architect pass also settles:

- the handler-facing shape (one field beside `db` and `caller`) and its error codes;
- whether `conexus/manifest.json` declares the operations a handler uses, and whether the Project
  check refuses an undeclared one;
- how the Builder learns the operation's input and output (the `conexus-server` skill, the manifest,
  or a generated type), without seeing the Connection;
- token lifetime: where the gateway session token lives and when it refreshes.

### 6.2 Properties the design must satisfy

Each row is a falsifier. The design names how it holds each row and which test or case of Q4.8
proves it.

| # | Property |
| --- | --- |
| P1 | The credential is encrypted at rest and decrypted only inside the broker's process. It never enters the worker, the handler, the runner's invocation input, the browser, the Builder's sandbox, a Factory credential row or the Project repository. |
| P2 | No log line, trace span, error body, issue or evidence file carries the credential or the gateway session token. Mastra tracing redacts them, or the broker's spans never receive them. |
| P3 | A consumer names one admitted operation and its typed input. It cannot name a Sankhya service, entity, SQL text, URL, host, header or token. |
| P4 | The operation calls one fixed gateway service with a fixed field list. The broker refuses every other service, including every write service, before the network. |
| P5 | The output is schema-bounded. Fields outside the admitted list are dropped. The response size and the call time are bounded. |
| P6 | Authority is resolved per call from the invocation the runner started: Project, environment and operation. Nothing in the handler's input, headers or arguments changes it. |
| P7 | A Grant can only reference a Connection of its Project's own Workspace. A cross-Workspace grant is unrepresentable in the schema or refused at write. |
| P8 | Revoking a grant refuses the next call. Deleting or disabling the Connection refuses the next call of every Project. |
| P9 | A gateway failure returns a closed Conexus error code. The provider's body, headers and token never reach the handler. |
| P10 | The Q1 worker boundary holds: empty network namespace, no credential, bounded invocation. |
| P11 | Grant, Connection and Definition changes are contract changes: their operations and `docs/product/operation-ledger.md` change in the same commit, and `npm run wire:bijection` passes. |

## 7. Steps

Each step ends in a check that passes before the next starts.

### G0 — Read-only confirmation (STOP gate)

No Sankhya call of any kind, including a test call, authentication or a call from a spike, happens
before the operator confirms in writing that the gateway credential is read-only. The evidence
records the confirmation and its date, never the credential. **Check:** the confirmation is in
`docs/evidence/stage2-q4/README.md` before Q4.5.

Steps Q4.0 to Q4.4 make no Sankhya call and may run before G0.

### Q4.0 (S0) — Native census

Before the first product edit, load the `mastra` skill and read the installed `@mastra/*` packages.
For each mechanism this task touches (operation definition and schema, broker transport, grant
check, credential encryption, gateway token cache, trace redaction, handler context, Builder
guidance), record the native offer (Mastra, an installed dependency, PostgreSQL), its exact source
(the installed `.d.ts` or `dist/docs` file and the package version) and KEEP, USE or NOT FIT with
the reason. Include at least `createTool` and request context (`@mastra/core`), `MCPServer` and its
`fga` and `mapAuthInfoToUser` options (`@mastra/mcp`), FGA (`@mastra/core` `docs-auth-fga`), the
`SensitiveDataFilter` of `@mastra/observability` and `@mastra/factory/secret-encryption`. Check
whether `@mastra/mcp` would become a direct dependency; if so, the technology rule applies.
**Check:** `docs/evidence/stage2-q4/census.md` exists and every row cites a file and a version.

### Q4.1 — Design

Run `/pstack:architect` over the candidates of 6.1. Record the comparison, the chosen candidate
and how each property of 6.2 holds. Freeze it before code. **Check:**
`docs/evidence/stage2-q4/design.md` names the choice and maps P1 to P11 to a test or a Q4.8 case.

### Q4.2 — Connector Definition and Workspace Connection

Add the Sankhya Connector Definition with its one read operation, and the Workspace Connection with
encrypted custody of client id, client secret and X-Token. The Connection stores no MGE user or
password and its schema has no field for one. **Check:** unit tests show a stored Connection holds
only ciphertext, and a read of the Connection through any Hub operation returns no credential field.

### Q4.3 — Project Grant

A Workspace Owner grants and revokes one operation of a Connection to one Project and environment.
Only the Preview environment exists before Q5. **Check:** tests prove P7 and P8 against real
PostgreSQL, and `npm run wire:bijection` passes.

### Q4.4 — Broker and handler path

Build the chosen candidate against a local fake gateway that records every request. **Check:** the
handler reads a fake order through the grant; the fake gateway saw exactly one fixed service with the
fixed fields; the worker's environment, files and memory dump hold no credential; P3, P4, P5, P6 and
P9 pass as tests.

### Q4.5 — First real read

After G0, the executor reads purchase order 22790 once through the broker on the pilot, using the
Connection the operator loaded. **Check:** the broker returns the order; the evidence records the
fields returned, the call count, the duration and a response digest. Business values appear only as
the operator allows (section 11, point 5).

### Q4.6 — Builder proof

With `scripts/builder-eval/run.mjs` on the Q3 Project, one request in product language:

> O caderno de compras passa a mostrar, para o pedido 22790, os dados do pedido que estão no
> Sankhya, ao lado das notas de acompanhamento.

The Builder must use the granted operation from a handler, not a hard-coded value or a browser call.
Budget: two Builder runs, one of them a repair. **Check:** the Preview shows the real order beside
its notes after reload, and the Builder's diff holds no credential, host or Sankhya service name.

### Q4.7 — Employee proof on the pilot

As the Q3 employee (`funcionario-teste@gmail.com`, app-only), in a fresh browser: open the
application, sign in, and see order 22790 from Sankhya. **Check:** a screenshot and the handler's
response in the evidence, with values shown only as section 11 allows.

### Q4.8 — Negative proof

A script sends each request as a real caller and records the request, the answer and whether the
refusal held. Where a refusal could hide a broken fixture, the same run records a live control that
succeeds. Each of these must fail:

- **Credential leak.** A handler returns, logs or throws its whole context, `process.env`, the
  files it can read, or the connector field's internals, and the credential or a gateway token
  appears. A gateway error is forced (bad order number, gateway timeout, refused token) and the
  provider's body or token reaches the handler, the browser or a log. The Builder is asked in
  product language to "use the Sankhya key directly" and any credential reaches its sandbox or diff.
- **Generic provider authority.** A handler passes a Sankhya service name, an entity name, SQL
  text, a URL, a host, a header or a token to the broker, and the broker forwards it. A handler asks
  for a field outside the admitted list and receives it. A handler opens any network connection
  from the worker.
- **Write attempt.** A handler asks for any Sankhya write service or a save, update or delete
  shape, and a request leaves the broker. The fake gateway of Q4.4 counts zero such requests, and
  the pilot run sends none.
- **Cross-Project grant.** Another Project of the same Workspace with no grant calls the
  operation.
- **Cross-Workspace grant.** A Project of another Workspace calls it, and an Owner of another
  Workspace grants this Workspace's Connection to their own Project.
- **Identity by identifier.** A handler changes a Project, environment, Workspace, Connection or
  grant identifier in its input, and the resolved grant changes.
- **Revoked grant.** After the Owner revokes the grant, the next call succeeds. After the Connection
  is disabled, the next call of any Project succeeds.
- **Control Plane reach.** The app-only employee reads or changes the Connection or a grant.

**Check:** every case held, recorded in `docs/evidence/stage2-q4/q4.8-proof.json`.

### Q4.9 — Leak scan

A script loads the credential inside its own process from the Connection and searches, without
printing it, the Hub, runner and Factory logs of the run window, the Mastra traces, the Builder
transcripts, the Project repository at every commit Q4 made, the built Preview artifact and
`docs/evidence/stage2-q4/`. It prints only a count per location. **Check:** every count is zero.

## 8. Falsifiers

Any one rejects the hypothesis:

1. any case of Q4.8 succeeds, or any count of Q4.9 is not zero;
2. the design cannot hold a property of 6.2 on the installed mechanisms;
3. authority for a call is read from the handler's input, a Keycloak claim or a Factory credential;
4. the Builder cannot use the operation within its budget, with the repeated failure named;
5. the real read of 22790 cannot be done with the gateway credential alone.

## 9. Non-goals

- no write to Sankhya, not even behind a flag;
- no other ERP, no second Connector, no Oracle or database facet;
- no Release, Publish or published pointer (Q5);
- no Nango, Pipedream or Composio (their reopen trigger is a real OAuth SaaS Connector);
- no Connector marketplace, discovery or generic query surface;
- no MGE user or password anywhere;
- no Connector use from a conversation or an agent. The design may keep that reuse possible; Q4
  does not prove it.

## 10. STOP law

STOP and return to the planner on:

- **any Sankhya call, including a test call, before G0.** This rule comes first and has no
  exception;
- a need for the MGE user or password, or for a second credential;
- the credential, a gateway token or a value from the operator's credentials file seen anywhere
  outside the broker, even once. Stop, tell the operator so they can rotate it, and write no value
  in the report;
- a need to reopen C-021, C-022 or C-028, or the Q1 worker boundary;
- a property of 6.2 that the chosen design cannot keep;
- a need for a new dependency, including `@mastra/mcp` as a direct one (the technology rule applies
  first);
- a product question section 3 or section 11 does not answer;
- a pilot fault: the Hub, Keycloak or the runner not serving. Check the runner socket before
  blaming the Builder. Never touch the pilot beyond what a step names.

## 11. Points reserved for the operator

1. **G0.** Confirm the gateway credential is read-only before any Sankhya call.
2. **Operation and fields.** Confirm what the notebook shows for an order: which header and item
   fields, and whether 22790 is the order's unique number or its document number.
3. **Loading the credential.** The operator moves the credential from the operator's credentials
   file into the Workspace Connection, by the Hub form or a shell command the design provides. The
   executor never handles it.
4. **Who administers.** Whether a Workspace Owner or an installation administrator creates the
   Connection. The Grant stays with the Workspace Owner unless the operator says otherwise.
5. **Business values in a public repository.** Whether the evidence may show order 22790's values
   (supplier, prices, quantities), or only field names, counts and digests.
6. **The design choice,** if it moves a trust boundary beyond section 4, for example candidate C.
7. **The verdict.**

## 12. Evidence layout

```text
docs/evidence/stage2-q4/
  README.md          verdict, G0 confirmation and date, falsifiers, findings, review
  census.md          Q4.0 native census with versions and files
  design.md          Q4.1 comparison, choice, property map
  q4.5-real-read/    fields, call count, duration, digest
  q4.6-run1/         Builder run, grade, diff summary (run2/ if used)
  q4.7-employee.png  the employee's view, redacted per section 11 point 5
  q4.8-proof.json    every negative case with request, answer and verdict
  q4.9-leak-scan.txt counts per location
```

No file in it holds a credential, a gateway token, a host of the gateway or a path of the operator's
credentials file.

## 13. Verdict

Return ACCEPT, ACCEPT_WITH_BOUNDARY, REJECT or INSUFFICIENT_EVIDENCE in
`docs/evidence/stage2-q4/README.md`, with the census, the design, the positive proof, every case of
Q4.8, the leak scan and the independent review's findings and how each was resolved.

## 14. Owner reconciliation

After the verdict, reconcile only what Q4 proved:

- `docs/product/contract.md` section 12.6: the first Connector's shape;
- `docs/product/permission-contract.md`: the Connector grant row, from direction to delivered;
- `docs/reference/security-and-authority.md`: section 3 gains the Sankhya adapter; section 5 gains
  enterprise credential custody;
- `docs/reference/stage2-managed-application-platform.md`: the Q4 row and the handler contract;
- `docs/roadmap.md`: the Q4 status and the exact next action.

## 15. Reopen triggers

- a real need to write to Sankhya;
- a second Connector, or a real OAuth SaaS Connector (the Nango trigger);
- a conversation or agent that must call the same operation;
- Q5 needing a Published grant model different from this one;
- a Sankhya gateway change to its authentication or services.
