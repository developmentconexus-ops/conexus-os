# 4C W-01 — Authority Feasibility Preflight / Global-Maximum Adjudication

> **Status:** `4C-F02 / OPERATOR ACCEPTED / 4A+4B RECOMPILED / GREEN`
> **Block:** `W-01` — Projects + create/import / Inception / candidate+approved Baseline
> **Locked dependency:** `GF-01 H1-R2` remains `LOCKED / OPERATOR APPROVED`.
> **Implementation authority:** none.

The operator conditionally approved the first source-bootstrap proposal only if it survived the Conexus Global-Maximum method. It did not. Completing the whole Journey-B preflight exposed three independent missing Product properties before any W-01 layout or HTML was authored. The operator then accepted the revised bounded correction and the affected 4A/4B/4C authority was mechanically recompiled before structural work resumed.

## 1. Accepted Journey B

Current Product authority requires:

```text
Workspace
→ Create/Import Project
→ establish/associate canonical source repo
→ Inception / Discovery
→ inspect objective/users/constraints/source systems/real data where relevant
→ propose sufficient Project Baseline
→ human checkpoint: “this is what we are building”
→ approved Baseline digest
→ initial Change
```

F1 has one canonical source repo per Project. Project Git is canonical Project authoring/provenance truth. Inception is not a fake Change.

## 2. Three independent falsifiers

### F02-A — source bootstrap was not caller-expressible

Pre-correction `PRJ-03 CreateProject` accepted only `name`. `PRJ-07 RunInceptionInvestigation` intentionally accepted no source selector and operated over already admitted sources. No Product or Technical-Ingress operation established a brownfield Git source.

### F02-B — Inception business intent was not caller-expressible

Journey B requires objective/users/constraints to participate in Inception. Pre-correction `PRJ-07` had no request body and no separate admitted Inception-context command existed. Source inspection alone could not tell a greenfield Project what humans intended to build.

### F02-C — candidate Baseline was not durably readable before approval

Pre-correction `PRJ-07` yielded `candidateBaselineDigest + sourceRevision`; `PRJ-09` approved the digest; `PRJ-08` read only the already-approved Baseline. There was no durable caller-readable exact candidate subject for refresh/re-entry before the human checkpoint. Browser cache/localStorage or rerunning Inception was not authority.

Clean TDD RED:

```text
Verify #465 = EXPECTED RED
repository tests = 51
prior gates      = 48 PASS
W-01 falsifiers  = 3 FAIL exactly

F02-A source bootstrap
F02-B inception intent
F02-C candidate Baseline re-entry/read
```

All prior GF-01, 4C-F01, 4A/4B, architecture, documentation and repository gates remained green.

## 3. Adversarial option comparison

| Need | Candidate | Disposition | Reason |
| --- | --- | --- | --- |
| source bootstrap | enrich `PRJ-03 CreateProject` with discriminated source bootstrap | **ACCEPTED** | source choice is part of Project birth; reuses existing atomic Project+initial-grant creation meaning |
| source bootstrap | new `ImportProject` operation | REJECT | duplicates Project creation semantics and splits one human job without a distinct lifecycle owner |
| source bootstrap | post-create `AttachSource` | REJECT | creates a partially initialized Project and invents post-create source mutation/switching state |
| source bootstrap | source selector on `PRJ-07` | REJECT | conflates source admission with investigation |
| Inception context | required `intent` on `PRJ-07` | **ACCEPTED** | keeps human intent at the investigation boundary without generic Project metadata |
| Inception context | add intent to `PRJ-03` | REJECT | mixes Project/source establishment with semantic investigation |
| Inception context | separate context CRUD/operation | REJECT | no independent owner/lifecycle/consumer; unnecessary ceremony |
| candidate review | exact candidate read by digest | **ACCEPTED** | supports refresh/re-entry and exact human review without mutating candidate state |
| candidate review | overload `PRJ-08 GetApprovedProjectBaseline` | REJECT | collapses current approved truth with unapproved candidate truth |
| candidate review | rely on `PRJ-07` response/browser state | REJECT | transient UI state cannot be durable review authority |
| candidate review | use generic source-file read | REJECT | no accepted candidate Baseline path contract and wrong Permission/semantic owner |

External platform patterns were used only as Evidence; they never defined Conexus authority.

## 4. Accepted bounded correction

### 4.1 `PRJ-03 CreateProject` — source bootstrap at Project birth

Current required closed discriminated input:

```text
sourceBootstrap.mode = NEW | EXISTING_GIT
```

`NEW`:

```text
Project creation
→ platform establishes one canonical Project Git
→ exact scaffold/seed/hosting mechanics remain 4D
```

`EXISTING_GIT`:

```text
caller identifies one existing Git remote through untrusted provider-neutral repositoryLocator
→ trusted GitInfra validates/adopts under server-side credentials/policy
→ exact immutable source revision is resolved server-side
→ successful Project has one canonical Project Git
```

Binding constraints:

- successful creation never leaves a half-created Project waiting for source attach;
- no Git credential/secret in Product payload;
- no generic outbound-network authority from the locator;
- no second mutable source authority/copy in parallel;
- no post-create source switching;
- no multi-repo F1;
- no Repository CRUD domain;
- no provider-specific GitHub/GitLab Product semantic;
- idempotent CreateProject intake still prevents duplicate Project creation.

### 4.2 `PRJ-07 RunInceptionInvestigation` — human intent, not source selection

Current required input:

```text
intent: string (non-blank)
```

It expresses objective/users/constraints in ordinary language and is Inception input, not generic mutable Project metadata.

`PRJ-07` remains forbidden from accepting source-selection authority such as repository URL/locator, source ID, arbitrary Connection, SQL or arbitrary target URL. The server resolves already-admitted canonical Project source/context. The operation returns the exact `ProjectBaselineCandidate` representation for immediate review.

### 4.3 `PRJ-23 GetProjectBaselineCandidate`

Current exact read:

```text
consumer    = W-01 human candidate-Baseline review/re-entry
owner       = Project
principal   = HUMAN_ACCOUNT_SESSION
Ingress     = CP
Permission  = project.manage
class       = READ
IC          = IC0
subject     = exact Project + candidateBaselineDigest
```

Return:

```text
ProjectBaselineCandidate
  candidateBaselineDigest
  sourceRevision
  sourceText
  applicationRuntimeProfile = MANAGED | DEDICATED
```

No list-candidates operation, candidate CRUD, workflow/status domain or generic artifact API is admitted. No new Hub durable record class is justified. `PRJ-09 ApproveProjectBaselineRevision` remains the exact decision by digest and revalidates current eligibility/staleness.

## 5. Current derived census

Counts are results, not targets:

```text
fixed Product operations      111 → 112
Project operations             21 → 22
fixed frontend-reachable      110 → 111
fixed no-direct-browser         1 = PAR-05
Budget operations               2 unchanged
total frontend-reachable      112 → 113
ordinary Permissions           25 unchanged
Technical Ingress               3 unchanged / Product impact 0
semantic owners                unchanged
new durable record classes      0
```

Preserving `111` by hiding the candidate read in frontend state or overloading another operation would have violated the same methodology that produced the original count.

## 6. Recompile proof

Affected authority/proof was recompiled through:

```text
Product operation ledger / exact count
Permission consumer mapping
Project Product OAS + canonical entrypoint
Project schema checker
4A↔4B 112↔112 bijection
current-state/carrier proof
Technical Ingress zero-impact proof
4C foundation + surface coverage = 113 frontend-reachable concrete ops
Kubb 5.0.0 real-OAS generated projection = 112 exact pairs
whole-4B adversarial proof
all three W-01 falsifiers
```

Final exact proof for the bounded correction:

```text
Verify #488 = SUCCESS
candidate HEAD at proof = c2043a6c6f328defe1d29e38132ac5760997f5cd
repository tests = 51 / 51 PASS
fixed Product bijection = 112 / 112
Project slice = 22 operations
W-01 falsifiers = 3 / 3 GREEN
```

Later documentation-only commits must remain green before a final current-head claim.

## 7. Resume condition

`4C-F02` is closed. W-01 may resume only its own structural method from the corrected authority:

```text
reference study when material
→ cards/grid vs structured list/table comparison
→ create/Inception/Baseline composition hypotheses
→ authority-feasibility recheck
→ bounded HTML/CSS lo-fi P8
→ operator visual adjudication
```

`GF-01` remains locked. W-02 and later blocks, 4D and Product implementation remain unopened/blocked unless separately authorized.