# R2-P6 Control Plane — independent closure review brief

Review subject: candidate `1220b3e`, material range `72b5a9b..1220b3e`.
This is the complete P6 implementation candidate and its deciding P6-E proof,
not R2/P7 closure. The Lead requests one fresh isolated Fable and AGY closure
round under the Conexus development method.

Bootstrap from `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`, the Engineering,
Repository and Frontend Product Experience methods, then read the frozen
`4f-r2-p6-control-plane-implementation-packet.md`. Use the locked W-02A,
W-02B and P-02 Screen Contracts only where a named claim needs their exact
interaction semantics. Accepted Product/architecture/contracts remain
authority; this brief is orientation and an attack frame, not a verdict.

## Protected claims and concrete falsifiers

1. The four routed surfaces realize only the exact 20-operation R2 tranche and
   preserve publication versus Project adoption, qualification versus use, and
   Workspace versus Project ownership. Client-side joins, inferred authority,
   optimistic success, a new operation/Permission/record class or an R3+/RB
   surface falsifies this claim.
2. Purpose-bound BRN-02 admits immutable revision summaries only for exact
   Workspace membership plus independently stored `project.manage + brain.bind`.
   Generic `brain.read` implication, mutation-preflight reuse, broader Registry
   disclosure, cross-Workspace/Project access or malformed-source disclosure
   falsifies this claim.
3. The generated same-origin transport preserves exact methods, paths, query
   encoding, CSRF on every non-GET, response metadata and current-state
   carriers. A handwritten competing wire, lost ETag/204/401 semantics or a
   digest substituted for HTTP ETag falsifies this claim.
4. Credential input is write-only in the browser. It is never read back,
   prefilled, retained after settlement or rendered in success/error output.
   Qualification evidence must belong to the exact current Connection revision;
   stale `PASSED` presentation after CON-06 is a false-PASS falsifier.
5. Brain and Connection changes remain explicitly adopted by the Project. A
   newer publication, revision or qualification may not move either Project
   pin automatically; removal changes only the Project-owned binding.
6. The P6-E proof reliably composes built browser assets, production Hub
   modules, restricted PostgreSQL roles, encrypted credential storage and the
   admitted OCI Git executor. It must assert persisted database and Git states,
   not replace them with HTTP mocks or DOM claims. Its Sankhya transport is
   controlled loopback only; any real-provider or ERP claim/effect is forbidden.
7. Keyboard focus restoration, named status/dialog semantics, direct production
   deep links, authority loss and narrow-layout behavior remain operable. A
   reproducible misleading absence/success state or inaccessible required
   action is material; aesthetic preference is not.
8. A failed refetch cannot leave cached Project Brain/Integration state rendered
   or usable as the carrier for a later mutation. Removal followed by adoption
   without reload must use server-confirmed absence (`If-None-Match: *`), while
   stale context/binding cards remain hidden. CON-05/07/08 retries of the same
   human attempt must retain one idempotency key; changing non-secret intake may
   start a new attempt, and credential values may not be retained to do so.

## Proof reconstruction

Inspect the exact diff and focused tests first. The Lead reports:

- `npm run r2:p6:check` passed, with the external composition exactly gated;
- real Chromium behavioral proof passed `1/1`;
- that browser proof covers removal and re-adoption without reload, stale-cache
  suppression, same-key retry after an ambiguous CON-05/07/08 response, and
  rejection of obsolete `PASSED` evidence after either CON-06 or CON-07;
- the exact migration-018 PostgreSQL lane passed `1/1` and is now an explicit
  environment-bearing required-CI step;
- the gated production composition passed `1/1` in `415.6s` with PostgreSQL 17,
  restricted roles and Git OCI, traversing 27 method/path pairs over the 20
  production modules;
- intermediate/final Git declarations and final database removals passed;
- the provider-shaped sequence was authentication plus company `1` read, then
  authentication plus company `2` read, against loopback only;
- focused TypeScript, import-law, Biome and diff checks passed.

The composition intentionally uses a contract-valid Brain fixture without
physical key assertions because P4/P5 already own that aggregate proof. It may
prove P6 production composition and explicit adoption, not a new live Sankhya,
key-conformance or arbitrary-customer claim. Reconstruct through source and
targeted read-only checks; do not rerun the multi-minute OCI composition.

## Output contract and limits

Return only the independent verdict. Classify each concrete result as `METHOD
FINDING`, `PRODUCT / PLAN GAP`, `LOCAL EXECUTION GAP` or `NO FINDING`. For every
material finding state reproducible evidence, failure mode, materiality,
smallest owner/stage, protected invariant, stop/continue disposition, what must
be reconsidered and what must not be reopened. Attack both under-stopping and
over-stopping. Do not pre-author Product meaning.

Read-only review: no edits, dependency installation, Docker, provider/model
calls, credentials, Git mutation or other reviewer. Do not treat roadmap status
or the Lead's reported proof as proof by assertion. P7/R2 closure, real Sankhya
qualification, R3+, RB/Mastra, deployment, push, PR and merge are non-goals.
Reviewer output remains outside the repository until Lead adjudication after
both isolated lanes complete.

For AGY sandbox compatibility, inspect files with its read/search tools. If a
terminal lookup is indispensable, issue one simple read-only command per tool
call from the configured allowlist; do not compose commands with pipes,
redirects or shell operators and do not request a broader permission.
