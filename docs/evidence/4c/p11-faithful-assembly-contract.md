# P11 faithful assembly contract

> **Status:** `CURRENT P11 LOCKED / OPERATOR APPROVED / HISTORICAL P11 LOCK PRESERVED`
> **Current approved P11 blob:** `45172fd437b0c3b0236b641bcb803c20f165959f`
> **Historical approved P11 blob:** `536052096dd10dec2f604ccef49aa64ba52e4dac`
> **Purpose:** make preservation of locked frontend interaction structure falsifiable
> **Implementation authority:** none

The historical lock remains preserved. P12 Families 1–4 and the current transport-only P11 are operator-locked at their exact identities.

Exact current input identities:

```text
T-01 = 4da586d8a421bb03413bc82ee5b2e82432d6f620
GF-01 = 603b47ccaba1fe6557e557b48efa4f40207d3724
W-01 = d466d66a125605471f2f879bbe376e4de7681d95
W-02A = f0a6902737a36217b081ff61768caa39c98c4734
W-02B = f8a4be72cd5af86ea06b4dd82d8710e58edb203f
W-03 = e9d630622d853d6e352737f46202f2765526fd6a
W-04 = 71e03432a0abd34ae35301094010fd670bb78b98
P-01 = 25e5077106892c4ff6aba6774987e73a12ccff51
P-02 = fd23303ac71bbf256887bf361fb0f8c7cf9aae00
P-03 = 17d31534fac0e57a74f70202567b23d8a63cd3c0
P-04 = e036684e3e66d028361db2d708cf05811a367f4b
P-05 = d00b2126667a0a51317c653c57c237444a129dfb
PA-01 = ffba5935d8fccd0fc5d7ad4d275fe38b09294674
```

Preserved historical terminal input identities:

```text
T-01 = 3955589bfd983923b74a4cd72f6ef13f2b9867e7
GF-01 = e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3
W-03 = e9d630622d853d6e352737f46202f2765526fd6a
P-01 = 8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec
P-03 = b462c3bb536e0562d28ffb85ef9f6d44fb52df3a
```

## 1. Assembly law

```text
locked functional block structures
→ remove only duplicate outer shells/proof chrome where required
→ preserve protected regions, controls, owner states and accessibility behavior
→ connect exact entry/exit coordinates
→ operate complete journeys
```

Forbidden:

```text
replace a block with summary cards/prose
mark a block covered because its name appears
replace owner-specific states with global generic scenarios
turn a boundary into an inert dialog
copy fixture labels while dropping interaction
select framework/component/SDK/runtime
```

## 2. Input gate

| Input | Required state before P11 |
| --- | --- |
| T-01 trusted setup | P8 operator LOCK + P9/P10 closed |
| GF-01 | baseline preserved + Account-menu delta re-LOCKED |
| W-01…W-04 | exact existing locked blobs preserved |
| P-01 | baseline preserved + F05 Agent Studio delta re-LOCKED |
| P-02 | exact existing locked blob preserved |
| P-03 | baseline preserved + F05 reference-presentation delta re-LOCKED |
| P-04/P-05/PA-01 | exact existing locked blobs preserved |
| coverage | `127/127` browser-facing mapped after excluding PAR-05 from `N_platform=128` |
| terminal P10 | vocabulary reconciled against final locked deltas |
| blocking findings | zero |

## 3. Per-block preservation manifest

| Block | Protected structure that must exist in assembled P11 |
| --- | --- |
| T-01 | exact eligible bootstrap identity state; first Account/Workspace progression; retry/sealed/re-entry; no signup/tenant surface |
| GF-01 | one adaptive rail; Workspace/Project breadcrumb-switchers; Back to Projects; contextual Conexus seam; operable Account/EndSession |
| W-01 | Project browse/create; NEW/EXISTING_GIT; Inception intent; exact candidate visual review; Ask Conexus; refinement queue/apply; exact approval/comparison |
| W-02A | Knowledge Domain→Concept browse; Discovery with explicit Project; proposal review/decision; separate publication; revisions; health |
| W-02B | Connection browse/search; contextual panel; configuration revision; write-only credential replacement; exact test/diagnostic/Evidence; Needs retest |
| W-03 | People/Areas administration; effective DIRECT/AREA sources; exact mutations/re-read; server-filtered immutable Audit/detail |
| W-04 | complete disclosed Agent catalog; search/Project/Release filters; purpose/owning Project/Release posture; exact P-03 handoff |
| P-01 | app-first Preview; right Conexus Build/Plan composer; Change/progress; Code/Diff; Plan/Findings/Evidence/Details; complete Agent Studio with owner-backed references |
| P-02 | Data explorer; Capabilities contract detail; Integration use + contained Connection lifecycle; Project Brain context/binding; governed Analyze |
| P-03 | Agent landing/decision queue; Overview; complete Definition/reference presentation; Automations; Runs/Evidence; exact approval; P-01/P-04 handoffs |
| P-04 | serving environments; immutable Releases/composition/proof; Promotion history/conformance/currentness; Activity/Jobs/Effects/Usage/Audit; originatingRun-filtered Effects entry |
| P-05 | app-access candidates/roles/consequences/grant/edit/revoke; duplicate NO_DATA; archive consequences/currentness |
| PA-01 | independent app frame/session; business surface; full-page/panel/inline Agent hosts; Conversation/clarification/new run; exact approval; material app states |

The manifest is semantic. Exact CSS text, fixture values and duplicated standalone proof controls need not be copied unless they are required to exercise a protected property.

## 4. Journey proof matrix

P11 must operate all accepted journeys or their exact current platform contribution:

```text
A  trusted bootstrap → Account/session → first Workspace
B  Project create → Inception → candidate review/refine/approve
C  Build → Change/Plan/Preview/diff/Evidence → Release
D  Brain Discovery → human resolution → proposal
E  proposal decision → publication → explicit Project binding/context
F  Connection maintain/qualify → explicit Project Integration use
G  Data/static capability/AnalyticQuery inspection
H  Release/Promotion/serving → separate Published-App entry
I  discover/create/evolve Agent → same Build Change/proof/Release
J  use Agent in Published App → Conversation/clarification/AgentRun
K  exact sealed effect decision → exact originating-run effect investigation
L  discover/run/inspect managed job
M  duplicate Project with NO_DATA and destination authority
N  platform contribution only; Budget Analyzer application UI remains FUTURE_PRODUCT_APP
O  maintenance Change and separately governed reusable Brain learning
```

## 5. Exact coordinate contract

Every cross-block link declares:

```text
source owner
source-issued coordinate
URL_NAVIGATION representation
destination owner read
destination authorization/disclosure recheck
failure/recovery when the coordinate is stale or undisclosable
```

Minimum tested coordinates include Workspace, Project, candidate digest, Change/draft revision, Agent, Brain revision/authoringRef, Connection/revision, Release/environment/pointer generation, AgentRun, originatingRun, ApprovalRequest/digest and Audit/effect detail refs.

## 6. Executable proof floor

Repository proof must do more than search strings:

1. parse and load the assembled HTML;
2. navigate every manifest route;
3. exercise each cross-block handoff and verify resulting URL coordinates;
4. operate one representative protected interaction per block;
5. exercise owner-specific negative/recovery states, not one global error banner;
6. verify inert tabs/buttons/links = 0 for material controls;
7. verify focus/overlay/drawer behavior and narrow transformation;
8. verify Budget Analyzer app UI = 0 while locked Budget-related knowledge/capability labels may remain;
9. prove no selected framework/design-system/SDK/runtime or network/persistence code;
10. fail when any manifest item is removed.

Targeted lexical checks may supplement this proof but cannot substitute for behavior.

## 7. Exit

P11 may be presented for operator walkthrough only when:

```text
all input locks current
manifest coverage = 100%
journeys A–O dispositioned and operable where current
deep links exact
cross-block owner states honest
wide/narrow behavior exercised
blocking finding = 0
required repository verification green
```

Only the operator may then choose `REVISE | LOCK`. P12 remains subsequent adversarial whole-product review.
