# Repository consolidation — current verification and working rules

## Outcome and boundary

A developer can change Conexus, run useful checks and continue the internal MVP
without reopening R1–R7 or L1–L6. Keep checks that catch current defects; remove
historical admission, filename conventions and review ceremony from the default
path. This is not a Product rewrite or permission to bypass credentials, data
integrity, source identity or external-effect boundaries.

Status and execution authority belong to [roadmap](../roadmap.md#current-grant).
The operator approved this design and its local method amendment on 2026-09-12.
Execution results below distinguish changed checks from demonstrated behavior.
It supersedes the earlier proposal in this file, recoverable in Git at
`21f042f551404fcf0af21252796718302b4af208`. That proposal preserved universal
historical gates and deferred method changes; this design addresses both.
No bulk document deletion is required.

## Evidence and limits

Inspection on 2026-09-12 used the clean analysis branch at that SHA:

- The default graph has 72 leaves. Snapshot verification stopped in A0 on a
  historical whole-lockfile digest; later leaves did not run. The separate
  R1C-14 command failed on recorded review arguments after a prompt-text change.
  Neither establishes a runtime defect. See
  [snapshot verification](builder-first-app.md#analysis-snapshot-verification).
- Current-state checking enforces historical progression and refuses ordinary
  dirty development trees. Hygiene bans words, document names and working-file
  layouts unrelated to application behavior.
- Biome already disables formatting and assists. Its read-only check of
  `apps/hub/src` and `apps/web/src` passed: 110 files in 91 ms. Keep it.
- `generate-r1-s3-git-identity.mjs --check` failed. Rendered output differed
  only in `manifestSha256` and `nativeReceiptSha256`; executable and image
  fields were unchanged. This identifies provenance coupling, not proof that
  the Git runtime works. Trace actual consumers before separating these fields.

No app journey, live provider or database experiment was executed for this
design. Historical receipts retain their original subjects and limits.

## Selected design

Keep one current graph in `scripts/conexus-verify.mjs`. Developers and CI run
`npm run verify`; ordinary tracked and untracked development edits are allowed.
Existing focused commands remain useful. Verification checks generated output
without repairing it silently. CI retains clean installation, PostgreSQL,
Chromium and its final clean-checkout assertion.

Historical commands remain explicitly callable against their recorded subjects,
not default MVP gates. Never refresh old receipts to make today's checkout
appear previously qualified.

Architect/arena compared this with static-only and affected-path local graphs.
Both candidates chose one graph, accepting its cost instead of another selection
policy. Use candidate A's complete assertion-level cut, candidate B's check-only
generation rule, and the subsequent Git-provenance finding. The Luna comparison
preferred B's presentation but scored A's coverage higher; the final choice
favors its explicit method and mixed-test treatment. This was design comparison,
not independent runtime acceptance. Future subagents use Luna, high or xhigh,
as instructed by the operator.

## Exact change map

Paths are repository-relative. Historical names alone never justify removing
an active behavior test. Preserve anything not selected below.

| Target | Change | Preserve |
| --- | --- | --- |
| `scripts/conexus-verify.mjs`, `package.json` | Remove default `r1c14-native`, `r1-rc01-custody`, `r1-rc01-walkthrough`, `4f-project-cognition-admission`. Split mixed A0/G0 admission. Replace the extended repository bundle with current checks. Historical commands stay explicit; no second aggregate graph. | Current types/build, HTTP, auth, workspace/project, Brain, Connections, Builder, source custody, Preview, database/browser checks; failure propagation and environment requirements |
| `tests/implementation/r1-a0-admission.test.mjs` | Separate the entire first historical manifest/dependency/protocol test, not just its lock digest. | Strict configuration checks and the consumed `openid-client` waiver with its negative control |
| `tests/implementation/r1-g0-profile-compiler.test.mjs` and npm callers | Separate historical exact-root-dependency assertions; do not accumulate test-name exclusions. | Current profile compiler behavior and dependency requirements |
| `scripts/check-current-state.mjs` | Remove phase/C-018 progression and local dirty-tree refusal, including reliance on `CONEXUS_ALLOW_DIRTY_WORKTREE`. Cover conflict markers in relevant staged/unstaged changes too. | Repository identity, private package, conflicts and unsafe-workflow checks |
| `scripts/check-repository-hygiene.mjs` | Remove legacy-word scans, superseded-name lists and handoff/dialogue/round/docs-superpowers bans. Ordinary local `docs/work` is allowed. Review-envelope rules require an explicit consumer. | Useful candidate discovery and objective properties, not replacement naming ceremony |
| `scripts/check-architecture-verification.mjs` | Remove historical progression/closure assertions; historical routing/text equality becomes explicit audit work. | Current owner/dependency/data/FK coherence where a real owning contract requires it; no runtime claim from document checks |
| `scripts/check-doc-index.mjs`, `biome.json`, active wire checks | Keep links, reachability and current lint. Remove future-only assertions only after identifying their absent current consumer. | Broken-link detection and active API/code checks |
| `scripts/check-qualification-provenance.mjs`, native-readmission and RC-01 scripts | Keep explicit historical routes outside the default graph. | Original evidence bytes and named-subject verification |
| `scripts/generate-r1-s3-git-identity.mjs` and identified consumers | Trace direct/indirect consumers, then separate operational identity from historical report provenance. | Executable/image protection and explicit historical custody; no blanket hash deletion |
| `.github/workflows/verify.yml` | Continue the same current graph with existing install, database/browser, diff and clean-checkout checks. | No weaker or separately maintained CI definition |

Update the affected tests under `tests/repository/` alongside their checkers:
`conexus-verify.test.mjs`, `repository-contract.test.mjs`,
`architecture-verification.test.mjs`, `3o-closure-progression.test.mjs`,
`c018-ratification.test.mjs` and `conexus-preflight.test.mjs`.
Retire obsolete progression assertions, not useful behavior tests.
Do not replace them with requirements for new MVP headings.

## Entry documents and local method amendment

Update `AGENTS.md`, `README.md`, roadmap/index,
`scripts/conexus-preflight.mjs`, `docs/development/engineering-rules.md` and
the existing `.agents/skills/conexus-development/` routing. A new session should
recover the current increment and proof gap, not an old stage sequence. Remove
universal R1C-14 admission and special 4D continuation from the current path.
Preflight reports facts; it does not grant work.

The approved local amendments to
[Engineering Method](../development/engineering-method.md) and
[Repository Method](../development/repository-method.md) are:

- Remove independent reviews required merely because a stage closes. Keep
  review triggered by material architecture, trust/data/effect risk or a
  concrete disputed claim, without repeated review of mechanical steps.
- Plan the next observable increment, its real dependencies and proof. An
  approved increment includes routine reversible implementation; do not seek
  fresh approval for every file, command or checklist item.
- Historical custody applies when invoking that historical claim, not to
  unrelated development or publication of an explicitly unaccepted candidate.
- Retain real verification, truthful proof limits, preservation of others'
  work and consent for production effects, secrets exposure, destructive
  operations and merge. Simulation cannot close a real-user-journey claim.

These are local changes, not permission to rewrite shared skills or other
repositories. Refine the existing development skill, including Luna-only
delegation; add no parallel skill framework.

## Execution and proof

After approval, execute one bounded cleanup without another arena or approval
for each mechanical step:

1. Split mixed historical/current assertions and update the graph and tests.
   Trace generated Git identity consumers before changing that split.
2. Remove the selected phase, dirty-tree and filename gates. Update entrypoints
   and approved local method/skill routing in the same candidate. Historical
   documents remain discoverable, without competing current instructions.
3. In disposable fixtures, valid prose/filename changes and consistent
   dependency updates must not require new historical receipts. Broken links,
   conflicts and unsafe workflows must still fail.
4. Run retained current checks. Confirm failure for an actual type/build
   regression, generated operational-identity drift, Builder behavior failure
   and broken migration through the relevant entrypoints. Use disposable local
   data, never company data. Default verification must not call live models,
   E2B or Sankhya. Do not modify old evidence as test setup.
5. Run the applicable pinned-Linux CI path: install, browser setup, current
   verify, diff and generated-output checks. Record failures honestly and
   distinguish pre-existing defects from cleanup regressions instead of dropping
   their tests. Check fresh-session recovery of the MVP, next increment and
   proof limits without automatically resuming R3/L1.

Completion means the current graph no longer requires historical admission,
detects current defects, and agrees with the entry documents. It does not prove
the app works. Resume [the first-app task](builder-first-app.md) afterward and
demonstrate the missing real Builder → compiled app → browser journey before
expanding it. Residual historical files and identifiers do not block that return.

## Execution results — 2026-09-12

The approved cut is implemented in the local analysis branch, without a commit,
push or Product behavior change. The current graph has 70 leaves; the important
change is their claims, not the count. `npm test` delegates to `npm run verify`.
The workflow uses that same graph. Paid Builder/E2B experiment files are no
longer executed by the default graph, even when their live flags are inherited.

Historical A0/G0 pin assertions and architecture progression assertions remain
in separate test files for explicit audit. R1C-14/RC-01/provenance checks remain
available outside the default graph. Original receipt, contract, migration and
lockfile bytes were not refreshed. The generated Git identity retains every
operational image/executable pin; only unused report-provenance digests were
removed from it.

Completed local proof:

- Pinned Node/npm install and Chromium installation succeeded.
- Disposable PostgreSQL: four migration scenarios passed, covering installation,
  restart, upgrade, concurrent installation and incompatible-ledger refusal.
- Current repository fixtures accept dirty trees, working notes and historical
  prose, and refuse broken links, unsafe workflows, missing required files and
  conflicts in staged, unstaged, committed and untracked files, including CRLF.
- In isolated copies, an actual TypeScript error stopped the verification
  entrypoint; generated S2 drift failed without self-healing. Removing the
  injected faults restored those checks. Git identity controls refused
  operational drift while allowing unrelated historical report prose changes.
- A wrong source revision injected into the compiler implementation was caught
  by its existing behavior test (9 passed, 1 failed). Restoring the implementation
  returned all 10 tests to passing. This used a disposable copy and a controlled
  provider, not a live E2B or user Preview claim.
- A fresh Luna session recovered the current MVP and next action without
  resuming R3/L1, granting live execution or demanding reviews for mechanical
  steps. This is a routing check, not a broad evaluation of agent reliability.

The complete local `npm run verify` finished with exit 0: all 70 leaves passed
in about 17 minutes, including local database and browser checks. The final
33-test verification-tool bundle also passed after the review changes. The
Builder leaf changed during that full run to exclude paid live files; its final
command also passed separately (44 passed, two explicit OCI-only tests skipped).
No remote CI result is claimed. Cleanup is complete; resume first-app planning,
not Product implementation or live execution, from the current roadmap.
Source diff checking passed; historical evidence, contracts, runtime seeds and
the lockfile have no changes. The checkout intentionally remains dirty: CI's
clean-checkout assertion is not claimed for this local development tree.

Additional explicit S3 checking exposed two failures outside the changed
generator: `S3_NEW_SEED_BYTES_REFUSED:runtime/r1/generated/r1/operations.json`.
The frozen new-project seed and current operations differ. This is not fixed,
not a reason to regenerate historical receipts and not evidence of a working
first-app journey. The targeted operational Git checks passed (11 tests).

Review disposition: the reported CRLF conflict-marker bypass did not reproduce
in the actual CLI fixture. Duplicate declarations being collapsed by the
existing architecture set comparison predate this cleanup; strengthening that
document convention is not necessary for this cut and was not added as a new
gate. Neither observation is represented as a runtime proof.

## Analysis publication

After cleanup, the operator authorized committing and pushing the repository
changes to `analysis/internal-mvp-2026-09-12` for GPT Pro to inspect. This does
not authorize a PR, merge, Product implementation or live experiments. The
separate Registry draft remains unintegrated. Continue the shared analysis from
`docs/roadmap.md` and `docs/tasks/builder-first-app.md`, not historical R/L plans.
The complete verification above belongs to the cleanup run. Publication repeats
the affected repository checks and does not claim a new complete or remote CI run.
