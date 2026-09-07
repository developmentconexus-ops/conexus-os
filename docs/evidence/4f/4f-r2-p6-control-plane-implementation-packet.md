# R2-P6 Control Plane implementation packet

Status: **CLOSED PASS**
Date: 2026-09-07
Parent: [`4f-r2-stage-code-packet.md`](4f-r2-stage-code-packet.md)
Product owners: locked W-02A, W-02B and P-02 Screen Contracts

Closure: [`review adjudication and result`](4f-r2-p6-control-plane-review-adjudication.md)

## 1. Outcome

P6 realizes one operator-usable Control Plane journey over the exact existing
R2 operation census. It adds no Product operation, Permission, record class or
provider capability.

```text
Workspace Brain       BRN-01/02/03/10
Workspace Connections CON-01..09
Project Brain         BRN-14 + PRJ-10/11/12 + purpose-bound BRN-02
Project Integrations  PRJ-13/14/15 + purpose-bound CON-03 + contained CON-04..09
```

The UI must preserve these distinctions:

```text
publication != Project adoption
configured != credentialed != qualified != bound != healthy != authorized
Workspace Brain publication != Project Brain Context
Workspace proximity != Project applicability
```

## 2. Admitted Screen Contract subset

The historical Screen Contracts cover later tranches as well as R2. P6
implements only the subset reachable through the 20 generated routes.

### Workspace Brain

- Knowledge is the primary surface: exact published identity from BRN-01,
  immutable revision summaries from BRN-02 and Domain -> Concept browse from
  BRN-03.
- Revisions and Health are distinct views; BRN-10 health does not become
  knowledge or publication authority.
- Discovery, proposals and publication controls (BRN-04..09) are absent.

### Workspace Connections

- The collection opens a context-preserving detail panel.
- Creation is a separate modal/form using CON-01/02 and CON-05.
- Configuration revision, write-only credential replacement and qualification
  are distinct inline actions using CON-06/07/08/09.
- Credentials are never read, prefilled, cached after submit or rendered in a
  success/error message.
- The exact five qualification states remain visible without collapsing
  `FAILED` and `INDETERMINATE`.

### Project Brain

- BRN-14 is the primary meaning/applicability view.
- PRJ-10 is secondary binding administration. Its 404 is nondisclosure and may
  not be represented as conclusive absence.
- Revision choice is `BRN-02?forProjectId=<exact Project>` and requires the
  independent `project.manage + brain.bind` authority.
- PRJ-11/12 are explicit adoption/removal. A newer Workspace publication never
  silently changes the Project pin.

### Project Integrations

- PRJ-13 presents current use before available Connections.
- Purpose-bound `CON-03?forProjectId=<exact Project>` supplies eligible choices;
  PRJ-14/15 are the only adoption/removal actions.
- Project-private Connections reuse the same Connection panel within the exact
  Project owner scope. Workspace-owned content is not relabeled as Project
  ownership.
- A revised or newly qualified Connection never becomes adopted automatically.

Project Data, Capabilities, analytics, Builder, release and runtime controls are
not rendered because their operations are outside R2.

## 3. Required backend conformance correction

Current production code unconditionally refuses every purpose-bound BRN-02
request. That is a deferred implementation omission against already accepted
P-02/BRN-02 authority, not a new Product decision.

The correction is limited to:

1. one append-only migration defining an IAM-owned `STABLE SECURITY DEFINER`
   read admission for exact account + Project + Workspace revision selection;
2. admission of Workspace membership plus independently stored
   `project.manage + brain.bind` without requiring generic `brain.read`;
3. EXECUTE only for the existing `hub_r2_brain_read` role;
4. one Brain-store purpose branch that reuses the existing Registry revision
   listing and Brain-owned summary parser; and
5. route delegation using `forProjectId`, with ordinary BRN-02 unchanged.

The selection admission must not reuse mutation preflight, active-intent,
source-settlement or current-binding conditions. It must not use the locking
`iam.admit_brain_binding` inside `BEGIN READ ONLY`, widen table grants, disclose
BRN-03 `knowledgeBrowse`, or grant `brain.read` by implication.

Required negatives: missing/foreign/sibling Project or Workspace, missing
membership, revoked `project.manage`, revoked `brain.bind`, bind-only generic
BRN-02 and malformed revision source. All stop before unauthorized Registry
disclosure.

## 4. Browser architecture

- Extend the existing R2 contract generator to emit the executable same-origin
  transport. Generated contract types, paths, methods and state carriers remain
  the only browser wire projection.
- Feature API adapters own HTTP status/header handling, clear authority cache on
  401 and retain actual `Response` metadata needed for ETag and 204 behavior.
- Add exactly four routed surfaces: Workspace Brain, Workspace Connections,
  Project Brain and Project Integrations. Extend the existing Shell navigation;
  do not create a second shell.
- Reuse the Connection panel across Workspace and Project-private owner scopes.
  Do not create a generic resource editor or join Workspace Brain knowledge into
  Project applicability client-side.
- Server responses remain authority. The browser may show pending state but may
  not announce mutation success before the response, infer access from hidden
  controls, or synthesize a current revision/binding/qualification.

## 5. Execution sequence

```text
P6-A purpose-bound BRN-02 conformance correction + focused PostgreSQL/HTTP proof
P6-B generated executable R2 client + typed feature API adapters
P6-C Workspace Brain and Connections routed surfaces
P6-D Project Brain and Integrations routed surfaces
P6-E browser behavioral matrix + production browser/server/PostgreSQL composition
P6-F independent review, clean verification, result and roadmap closure
```

Each increment is locally committable after its focused checks. A later
increment may correct an earlier one but may not broaden this packet.

## 6. Proof contract

Focused proof must cover:

- generated transport drift and exact 20-operation census;
- authenticated, 401, denied/nondisclosed and unavailable states without
  optimistic success or misleading absence claims;
- immutable/current state carriers: `If-Match`, `If-None-Match`, explicit
  revision/subject coordinates and idempotency keys;
- credential field disposal and no read-back;
- explicit Brain/Connection adoption after an independently newer
  publication/revision/qualification;
- keyboard operation, dialog/sheet focus restoration, named controls/statuses
  and narrow-layout no-overflow behavior;
- one real browser -> production Hub modules -> restricted PostgreSQL and
  credential backend -> admitted OCI Git composition. Provider behavior in P6
  remains a controlled local transport; it creates no new live Sankhya claim.

Closure requires the focused P6 check, retained P0..P5/R1 checks proportionate
to the changed seams, `npm ci`, `npm run verify`, extended repository checks,
the native R1C-14 check, and independent Fable plus AGY review of the material
diff. Lead adjudicates findings against the exact owners above.

## 7. Mutation envelope and stop law

Expected files are limited to the successor migration/checksum, Brain route and
store seams, R2 generator/projection, `apps/web` R2 APIs/components/routes/Shell
and styles, P6 tests/scripts, package/workflow wiring and current Evidence/docs.

Stop at the smallest owner rather than inventing behavior if implementation
requires a new operation, Permission, durable owner, DTO, hidden authorization
inference, provider call, Data/Capabilities/analytic surface, or a change to the
locked Screen Contract meaning. Push, PR, merge, deploy, ERP writes, additional
live Sankhya reads, R3+, RB/Mastra and later Budget work remain outside P6.
