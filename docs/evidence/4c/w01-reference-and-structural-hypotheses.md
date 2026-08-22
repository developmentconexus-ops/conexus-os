# 4C W-01 — Reference Study and Structural Hypotheses

> **Status:** `CANDIDATE EVIDENCE / W-01 4C-6 → 4C-7F / OPERATOR-REVISED / NOT LOCKED`
> **Block:** `W-01` — Projects + source-complete create / Inception / candidate+approved Baseline
> **Inherited authority:** `GF-01 H1-R2 = LOCKED`; `4C-F02 = OPERATOR ACCEPTED / GREEN`.
> **Implementation authority:** none.

This record derives only the W-01 structural candidate after the Journey-B authority preflight was corrected and made GREEN. The operator subsequently revised only the Projects collection presentation: the earlier GF-01 simple-card treatment is preferred over the compact list. This direct human Evidence reopens only the W-01 collection hypothesis; it does not add Product operations, Project metadata, backend state, SDK/runtime choices or final visual design.

## 1. Exact human job

```text
Workspace Projects
→ find/open an existing disclosed Project
OR create one source-complete Project
→ enter exact Project Inception
→ state current business intent
→ run governed investigation over already-admitted source/context
→ inspect exact candidate Baseline
→ compare against current approved Baseline when one exists
→ approve exact candidate digest when satisfied
```

Current operation trace:

```text
PRJ-01 browse disclosed Projects
PRJ-03 source-complete Project creation
PRJ-07 Inception from human intent + server-resolved source/context
PRJ-23 durable exact candidate Baseline review/re-entry
PRJ-08 current approved Baseline read
PRJ-09 exact candidate digest approval
```

Compact journey shorthand used by this block:

```text
PRJ-03 → PRJ-07 → PRJ-23 / PRJ-08 → PRJ-09
```

## 2. Authority facts that constrain structure

The current `ProjectSummary` carries exactly:

```text
ProjectSummary = projectId + workspaceId + name + archived
```

Therefore W-01 has no authority to decorate the collection with release state, recent activity, framework/runtime, setup progress, source provider, ownership metadata or other inferred metadata. A card is presentation only; it does not create a richer Project summary model.

Current creation truth is closed:

```text
sourceBootstrap.mode = NEW | EXISTING_GIT
EXISTING_GIT → repositoryLocator
```

Current Inception truth is closed:

```text
intent = required non-blank human input
source choice = already admitted / server-resolved
```

Current Baseline truth is closed:

```text
candidate = exact unapproved ProjectBaselineCandidate
approved  = exact current ApprovedBaseline
candidateBaselineDigest != approved baselineDigest by semantic role
```

The browser may use the exact candidate digest as `URL_NAVIGATION` so refresh/re-entry can resolve `PRJ-23`; browser state never becomes candidate authority.

## 3. Bounded reference + human Evidence

Current official product references were reviewed only for the same human task: locating Projects and starting a new Project from new/existing source. They support keeping source establishment inside a focused creation path rather than turning the Projects collection into an onboarding surface. They do not authorize Conexus metadata.

The stronger current structural Evidence is the operator revision:

```text
earlier GF-01 fixture presentation = simple Project cards/grid
operator preference                = preserve that simpler Project recognition model
truth boundary                     = PRJ-01 name + archived only
```

The operator revision is a presentation preference, not Product authority. Therefore the Global-Maximum/YAGNI response is the smallest card that improves recognition without adding filler fields.

## 4. Project collection hypotheses

### H2 — simple Project cards/grid — **LEADING / CANDIDATE**

```text
cards/grid = LEADING / CANDIDATE
```

Structure:

```text
Projects heading + Create Project
local name filter
All | Active | Archived local view filter

┌──────────────────────────┐  ┌──────────────────────────┐
│ Project name      Active │  │ Project name    Archived │
│                     Open │  │                     Open │
└──────────────────────────┘  └──────────────────────────┘
```

Why leading after operator revision:
- matches direct operator recognition preference from the earlier GF-01 fixture;
- gives each Project a simple spatial target without implying a richer comparison model;
- remains fully truthful with sparse `ProjectSummary` authority because each card contains only name, derived Active/Archived presentation and navigation;
- keeps `Create Project` visually distinct from browsing existing Projects;
- allows two-column desktop scanning and one-column narrow reflow without horizontal scrolling;
- YAGNI forbids adding secondary card content merely to fill space.

Local name/archive filtering remains `LOCAL_UI` over the already-disclosed `PRJ-01` result. It is not Product/global search.

### H1 — compact structured Project list

```text
structured list = REJECTED AS LEADING
```

The list remains authority-safe and scale-efficient, but direct operator Evidence prefers the simpler card recognition model for the current Product experience. It remains a bounded fallback if later real scale/scan Evidence falsifies the card representation; it is not the current W-01 candidate.

### H3 — dense Project table

```text
dense table = REJECTED AS LEADING
```

Only `name` and `archived` are materially displayable now. Column/header chrome would imply a comparison model richer than current authority and carries greater responsive cost for no information gain.

## 5. Create / Inception / Baseline composition hypotheses

### C1 — focused create → Project Inception → exact Baseline review — **LEADING / CANDIDATE**

```text
Workspace / Projects
→ focused Create Project surface
   name
   source: NEW | EXISTING_GIT
   EXISTING_GIT → repositoryLocator
→ PRJ-03 success
→ exact Project / Inception
   intent
→ PRJ-07
→ exact candidate Baseline surface
   candidate digest
   source revision
   readable source
   runtime profile
   current approved Baseline when available
→ PRJ-23 on refresh/re-entry
→ PRJ-09 approve exact candidate
```

A second investigation is expressed as navigation back to Inception and another `PRJ-07`; W-01 does **not** invent `RejectProjectBaselineCandidate`.

Why leading:
- Workspace browse, Project creation and Project-owned Inception remain distinct mental contexts;
- long-lived candidate review receives a durable URL identity rather than modal/browser cache custody;
- exact candidate and exact approved truth can be visually distinguished without overloading `PRJ-08`;
- recoverable errors have enough space for meaningful next action;
- each step traces directly to accepted owner/wire authority.

### C2 — one long modal/drawer for create + Inception + approval

**REJECTED AS LEADING.** It compresses a durable journey into transient overlay state, makes refresh/re-entry and recovery fragile, and pressures the client to own progression state.

### C3 — inline Inception inside Workspace Projects collection

**REJECTED AS LEADING.** It mixes Workspace browsing with Project-owned semantic investigation and makes the collection responsible for one selected Project's Inception lifecycle.

### C4 — Project card shows setup/progress/release/activity metadata

**REJECTED.** No current `PRJ-01` truth exposes those fields. A card must not manufacture backend truth from frontend presentation preference.

## 6. Authority-feasibility recheck

| Material interaction | Class | Exact authority | State ownership |
| --- | --- | --- | --- |
| load Projects | `PRODUCT_READ` | `PRJ-01` | `SERVER` projection/cache only |
| local name/archive filtering | `LOCAL_UI` | no Product operation | `EPHEMERAL_UI` |
| open Project | `NAVIGATION` | exact disclosed projectId reference | `URL_NAVIGATION` |
| start Create Project | `NAVIGATION` / form | no Product operation until submit | `FORM_DRAFT` |
| create NEW / EXISTING_GIT Project | `PRODUCT_COMMAND` | `PRJ-03` | committed truth = `SERVER`; draft fields = `FORM_DRAFT` |
| state Inception intent | form | no Product operation until submit | `FORM_DRAFT` |
| run Inception | `PRODUCT_COMMAND` / proof | `PRJ-07` | result = `SERVER` |
| open candidate by digest | `NAVIGATION` + `PRODUCT_READ` | `PRJ-23` | digest = `URL_NAVIGATION`; candidate = `SERVER` |
| read current approved Baseline | `PRODUCT_READ` | `PRJ-08` | `SERVER` |
| approve candidate | `PRODUCT_COMMAND` / decision | `PRJ-09` | `SERVER`; client never marks approved optimistically |
| run another investigation | `NAVIGATION` then `PRJ-07` | no candidate reject command | URL/form state only |

Material negative laws survive:

```text
hidden/disabled != authorization
browser candidate cache != Baseline authority
CreateProject failure -X-> half-created Project success
Project card -X-> fabricated setup/release/activity/framework truth
local filter -X-> global Product search
candidate review -X-> candidate CRUD/workflow
```

## 7. Responsive / accessibility hypothesis

The locked GF-01 single rail remains unchanged.

- desktop: simple card grid uses two columns at the current W-01 content width;
- narrow viewport: cards reflow to one column, preserving name → state → Open reading/action order;
- card content is not click-only: each Project retains an explicit `Open` button;
- filters remain labeled local controls;
- create/source mode uses radio controls; conditional locator receives an explicit label;
- Inception `intent` is a labeled textarea;
- candidate/approved Baselines use headings and labeled definition rows rather than color-only distinction;
- rail/drawer behavior remains inherited from locked GF-01.

## 8. Current decision boundary

```text
H2 simple cards/grid = LEADING / CANDIDATE
H1 structured list   = REJECTED AS LEADING
H3 dense table       = REJECTED AS LEADING
C1 Journey-B         = LEADING / CANDIDATE
operator LOCKED      = NOT YET
```

Next proof is the bounded HTML/CSS low-fidelity P8 artifact with only the Projects collection representation revised. Only operator visual adjudication may set W-01 `LOCKED`.
