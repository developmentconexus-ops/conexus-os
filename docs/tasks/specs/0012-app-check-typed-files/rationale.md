# 0012. Rationale

## Context

The finish gate admits the Builder's source only after a check run inside the E2B VM: generate the
typed client, typecheck, build the screens, bundle the server half, and boot the page in headless
Chromium. That check is `checkScriptSource()` in `application-check.ts`: a `String.raw` template of
about 460 lines into which the Hub splices its own functions with `.toString()` and its constants with
`JSON.stringify`, written into the VM by a root heredoc at every run start, next to a second string
for the server build (`application-server-build.ts`). The boot step speaks the DevTools protocol by
hand over a WebSocket.

Because the program is a string, no compiler, linter or import rule reads it. A refused DevTools
connection called `new Failure(...)`, which does not exist inside the script; it surfaced as a crash
of the whole check and was fixed during S2. The report format is defined twice, as a zod schema in the
Hub and by hand inside the string. The template image already carries the compiler and Chromium, but
the check arrives from outside on every run.

A Vite dev server for the Preview was studied and set aside: the build costs about 1.2 s of a check of
about 7 s against an agent turn of 47 s p50; a dev server would need an authenticated proxy in front of
an E2B port, a VM kept alive while someone watches, and would drop the boot proof and the immutable
artifact. The Preview stays a checked, immutable artifact.

## Options considered

### Option 1: typed files in the Hub, delivered once per VM

The check becomes TypeScript under `apps/hub/src/builder/check/`, compiled with the Hub, bundled into
one `main.mjs`, installed root owned on first use in each VM and identified by its sha256.

**Pros**:
- The compiler, Biome, knip and the import law read the gate.
- One report schema shared by both sides; no second copy.
- No image rebuild; the check version is the Hub version, one authority.
- Proven end to end in the spike: a real Hub ran a turn, retained the artifact under the current pin
  and served the Preview.
- Spike timing (seven pairs on one sandbox): first check 7.0 s against 7.3 s today, check after an
  edit 4.9 s against 7.1 s.

**Cons**:
- About 1,160 lines in the spike against 779 today; about 1,075 after the cuts listed in index.md.

### Option 2: a package baked into the E2B image, with Playwright

A separate package with its own `lib/`, built into the template image at `/opt/conexus/check`, boot
through `playwright-core` against the image's Chromium.

**Pros**:
- Same type and schema gains; Playwright replaces the hand written protocol.

**Cons**:
- Slower: first check 8.6 s against 7.8 s today in its paired run; Playwright's launch cost about
  0.7 s on boot, and its boot file was no shorter (173 against 171 lines).
- A second version authority (the image) next to the Hub, unlinked from the configured template id.
- Every change to the check needs a new image and a new pin.
- The Hub path through the registry was never proven.

### Option 3: fix in place

Keep the string, fix defects as they appear, and add the incremental cache to it.

**Pros**:
- Smallest diff; the cache gain does not depend on the shape.

**Cons**:
- Keeps the premise that let a defect reach `main`: code no tool reads.

## Rationale

Option 1. The pain is that the admission gate is code no tool checks, and that it is reinstalled from
a string on every run. Option 1 removes both without adding a second version authority, and it is the
only option proven through the real Hub path. Option 2 buys the same structure at the cost of an image
pipeline and a slower first check. Option 3 keeps the premise.

The extra lines are the honest cost of the move: types and schemas where data crosses a process or
comes back from the sandbox, the delivery step, and child process handling that the string also had
but untyped. A subtraction pass found about 87 lines of weight (unused `facts`, options without
callers, repeated fields, a duplicate hash and redactor, narrating comments); the spec removes them.

Choices settled while designing:
- `conexus_run_operation` does not reuse the check's server bundle. The agent's checkout can change
  between a check and an operation, `run_operation` has no revision input, and the build costs about
  0.24 s. Reuse would need a content key and a staleness rule for 0.24 s; it uses the same `server`
  command instead, so there is one implementation.
- No check version in the artifact registry. Nothing reads it; the hash is compared on every report
  and logged with `BUILDER_CHECK`. Recording it would change the payload and migration 0054's key set
  for no reader.
- `tsc` runs as the agent's user, not root. As root it could read files the agent cannot, and an
  import pointing at one could leak its content through a type error that goes back to the agent. The
  gate's cache is kept by root and lent to `tsc` only while no other process of the agent's user runs,
  so the agent still cannot forge it. The agent tool keeps its own cache, which decides nothing.
- The bundle is built with the Hub, not on first use, and holds the Sankhya helper, so one file and
  one hash identify the check everywhere (cross check finding 1, 9, 12).
- Each bundle installs into its own directory named by its hash, by temporary copy and rename, and is
  never overwritten: a Hub restart with a new bundle cannot pair two versions inside one check
  (cross check finding 2).
- The per check `sha256sum` before each run is dropped: the Hub runs the check by its own hash's
  path, the agent cannot write there, and the report's own hash is compared after each run.
- Typed DevTools protocol is kept over Playwright, by measurement.

## Evidence

| Source | Fact |
| --- | --- |
| Spike iteration 1 (package) | correctness on six apps, 15 refused writes, 16 inert hostile files; slower and longer |
| Spike iteration 2 (lean package) | first check 8.6 s against 7.8 s; root only cache saves about 2.4 s after an edit |
| Spike iteration 3 (this design) | first 7.0 s against 7.3 s, repeat 4.9 s against 7.1 s; real Hub to Preview proven; production image unchanged |
| Subtraction review of iteration 3 | about 87 lines of weight; the rest is boundary cost |
| Cross check of the draft spec (another model) | 12 gaps: bundle source, atomic install, tsc privilege, cache key and lock, strict report, failure mapping, timeout scope, test oracles; all resolved in index.md |
| Adversarial review of the study | publish as promotion is a Q5 hypothesis; one version authority; prove the registry path |

## Q5 note

The employee host today follows the last good Preview (`served_preview_revision`, migrations 0023
and 0024) and its handlers use the Preview's data allocation. Promoting a checked artifact gives the
published app its code, not its own data. Q5 needs a Release record, a stable served pointer, a
decided published data allocation, and proof that a new Preview leaves the published app unchanged.
