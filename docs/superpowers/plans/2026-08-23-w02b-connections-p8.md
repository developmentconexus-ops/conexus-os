# W-02B Connections Functional P8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the operator-testable low-fidelity W-02B Connections P8 candidate that proves the approved Connection-first interaction structure without inventing Product authority.

**Architecture:** One deterministic standalone HTML/CSS/vanilla-JS Evidence artifact inherits the locked GF-01 shell grammar and models one exact current owner scope at a time. Local fixtures emulate accepted `CON-01..09` shapes only; all mutations reset on refresh and no network/browser persistence is allowed.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, Node.js repository contract tests.

**Spec:** `docs/evidence/4c/w02b-connections-structural-hypotheses.md`

## Global Constraints

- `Connection.name` is the primary human identity.
- `configured != qualified != bound != healthy != caller-authorized`.
- `CON-03` stays a lightweight scoped list; `CON-04` is the exact detail read with current non-secret configuration after F09.
- Credential input is write-only/transient; no credential value/readback may appear.
- Qualification is exact revision + exact environment + exact qualification subject; no `latestQualification` or history list.
- No `fetch`, `localStorage`, `sessionStorage`, Product implementation or new Product operation.
- W-02B remains `NOT LOCKED` until operator walkthrough/adjudication.

---

### Task 1: Add the functional-P8 repository falsifier

**Files:**
- Create: `tests/repository/4c-w02b-connections-functional-wireframe.test.mjs`

**Interfaces:**
- Consumes: approved P7 spec and accepted Connections wire.
- Produces: repository-level contract that fails until the HTML P8 exists and carries the required interaction/authority boundaries.

- [ ] **Step 1: Write the failing test**

Create a Node test that requires:

```js
const htmlPath = 'docs/evidence/4c/w02b-connections-functional-wireframe.html'
if (!existsSync(path(htmlPath))) throw new Error('W-02B functional P8 HTML is missing')
```

Then require structural tokens for:

```text
data-wireframe="w-02b-connections"
CANDIDATE · NOT LOCKED
Connection.name
CON-01 .. CON-09 material operation traces
id="connectionSearch"
id="createConnection"
id="editConfiguration"
id="credentialForm"
id="qualificationForm"
currentRevisionId
credentialConfigured
configuration
qualificationId
evidenceRefs
```

Require interaction-law tokens proving:

```text
saveConfigurationRevision
setCredential
runQualification
simulateStaleRevision
credentialInput.value = ''
configured != qualified != bound != healthy != caller-authorized
```

Reject:

```js
for (const forbidden of ['fetch(', 'localStorage', 'sessionStorage']) {
  if (html.includes(forbidden)) throw new Error(`W-02B P8 must not use ${forbidden}`)
}
for (const forbiddenClaim of ['latestQualification', 'Qualification history', '>Connected<', '>Ready<', '>Healthy<']) {
  if (html.includes(forbiddenClaim)) throw new Error(`W-02B P8 invents forbidden truth: ${forbiddenClaim}`)
}
```

- [ ] **Step 2: Run Verify and confirm RED**

Run through Draft PR CI.

Expected: repository test fails only because `docs/evidence/4c/w02b-connections-functional-wireframe.html` does not exist.

- [ ] **Step 3: Commit the falsifier**

Commit message:

```text
test(4c): require W-02B functional Connections P8
```

---

### Task 2: Build the deterministic Connections P8

**Files:**
- Create: `docs/evidence/4c/w02b-connections-functional-wireframe.html`

**Interfaces:**
- Consumes: `ConnectorDefinition`, `Connection`, `ConnectionDetail`, `ConnectionRevision`, `ConnectionQualification` semantics from `contracts/api/product/connection-paths.yaml`.
- Produces: standalone operator-facing P8 Evidence only.

- [ ] **Step 1: Implement the locked-shell-compatible frame**

Use an unbranded monochrome shell with current Workspace context and `Connections` as the active Workspace rail item. Add an explicit fixture notice:

```text
Fixture interaction only. No backend/runtime behavior is claimed. Refresh resets local demonstration state.
```

- [ ] **Step 2: Implement scoped Connection browse**

Create deterministic fixture `Connection[]` rows containing only:

```js
{
  connectionId,
  name,
  ownerScopeKind,
  ownerId,
  connectorDefinitionId,
  connectorVersion,
  currentRevisionId,
  credentialConfigured
}
```

Render `name` as the primary label; provider/version and owner scope are secondary metadata. Local search filters only disclosed rows.

- [ ] **Step 3: Implement exact Connection detail**

For the selected Connection, render accepted `ConnectionDetail` truth including current non-secret `configuration`. Keep credential presence separate from qualification.

- [ ] **Step 4: Implement configuration revision flow**

Prefill the edit form from current `configuration`, copy the current `currentRevisionId` into form context, and on successful fixture submit:

```js
function saveConfigurationRevision() {
  // compare expected revision with current fixture revision
  // if stale, render explicit conflict and do not mutate
  // otherwise create next immutable fixture revision id and replace current detail configuration
}
```

Add a visible `Simulate concurrent revision` control so the operator can falsify stale-write handling before submitting.

- [ ] **Step 5: Implement write-only credential flow**

Generate credential fields from the selected ConnectorDefinition fixture's `credentialInputSchema`. On submit:

```js
function setCredential() {
  state.connectionDetails[state.selectedConnectionId].credentialConfigured = true
  credentialForm.reset()
  credentialInput.value = ''
}
```

Never store or render submitted credential values after the event handler completes.

- [ ] **Step 6: Implement exact qualification flow**

Populate environment options only from ConnectorDefinition `environments`. On submit create a deterministic `ConnectionQualification` fixture bound to exact current revision and selected environment, then navigate to the exact qualification detail showing `qualificationId`, `connectionRevisionId`, `environment`, owner-issued `qualificationState`, and `evidenceRefs`.

- [ ] **Step 7: Implement Create Connection**

Choose a ConnectorDefinition first, render its configuration fields, require `Connection.name`, create a lightweight `Connection` plus current `ConnectionDetail`, then navigate to detail. Do not auto-create credential or qualification state.

- [ ] **Step 8: Preserve negative authority laws in visible copy**

Display a compact law block:

```text
configured != qualified != bound != healthy != caller-authorized
```

Explain that credential presence and qualification are separate facts. Do not render generic Connected/Ready/Healthy badges.

- [ ] **Step 9: Run Verify and confirm GREEN**

Expected: new P8 test passes and existing whole repository/wire checks remain green.

- [ ] **Step 10: Commit**

Commit message:

```text
docs(4c): add functional Connections P8 candidate
```

---

### Task 3: Route to operator walkthrough without auto-lock

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/evidence/4c/w02b-connections-structural-hypotheses.md`

**Interfaces:**
- Consumes: mechanically green P8 candidate.
- Produces: current mutable status `W-02B P8 FUNCTIONAL CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED`.

- [ ] **Step 1: Update P7 Evidence chronology**

Append exact RED/GREEN Verify run numbers and the candidate HTML path. Preserve `P7 OPERATOR APPROVED ... / NOT LOCKED` as historical decision context.

- [ ] **Step 2: Update roadmap minimally**

Route exact next action to operator walkthrough of the Connections P8. Keep 4D–4G not started and Product implementation blocked. Stay under bootstrap budget; do not raise the limit.

- [ ] **Step 3: Run final Verify on exact HEAD**

Expected:

```text
SUCCESS
113 ↔ 113
Connections = 9
ordinary Permissions = 25
W-02B = NOT LOCKED
```

- [ ] **Step 4: Stop at operator gate**

Do not create a Screen Contract or P9/P10 lock artifact until the operator actually uses the HTML and says `LOCK` or approves after revisions.
