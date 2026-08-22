# 4C W-01 — Reference Study and Structural Hypotheses

> **Status:** `CANDIDATE EVIDENCE / W-01 4C-6 → 4C-7F / NOT LOCKED`
> **Block:** `W-01` — Projects + source-complete create / Inception / candidate+approved Baseline
> **Inherited authority:** `GF-01 H1-R2 = LOCKED`; `4C-F02 = OPERATOR ACCEPTED / GREEN`.
> **Implementation authority:** none.

This record derives only the W-01 structural candidate after the Journey-B authority preflight was corrected and made GREEN. It does not add Product operations, Project metadata, backend state, SDK/runtime choices or final visual design.

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

Therefore W-01 has no authority to decorate the collection with release state, recent activity, framework/runtime, setup progress, source provider or other inferred metadata.

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

## 3. Bounded reference observations

Current official product references were reviewed only for the same human task: locating Projects and starting a new Project from new/existing source.

### Vercel

Observation:
- project creation starts from an explicit Add New / Project flow;
- importing/selecting a Git repository belongs to Project creation rather than a later generic source-settings CRUD flow.

Useful property for Conexus:
- source selection can be a creation concern without turning the Projects collection itself into an onboarding wizard.

Not copied:
- framework/deployment metadata, continuous provider-specific Git integration semantics and deployment-centric card content are not Conexus authority.

### Render

Observation:
- service/project creation connects/selects repository during the create path;
- workspace/dashboard browsing remains a separate context from the focused create form.

Useful property for Conexus:
- keep Workspace browse stable while moving source-establishment complexity into a focused creation flow.

Not copied:
- service type, deploy branch/runtime/environment fields are not admitted W-01 Product meaning.

### Replit

Observation:
- an entry path may begin from a blank/new project or imported existing code.

Useful property for Conexus:
- presenting the two source-bootstrap modes as a first-class choice is recognizable.

Not copied:
- provider-specific import mechanics or editor-first experience.

Reference products are Evidence only. Current Conexus Product/wire authority decides the actual fields, sequence and semantics.

## 4. Project collection hypotheses

### H1 — compact structured Project list — **LEADING / CANDIDATE**

Structure:

```text
Projects heading + Create Project
local name filter
All | Active | Archived local view filter
────────────────────────────────────
Project name                    state   Open
Project name                    state   Open
...
```

Why leading:
- truthful with the sparse `ProjectSummary` authority;
- fast vertical scanning as Project count grows;
- name and archive state remain legible without decorative empty space;
- compact action affordance preserves Projects as the primary Workspace work entry;
- responsive collapse is straightforward;
- does not pressure the Product into inventing richer collection metadata just to fill a visual container.

Local filtering is `LOCAL_UI` over the already-disclosed `PRJ-01` result. It is not Product/global search.

### H2 — Project card grid

Disposition:

```text
cards/grid = REJECTED AS LEADING
```

Reason:
- the current summary has too little meaningful metadata to justify a rich card;
- cards would be mostly empty presentation chrome or tempt invented fields;
- vertical scanning/comparison degrades as the Workspace grows;
- the card representation visible in GF-01 was explicitly fixture-only and was never locked as W-01 collection authority.

Reopen only if future accepted collection truth supplies genuinely useful repeated metadata and real human evidence shows card recognition is superior.

### H3 — dense Project table

Disposition:

```text
dense table = REJECTED AS LEADING
```

Reason:
- only `name` and `archived` are materially displayable now;
- column/header chrome would imply a comparison model richer than current authority;
- responsive cost is higher than the compact structured list for no current information gain.

Reopen if a future accepted Project collection exposes several genuinely comparable fields and scale makes columnar comparison materially useful.

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

**REJECTED AS LEADING.** It compresses a durable multi-owner-state journey into transient overlay state, makes refresh/re-entry and error recovery fragile, and would pressure the client to own progression state.

### C3 — inline Inception inside Workspace Projects collection

**REJECTED AS LEADING.** It mixes Workspace browsing with Project-owned semantic investigation and makes the collection responsible for one selected Project's Inception lifecycle.

### C4 — Project row shows setup/progress state and resumes onboarding

**REJECTED.** No current `PRJ-01` truth exposes such a state. Adding a badge would manufacture backend truth from frontend desire.

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
Project row -X-> fabricated setup/release/activity truth
local filter -X-> global Product search
candidate review -X-> candidate CRUD/workflow
```

## 7. Responsive / accessibility hypothesis

The locked GF-01 single rail remains unchanged.

- desktop: structured list uses one primary vertical reading/scanning line;
- narrow viewport: status and action wrap below the Project name without horizontal table scrolling;
- create/source mode uses radio controls; conditional locator receives an explicit label;
- Inception `intent` is a labeled textarea;
- candidate/approved Baselines use headings and labeled definition rows rather than color-only distinction;
- modal-only progression is avoided, so focus/re-entry is ordinary document/navigation behavior;
- rail/drawer behavior remains inherited from locked GF-01.

## 8. Current decision boundary

```text
H1 structured list = LEADING / CANDIDATE
C1 focused create→Inception→Baseline = LEADING / CANDIDATE
operator LOCKED = NOT YET
```

Next proof is a bounded HTML/CSS low-fidelity P8 artifact. Only operator visual adjudication may set W-01 `LOCKED`.