# 4C GF-01 — Authority Feasibility Preflight

> **Status:** `4C-F01` RESOLVED / OPERATOR ACCEPTED / RECOMPILED / GREEN
> **Block:** `GF-01` — global frame + Workspace/Project navigation
> **Authority posture:** Evidence of the falsifier, operator adjudication and bounded recompile; current Product property authority is `docs/product/human-context-identity-contract.md`.

GF-01 stopped before wireframing because the accepted wire originally exposed only opaque Workspace/Project identifiers. The operator accepted the smallest Product correction: required creation/read-only human presentation identity `Workspace.name` + `Project.name`, with no rename/update authority.

## 1. Accepted correction

```text
Workspace.name
Project.name
```

Both are:

```text
required at creation
non-blank human-readable string
presentation identity only
not stable ID
not authorization
no uniqueness guarantee
immutable / no rename in F1
```

Creation/read projection now closes:

```text
WS-01  requires name
WS-02  returns name
IAM-01 disclosable Workspace entries carry name

PRJ-03 requires name
PRJ-06 requires explicit destination Project name
PRJ-01/02 representations carry name
IAM-01 disclosable Project entries carry name
```

Canonical bounded Product property authority: [Human Context Identity Contract](../../product/human-context-identity-contract.md).

## 2. Negative controls preserved

The correction did **not** admit:

```text
UpdateWorkspace
UpdateProject
RenameWorkspace
RenameProject
generic metadata/settings map
name uniqueness semantics
name-based authorization or routing
frontend ID→label authority
source repository name as Product identity
Area metadata/name changes
```

`N_platform` remains 111 and `4B-F01` remains historically correct/current for generic mutation subtraction.

## 3. TDD proof

Initial falsifier:

```text
Verify #417 / #419
→ GF-01 human-context-label test RED
```

Exact bounded semantic gate:

```text
Verify #424
→ 4C-F01 creation/projection test RED
→ GF-01 human-label test RED
→ 43 prior gates PASS
```

First recompile attempts exposed two checker/test-harness defects rather than Product failures:

```text
Verify #425
→ exact 4C-F01 semantic test GREEN
→ generic raw-YAML label matcher too syntax-specific

Verify #426
→ all 45 repository tests GREEN
→ IAM/Workspace checker GREEN
→ 111↔111 bijection GREEN
→ Project bundle checker duplicated a source-level ProjectSummary assertion across a Redocly component-name collision
```

After correcting those test/checker mechanics without weakening Product semantics:

```text
Verify #427 = SUCCESS
repository tests       = 45/45 PASS
4A ↔ OAS               = 111 ↔ 111
wire carriers          = PASS
IAM/Workspace          = PASS
Project                = PASS
remaining owner slices = PASS
Technical Ingress      = PASS
Generated projections  = PASS
Budget proof           = PASS
Whole 4B               = PASS
```

## 4. GF-01 authority-feasibility result

The global frame can now truthfully obtain:

```text
current authenticated Account/session context
current disclosable Workspace IDs + human names
current disclosable Project IDs + Workspace IDs + human names
exact Workspace/Project read identity
```

Interaction classification for the frame:

```text
context selection     = NAVIGATION / URL_NAVIGATION
context labels         = PROJECTION_ONLY / SERVER truth
session end            = PRODUCT_COMMAND / IAM-02
reauthentication       = TECHNICAL_INGRESS / authentication protocol
Workspace/Project nav  = NAVIGATION
```

No browser-selected Workspace/Project ID creates authority; every protected read/write remains server-revalidated.

Concurrency/idempotency is not material to context switching because selecting context is navigation, not a Product mutation. Material outcome classes that GF-01 must expose later remain unauthenticated/reauthentication, denied/non-disclosable, missing current context and ordinary dependency failure.

## 5. Resume condition

`4C-F01` is closed. `GF-01` may now resume only its structural cycle:

```text
4C-7 bounded structural hypotheses
→ 4C-8 rendered low-fidelity global-frame candidate
→ operator visual adjudication
→ LOCKED or REVISE
```

No dependent material block may inherit the frame as `LOCKED` until the operator explicitly adjudicates the rendered candidate. Do not begin 4D or Product implementation.
