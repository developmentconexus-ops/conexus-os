# 0012. The application check as typed files the Hub delivers

**Date**: 2026-10-04
**Status**: Approved (approved by the operator on 2026-10-04)
**Lane**: `lane:shaped`
**Depends on**: spec 0011 (S2). The build starts on `main` after 0011 merges, because both change
`run/checkout.ts` and the check invocation.

References to "the spike" name a local, unmerged branch (`spike/app-check-files`, commit `e5aa5f6c`,
based on `d449a339`) that built an earlier version of this design and measured it on E2B. It is a
reference, not a base: the build starts from `main`, and this spec corrects the spike where they
differ (bundle at build time, one file with the Sankhya helper inside, a directory per bundle hash,
`tsc` as the agent's user with a lent cache, a stricter report).

## Summary

The check that decides whether the Builder's code becomes a Preview (generate, typecheck, build,
server bundle, boot) is today a 460 line JavaScript program kept as a string inside
`application-check.ts`, plus a 200 line server build string, written into the VM on every run. No
tool reads that code, which is how a call to an undefined `Failure` reached `main`. After this spec
the check is ordinary TypeScript under `apps/hub/src/builder/check/`, bundled into one file when the
Hub is built, identified by the sha256 of that file, installed in each VM only when that hash is not
there yet, and parsed by the Hub with the same schema the check writes. The image and the template pin
do not change. Repeat checks get faster through an incremental `tsc` cache the agent cannot forge.

## Requirements

**User stories**:
- As the Hub, I want the admission check to be code the compiler and the import law read, so that a
  defect in the gate is a build error, not a production surprise.
- As a person building an app, I want the second and later checks of a conversation to be faster, so
  that the Builder finishes sooner.
- As the platform, I want the agent to be unable to change, impersonate or mislead the check, and the
  check to read nothing the agent cannot read, so that admission stays the Hub's decision and no root
  only file leaks to the agent.

**Acceptance criteria**:
- **AC-1**: The check and the server build are TypeScript modules under `apps/hub/src/builder/check/`,
  read by `typecheck:hub`, Biome, knip and the import law. `checkScriptSource`,
  `serverBuildScriptSource`, `application-server-build.ts` and the per run heredoc install are
  deleted. No file under `apps/hub/src/builder/` embeds the check's own program text in a string or a function's
  `.toString()`. A page-evaluated snippet sent to the browser over the DevTools protocol is an
  argument of that protocol, not the check's code, and is outside this rule.
- **AC-2**: The check and the Hub import one report module. The Hub parses each report with it and
  refuses with `APPLICATION_CHECK_UNREADABLE` any report that does not have exactly the five steps in
  order, has a step after a blocking failure that is not `skipped: AFTER_BLOCKING_FAILURE`, has `ok`
  different from "every blocking step passed", has an artifact when not ok or none when ok, or has a
  manifest with a duplicate or unsafe path.
- **AC-3**: One bundle file, `main.mjs`, holds the whole check including the Sankhya helper source. It
  is produced when the Hub is built, and its sha256 is the check's identity. The Hub, CI and the tests
  use the same bytes.
- **AC-4**: At run start the Hub installs the bundle at `/opt/conexus/check/<sha256>/main.mjs` only if
  that directory does not exist: it writes to a temporary directory, verifies the hash, and renames the
  directory into place, owned by root, read only. A later run with the same Hub writes nothing. A Hub
  with another bundle installs a second directory and never touches the first, so a check already
  running finishes on its own bytes. Two installs at once end with one correct directory.
- **AC-5**: The Hub always runs the check by its own hash's path. The report carries the sha256 of the
  running file; a different value is refused with the new row `BUILDER_CHECK_IDENTITY_MISMATCH`, and
  nothing is admitted.
- **AC-6**: The files the Hub collects match the report's manifest one to one (same set of paths, same
  size, same sha256, no extra and no missing file); any difference is refused and nothing is admitted.
- **AC-7**: As the agent's user (uid 1500), every write, replace, rename, chmod, symlink and delete
  under `/opt/conexus/check` and under the gate's cache store is refused, and files the agent plants in
  its tree never run as root (a sentinel file is never created).
- **AC-8**: `tsc` runs as the agent's user for both callers. An import in the agent's code that points
  at a file only root can read (for example a file under `/root`) yields an error that does not contain
  that file's content.
- **AC-9**: The gate's typecheck uses a cache only root keeps: before `tsc` starts, root ends every
  process of the agent's user and lends a copy of the cache to `tsc`; after `tsc` ends, root ends every
  process of the agent's user again and stores the updated copy back. A build info file the agent
  forged before the gate cannot hide a type error from the gate. The agent's own `conexus_check` uses a
  separate cache in the agent's home, which never decides admission.
- **AC-10**: Caches are keyed by bundle hash, caller (`gate` or `tool`) and project (`app` or
  `server`); a lock file per key means two checks never write one cache at the same time.
- **AC-11**: The six reference apps give the same verdicts as today's check, asserted on the literal
  step statuses, codes, problems and skip reasons (durations, hashes and thumbnail bytes are checked
  for presence and shape, not value): a good app passes all steps and yields its files and a
  thumbnail; a type error fails `typecheck` with `file:line` problems and skips the rest; a blank page
  fails boot with `BOOT_NO_ROOT_CHILD`; a page that throws fails boot with `BOOT_UNCAUGHT_ERROR`; a
  missing browser and a browser that refuses its DevTools connection skip boot with
  `BOOT_BROWSER_UNAVAILABLE`, and the check exits 0.
- **AC-12**: A child backed step past its limit ends `STEP_TIMEOUT` and its process group is killed.
  The whole check is bounded by the Hub's command timeout (`CHECK_COMMAND_TIMEOUT_MS`), which covers
  `generate` and the report writing.
- **AC-13**: `conexus_run_operation` builds the server half with the same bundle (its `server`
  command). There is one server build implementation.
- **AC-14**: The report has no `facts` field. The check accepts no option without a production caller,
  except `--limit`, which may only shorten a step's limit.
- **AC-15**: Measured on E2B with the gate caller, seven interleaved pairs against today's check on
  the good reference app, the bundle already installed: the first check's p50 is no more than 5%
  slower, and a check after a one line edit to `app/` is at least 20% faster. The install time on a new
  VM is measured and reported separately.
- **AC-16**: A real Hub with E2B runs a Builder turn whose gate uses the bundle, retains the artifact
  under the current template pin, and serves a Preview whose files are the bytes the gate collected.
- **AC-17**: The production E2B template recipe, `CURRENT_TEMPLATE_PIN` and the configured template
  id are unchanged.

## Decision

**Chosen option**: Option 1: typed files in the Hub, bundled at build time, installed per bundle hash
(see [rationale.md](rationale.md)).

**Implementation skills**: `conexus-development` (`.agents/skills/conexus-development/`)

## Rationale

See [rationale.md](rationale.md).

## Feature design

### 1. Where things live

```
repository
  apps/hub/src/builder/check/          the check's source (section 2)
  apps/hub/src/builder/check-delivery.ts   install and identity on the Hub side
  scripts/build-app-check.mjs          bundles check/main.ts into one file
Hub build output
  <hub build dir>/app-check/main.mjs   the bundle; its sha256 is computed when the Hub starts
E2B VM
  /opt/conexus/check/<sha256>/main.mjs           one directory per bundle, root, read only
  /var/lib/conexus-check-cache/<sha256>/gate/<app|server>/   the gate's cache store, root only
  /home/conexus-agent/.conexus-check-cache/<sha256>/tool/<app|server>/   the agent tool's cache
```

`scripts/build-app-check.mjs` runs as part of the Hub build (`scripts/build-hub-local.mjs` and the
pilot build) and before the test groups that need it. It bundles with `rolldown`, added to the root
`devDependencies` at the version the compiler template pins (1.2.6), and imports the Sankhya helper
source (`apps/hub/src/builder/handler-kit/sankhya.ts`) as text into the bundle, so the bundle is the
only file. The Hub finds the bundle relative to its own module (`import.meta.dirname`), never through
`process.cwd()`. A Hub that starts without the bundle fails at boot (configuration failure), not at the
first check.

### 2. The check's files

```
check/
  report.ts        step ids, STEP_BLOCKS, failure and skip codes, the report schema and its rules
  command.ts       the command line as a union, parsed once
  steps.ts         the step table in order: id, limit, run
  run.ts           walks the table, stops at the first blocking failure, marks the rest skipped
  main.ts          parses the command, runs it, prints one JSON line
  exec.ts          one child: own process group, fixed environment, identity, wall clock
  agent.ts         ends every process of the agent's user (used around each child and the cache lend)
  cache.ts         lend and store back the gate's cache; the lock per key
  outcome.ts       a step's result inside the check
  problems.ts      tool output to file:line problems; the one redactor
  artifact.ts      the manifest of output files with their sha256
  steps/generate.ts  steps/typecheck.ts  steps/build.ts  steps/server-bundle.ts  steps/boot.ts
```

`application-check.ts` keeps only the Hub side: the command it runs, `readCheckReport`, and the
predicates the gate uses (`refusingStep`, `unrenderedBootStep`). Manifest admission, the app failures
source, the Preview CSP and the app path classifier are imported as ordinary modules and bundled.

### 3. Key types

```ts
// report.ts
export const STEP_IDS = ['generate', 'typecheck', 'build', 'server', 'boot'] as const
export type StepId = (typeof STEP_IDS)[number]
export const STEP_BLOCKS = { generate: true, typecheck: true, build: true, server: true, boot: false } as const satisfies Record<StepId, boolean>

type StepResult =
  | Readonly<{ step: StepId; status: 'passed'; durationMs: number }>
  | Readonly<{ step: StepId; status: 'failed'; code: CheckFailureCode; durationMs: number; problems: readonly Problem[]; dropped?: number }>
  | Readonly<{ step: StepId; status: 'skipped'; code: CheckSkipCode; reason: string }>

type CheckReport = Readonly<{ ok: boolean; checkSha256: string; steps: readonly StepResult[]; artifact: ArtifactManifest | null }>
type ArtifactManifest = Readonly<{ templateRef: string; files: readonly Readonly<{ path: string; bytes: number; sha256: string }>[] }>

// command.ts
type Caller = 'gate' | 'tool'
type Command =
  | Readonly<{ kind: 'CHECK'; caller: Caller; root: string; out: string; thumbnail: string | null; templateRef: string; agent: Identity; limits: StepLimits }>
  | Readonly<{ kind: 'SERVER'; root: string; out: string }>
  | Readonly<{ kind: 'WORKER'; worker: 'build' | 'server' | 'boot'; root: string; out: string }>
type Identity = Readonly<{ uid: number; gid: number }>
```

- Durations are finite and not negative; `problems` holds at most 50 entries, `dropped` counts the
  rest; manifest paths are relative, without `..`, unique.
- `--template-ref` is required for `CHECK`; there is no environment fallback.
- Removed from today's shape: `facts`, the nested `artifact.checkSha256`, the check's own second parse
  of its report (the Hub's parse is the boundary).

### 4. The flow

**Install (run start, `installRunTools` in `run/checkout.ts`).** The Hub asks, as root, whether
`/opt/conexus/check/<sha256>/main.mjs` exists with that hash. If yes, nothing is written. If not, it
writes the bundle into `/opt/conexus/check/.tmp-<random>/`, checks the hash there, renames the
directory to `<sha256>/` (a rename that loses to an existing directory removes its temporary copy and
counts as installed), and sets root ownership and read only modes. Failure is
`BUILDER_CHECK_INSTALL_REFUSED`. The install keeps S2's `RunVm.onIncarnation` guard: a VM replaced
under the run is installed again.

**Run.** The gate (`run/judge.ts`, as root) and the agent tool (`conexus_check` in `run/run.ts`, as
uid 1500) both call `RunSandbox.runCheck`, which runs
`node /opt/conexus/check/<sha256>/main.mjs check --caller <gate|tool> ...`. The operation tool calls
`main.mjs server <root> <out>` through `buildCandidateServer`.

**Steps.**

| Step | Runs as | Notes |
| --- | --- | --- |
| generate | the caller (root for the gate) | file writes from the admitted manifest, in process |
| typecheck | uid 1500, `tsc --incremental` child | gate: lent cache (below); tool: its own cache |
| build, server, boot | uid 1500 | they execute agent code |

**The gate's lent cache.** Under the lock for its key: root ends every uid 1500 process; copies the
store into a fresh directory owned by uid 1500; runs `tsc` with `--tsBuildInfoFile` there; when `tsc`
ends, ends every uid 1500 process again; copies the build info back into the store, owned by root.
Nothing of the agent's user runs between the copy out and the copy back except `tsc`. The tool caller
skips the lend and points `tsc` at its own cache in the agent's home.

**The Hub reads the result, in this order.**

| Check | Failure |
| --- | --- |
| no JSON line on stdout | `APPLICATION_CHECK_REPORT_UNREADABLE` |
| the schema or a report rule refuses it | `APPLICATION_CHECK_UNREADABLE` |
| `checkSha256` differs from the Hub's bundle | `BUILDER_CHECK_IDENTITY_MISMATCH` (new) |
| the collected files differ from the manifest | `APPLICATION_CHECK_UNREADABLE` |
| a blocking step failed | `BUILDER_CHECK_FAILED` (the agent's code) |

### 5. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| Hub start | bundle bytes and sha256 | `<hub build dir>/app-check/main.mjs`, hashed once at start |
| install | target directory | `/opt/conexus/check/<sha256>/` |
| check | `checkSha256` in the report | sha256 of the running `main.mjs` |
| check | `templateRef` in the manifest | `--template-ref`, from `CURRENT_TEMPLATE_PIN.templateRef` |
| check | caller | `--caller`, set by the Hub's call site (gate or tool) |
| typecheck | cache key | bundle sha256, caller, project |
| identity check | expected hash | the Hub's bundle sha256 |
| admission | file bytes and hashes | collected by the Hub, compared one to one with the manifest |

### 6. Failure table

New row: `BUILDER_CHECK_IDENTITY_MISMATCH`, category `SYSTEM`, status 500, audience `person`, message
"O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.", action `NONE`.
Kept as they are: `APPLICATION_CHECK_REPORT_UNREADABLE`, `APPLICATION_CHECK_UNREADABLE`,
`BUILDER_CHECK_INSTALL_REFUSED`, `BUILDER_CHECK_FAILED` and the compiler rows.

### 7. Tests

- `builder-application-check.browser.test.mjs` runs the built bundle against the real compiler and
  Chromium for the six reference apps (AC-11), a step timeout (AC-12), the root only import (AC-8),
  and a forged gate cache (AC-9).
- A report module test: valid reports to literal values; each malformed shape in AC-2 refused.
- Runtime tests: install on a new VM, no write on a second run, a second bundle beside the first, two
  concurrent installs (AC-4); identity mismatch (AC-5); manifest mismatch both ways (AC-6); the server
  half through `server` (AC-13); a Hub started without the bundle fails at boot (AC-3).
- The manual E2B test runs AC-7 to AC-11 and the AC-15 pairs; the live harness proves AC-16. Each E2B
  run is recorded and its sandbox killed.

**Key invariants**:
- Only root writes under `/opt/conexus/check` and the gate's cache store; installed bundles are never
  modified or replaced.
- `tsc` and every step that reads or executes agent code run as uid 1500.
- An artifact exists exactly when the report is ok, and every collected file matches the manifest.
- One bundle, one server build, one redactor, one report schema.

**Security model**: the Hub places and identifies the check; the agent's code and everything that
reads it run as uid 1500; the gate's cache is only ever written by root.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: a good app passes through the installed bundle and becomes a Preview with the same
  bytes, verifies **AC-11**, **AC-16**.
- Failure: a report with a foreign hash, or a collected file the manifest lacks, admits nothing,
  verifies **AC-5**, **AC-6**.
- Attack: uid 1500 tries to replace the check, forge the gate cache, or read a root only file through
  an import, verifies **AC-7**, **AC-8**, **AC-9**.

## Build plan

1. The bundle and the contract: `check/` modules with the types above, `scripts/build-app-check.mjs`
   with the Sankhya helper inside, the Hub finding the bundle at start, the strict report schema and
   its tests, the new failure row. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-14**.
2. Delivery and reading: per hash install from `installRunTools`, the run by hash path for gate and
   tool, the Hub's reading order, the one to one manifest comparison; delete the two strings, the
   server build file and the heredoc; port the browser and runtime tests. Satisfies **AC-4**,
   **AC-5**, **AC-6**, **AC-11**, **AC-12**.
3. `conexus_run_operation` through the bundle's `server` command. Satisfies **AC-13**.
4. Typecheck as uid 1500 with the gate's lent cache, the tool cache and the locks. Satisfies
   **AC-8**, **AC-9**, **AC-10**.
5. E2B proofs: attacks, the six apps, timing pairs; then the live Hub run to a Preview. Satisfies
   **AC-7**, **AC-15**, **AC-16**, **AC-17**.

## Consequences

**Positive**:
- The admission gate is compiled, linted and tested code; the class of defect that reached `main`
  through the string cannot recur.
- One bundle, one report contract, one server build, one redactor.
- Repeat gate checks about 30% faster in the spike (4.9 s against 7.1 s p50).
- No image rebuild to change the check; its identity is the bundle's hash.
- `tsc` no longer reads as root.

**Negative / tradeoffs**:
- About 300 more lines than today's strings, spent on types, schemas at process boundaries, the
  install and the cache lend.
- A new build step for the Hub (the bundle) and a new dev dependency (`rolldown`).
- The first check on a new VM pays one install (one write of about 100 KB).

**Neutral**:
- `conexus_run_operation` still builds the server half on each call (about 0.24 s), now through the
  same code as the check.
- Old bundle directories stay in a VM until the VM ends.

## Migration plan

**Strategy**: direct replace in one pull request; no data migration.
**Phases**: one deploy. A VM first used by the old Hub gets the new bundle directory at its next run
start; the old Hub's `/opt/conexus/check.mjs` stays unused until the VM ends.
**Rollback**: revert the pull request; the old Hub installs its strings again at its next run start.
**Risks**: the lent cache adds two process sweeps per gate check; the timing pairs (AC-15) measure it.

## Follow-up

- [ ] Egress logging is out of this spec; it is replaced by E2B's native egress control in scope item
  26, phase 2.
- [ ] "Publish = promote the checked artifact" is a Q5 hypothesis: published data needs its own
  allocation first (see rationale.md).
