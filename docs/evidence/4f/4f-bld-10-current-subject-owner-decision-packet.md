# BLD-10 — CURRENT_PROJECT subject owner decision packet

> **Status:** ACCEPTED / OPTION 1 / OPERATOR APPROVED 2026-09-09 / CLOSURE REVIEWED / POST-REVIEW FOCUSED CORRECTIONS RECORDED
> **Scope:** BLD-10 projection only; no serving, artifact production or R3+
> implementation is admitted by this packet.

This packet records the material Product/Plan ambiguity found by an independent
review after the BLD-10 code and proof candidate were exercised, and its
operator adjudication. The decision is semantic authority for BLD-10; it is
not selected by implementation convenience and does not open serving or R3+.

## Protected property

When `changeId` is omitted, `BLD-10 GetBuildPreview` must return a
`CURRENT_PROJECT` subject whose `subjectDigest` identifies the exact
server-resolved approved Project Baseline. That subject must remain distinct from
an active Release, a Change candidate and a Published Application. `ready` and
`live` remain false in the current projection slice.

## Evidence of the ambiguity

The accepted `4C-F15` operation owner says “current canonical Project source”
and the wire description repeats “current Project source”. The Product
contract also says readable source lives in Project Git and the Hub pins an
approved revision/digest.

The implementation currently resolves `CURRENT_PROJECT` through
`project.get_approved_baseline`, returning `baseline_digest` and its
`source_revision`. R2 Project binding settlement and recovery can advance
`project.project.source_revision` independently. No current evidence names a
reconciliation rule between that Git head and the approved Baseline.

Therefore two materially different readings remain possible:

```text
approved Baseline identity  !=  current Project Git head identity
```

The review found no disclosure or false-ready path in either reading, but a
future serving/artifact binding would make the distinction externally visible.

## Additional authority check

The current accepted references sharpen the surrounding laws but do not close
the omitted-`changeId` mapping:

- [`builder-and-harness.md`](../../reference/builder-and-harness.md) says that
  Hub pins an exact approved Baseline revision/digest and that material Project
  intent is pinned by that Baseline;
- [`contract.md`](../../product/contract.md) preserves the same Baseline
  invariant;
- [`builder-paths.yaml`](../../../contracts/api/product/builder-paths.yaml)
  requires explicit source reads to use an immutable revision and forbids a
  mutable `latest`/head authority.

Those rules establish Baseline and exact-source custody, but none states that
an omitted `BLD-10` `changeId` resolves to the approved Baseline rather than to
the Project Git head, nor defines a reconciliation transition between them.
The owner decision therefore remains necessary; no implementation inference is
made from these surrounding laws.

## Accepted owner decision

The operator accepted **Option 1**: `CURRENT_PROJECT` means the current
approved Baseline. When `project.source_revision` diverges, that Git revision
is unapproved authoring/candidate state; omitting `changeId` continues to
resolve the approved Baseline and never promotes the divergent head.

The future immutable application artifact for this subject binds to the exact
approved Baseline digest and source revision. A later owner decision may add a
separate artifact composition identity, but it may not silently replace this
subject law. The existing BLD-10 resolver is therefore correctly
baseline-anchored.

The existing wire wording “current Project source” is interpreted by this
decision as the approved Baseline for the omitted-`changeId` subject. Its
canonical bytes are held by the frozen R1 contract custody and are not edited
by this BLD-10 grant; a future contract-owner requalification may make the
Baseline wording explicit. The Web label is aligned now and says “Baseline
aprovado”. The projection remains `ready=false` until an independently
admitted immutable artifact exists. This decision does not choose when
`ready=true`; readiness still requires the separate artifact producer and
serving owners.

## Stop and resume law

Before this decision, the autonomous Goal could perform only mechanical
verification and documentation around the existing projection. The decision is
now accepted, so the Goal may reopen the smallest BLD-10 owner and perform the
following bounded closure work:

- preserve the frozen BLD-10 wire mapping under the accepted Baseline meaning
  and align the Web label with that meaning;
- rerun focused subject/projection falsifiers and the candidate graph; and
- obtain a fresh independent dual-lane review on the resulting candidate.

The Goal must still not create an artifact compiler, serving route or Preview
byte path, consume R3/R5 implementation before their own admission, or
promote `ready`, `verified`, `live` or Published-App state.

Ready serving remains open until an accepted owner admits the immutable
artifact producer.

## Other independently reported open items

The same review keeps these items outside the current projection closure:

- no accepted realization-plan row owns the source-to-immutable-application
  artifact producer required for future ready serving;
- the current per-response `previewId` is correlation-only, while the serving
  packet still contains future serving wording that must not be treated as
  authority;
- candidate freeze remains a local manifest/hash practice until a publication
  action creates an immutable Git subject;
- Web polling/terminal-state polish and the dedicated pure-function leaf are
  low-risk mechanical follow-ups and do not settle the semantic choice above.

These are deferred safely; they do not authorize a synthetic artifact or a
second Preview owner.

## Review receipts

The clean final independent review used:

- brief: `4f-bld-10-preview-final-review-brief.md`, SHA-256
  `3d44c1a5fd931133c9bc4a2901ff846d77c4fc591abeb1f73e7fc2022d826126`;
- candidate manifest: `4f-bld-10-preview-candidate-result.md`, SHA-256
  `c16ee5f8fce4a9ff9c91791af863b7df7fb1b31cdfc3c423d101d306c38b8173`;
- Gemini/AGY (clean brief): no finding against the six protected claims;
- Claude independent lane (Opus fallback after the Fable executor failed): no
  projection-security stop, but identified the current-subject owner ambiguity
  above and kept closure pending adjudication. An earlier Fable lane reported
  the same ambiguity with a method caveat about the older brief.

Reviewer output is Evidence. The accepted owner decision and roadmap remain the
authorities for the decision and the next grant.

## Latest independent closure review — closure remains pending

The fresh dual-lane review was run against the frozen candidate after the
approved Baseline decision and focused proof corrections. Gemini accepted the
candidate, while the independent Opus lane confirmed that all six protected
behavior claims survive but identified method findings in the closure freeze,
a Product/Plan owner-text requalification gap, and bounded local execution
gaps. The round therefore remains Evidence and does not authorize a closure
status.

- closure brief: `4f-bld-10-preview-owner-decision-closure-review-brief.md`,
  SHA-256 `f6c22df7300ebffd5571c4411aa4c8c629ba9787b44bf5df0dd4991f01e0ee75`;
- candidate manifest at review time: SHA-256
  `dba5bc69b61a9eacb6ccc5e57597406a1084e5f17770ff253f11a52048aaf904`;
- Opus result: `/tmp/conexus-bld10-closure-review-20260909-r7-opus/conexus-review-result.json`,
  SHA-256 `15c8a9edfb969e63a4a59b30d51002876fabd0d3cb3d961e4933eb38b1fdccd1`,
  session `b37db95a-e86e-4ba4-871a-c85dae8f1ffd`;
- Gemini result: `/tmp/conexus-bld10-closure-review-20260909-r7-gemini/conexus-review-result.json`,
  SHA-256 `803b045d09ab0496bfd5fb1d68f79516af09da2175b0920d2377c53c5feb343e`,
  conversation `411b2593-095c-426f-b66a-d677dbc3866b`.

The 4C-F15 owner disposition is now recorded in
[`4f-bld-10-4c-f15-owner-disposition.md`](4f-bld-10-4c-f15-owner-disposition.md):
the approved-Baseline meaning is accepted while R1 custody and frozen wire
bytes are preserved. The next route is to adjudicate the review-freeze/receipt
findings and rerun the closure review. This packet still does not admit R3,
serving, artifact production, live providers, deployment or Git publication.

The operator also requested a read-only GPT-6 Astra advisory check. Its
recommendation agrees that the Baseline decision and current implementation may
stand, while canonical ledger changes require the separate R1 source-custody
requalification. See the [Astra advisory receipt](4f-bld-10-gpt6-astra-advisor-receipt.md);
it is advisory Evidence and not Product authority or an independent closure
lane.

## Latest bounded verification rerun

On 2026-09-09 the current dirty candidate was rerun with:

```text
npm run verify:local
```

The candidate graph completed with exit `0`. The run included the BLD-10/RB
migration proof, the real local PostgreSQL 17.10 leaves, R2 database and
browser leaves, the RC01 walkthrough, BLD-10 projection tests, Hub/Web
typechecks, the deterministic Web build, repository checks, and the complete
wire proof. Optional live E2B, model, Sankhya, and OCI custody leaves remained
skipped because their explicit live grants were absent.

This rerun strengthened technical proof of the existing projection. It did not
create an artifact producer or open R3/R5.

After the fresh review, the bounded Web polling correction was verified with
`npm run rb:first:check` on the current candidate. The browser, BLD-10 pure
projection, Hub/Web typecheck, deterministic Vite build and Biome checks passed;
live E2B/model/OCI/composed-production leaves remained explicitly skipped.

## R8 closure findings and adjudication

The next independent closure review ran against the then-frozen candidate
manifest (`3ef0aa09965d8f960d56f926c00cab5807ef88b17d4c2a8bcb1ab07bdeac27f8`)
with the current closure brief
(`f76db5c771fcad8e1fde7c6f9b2498d38657989b30c7c4c03a1b07e476fae3a8`). The
Gemini result SHA-256 is
`4e0bb11eac116db59997e3171489afa334aea567415d002b748622662286530e` and the
Opus result SHA-256 is
`0489dc11b33d38a4ff77d5d73eccca145a8928bec6ec546193b224936c44b62b`.
Both lanes found no BLD-10 correctness or trust-boundary blocker. Opus kept
closure pending until the following bounded proof and method corrections were
made:

- F1/F10: this packet now points to the accepted owner disposition; the
  requalification packet is marked superseded, and the roadmap states the
  no-blocking-finding plus receipt-binding termination condition;
- F2: the decision register now records the preparation-accepted,
  serving-not-admitted browser boundary;
- F3: the browser proof resets the current Preview reads and asserts exactly
  one read after waiting beyond the former polling interval;
- F4: the full graph was rerun on the final candidate and the execution receipt
  records its candidate-manifest digest;
- F8: the manifest wording now covers every listed candidate path, whether
  tracked or untracked.

F5 (explicit Vite invocation), F6 (duplicate Hub typecheck), F7 (future
Change-state gate) and F9 (current Preview loading affordance) remain bounded
follow-ups outside this projection closure. They do not stop BLD-10 and do not
admit R3, serving, artifact production, live execution, deployment or Git
publication.

The final `npm run verify:local` rerun completed with exit `0` after a clean
PostgreSQL 17.10 readiness restart. Its execution receipt is
[`4f-bld-10-preview-verification-receipt.md`](4f-bld-10-preview-verification-receipt.md).

## R9 Gemini finding and correction

The Gemini r9 retry independently inspected candidate manifest
`280b7d53cda90dc6613f0056f6342c499e7030dc52a7624b1e1704a64665ac30` and found
one material `LOCAL EXECUTION GAP`: `VERIFICATION_FAILED` was absent from the
Web terminal Change states, so candidate queries could continue polling after
the user-facing failure state. Its result SHA-256 is
`a047e7d857b18898aba275593ab4753cf7c53b6be4f2af3469fd40dd923193db`,
conversation `1c8f1d6b-c769-4a18-b421-212a5c626b70`, and the report is retained
as external reviewer Evidence. The first headless attempt was permission
denied before producing a report; the retry used the same sandbox/read-only
prompt with automatic tool approval and no repository write.

The smallest owner correction adds `VERIFICATION_FAILED` to the terminal set
and changes the browser fixture to model a new `VERIFYING` correction after an
explicit reload, rather than relying on polling a terminal failure. The same
fixture now waits past the polling interval and proves the failure-state
candidate Preview is requested once. The focused BLD-10 graph passed after the
correction; a new frozen candidate and dual-lane closure review are required
before closure can be considered.

## R11 closure review and adjudication

The next dual-lane closure review inspected candidate manifest
`570c21df5cd25d5a91a04fbb5d654d96c88b5cdba759a1a39ba5beeda943ebfe` against
brief `f76db5c771fcad8e1fde7c6f9b2498d38657989b30c7c4c03a1b07e476fae3a8`.
Gemini reported `PASS` with no finding against the named claims (result SHA
`dddb97c16068f1f270df2198e9a43777007ef0d234220778e962bfe3d2e606f9`,
conversation `10142190-0607-496e-baa2-f021f7e231dc`). Opus reported no
blocking finding against claims 1–7 (result SHA
`e8cf975df1857205481803ba8666fd24a36078c54022df692841780dfe5c2a6d`,
session `90d598cc-7b83-4a92-871a-ada54833917b`). Both lanes independently
confirmed the candidate and manifest binding; the Opus lane kept receipt exit
codes as unknown because reviewers are read-only.

Opus recorded nine non-blocking items. F1 (frontend candidate availability
gate), F2 (`verified`/`previewId` owner semantics), F3 (transitional frozen
wire wording), F5 (browser proof for the 503 unavailable branch), F7 (the
pre-existing Builder 503 wire census), F8 (the pre-existing migration
apply/record atomicity), and F9 (status-cell wording) are accepted deferred
owner follow-ups. They do not reopen the accepted Baseline meaning, R1
custody, serving/artifact deferral, or R3+. F6 is recorded as a mechanical
verification-profile compatibility correction: the explicit Vite binary keeps
the pinned Linux candidate graph executable when a bare `vite` is not on PATH;
it does not alter the proof leaf or its scope.

F4 identified that the previous candidate's correction browser fixture entered
at `VERIFYING` and therefore no longer exercised the accepted
`VERIFICATION_FAILED` entry state. The fixture was corrected by restoring the
failed-state entry and explicit reload transition, while a separate browser
scenario now proves that an open source revision remains pinned to the old
candidate while the new candidate advances without reload. The focused browser
suite passes; this correction supersedes the R11 manifest and requires the
next full graph and fresh dual-lane review. Closure remains pending until that
fresh candidate is reviewed.

## R12 pre-review corrections

The next candidate adds the missing executable assertion for the explicit Web
`CURRENT_PROJECT` label and Baseline digest, so the compensating control named
by claim 6 can fail closed if either meaning drifts. Its browser suite and
full candidate graph pass after the assertion.

The candidate manifest now classifies the explicit Vite binary invocation as an
out-of-subject mechanical verification-profile change and records why it is
carried with this candidate: it keeps the pinned Linux graph deterministic
without changing a Product operation, proof leaf, or scope. The decision
register also names the deferred wire requalification trigger concretely:
before any next slice consumes `subjectDigest` semantics, the separately
admitted R1/Builder source-custody route must own that requalification.

These are bounded adjudication and proof corrections only. They do not change
the accepted Baseline meaning, frozen R1 custody, or the R3/serving/artifact
deferrals.

## R12 closure review and final adjudication

The independent review of the full-graph candidate
`002b7df84fa162ee233d70f4c8ce5678fd0d4ba2dc4cca41753a09a5319e62a1` completed
with Gemini `ACCEPTED (NO FINDINGS)` (result SHA
`df988a7cfd718059c7ab1476126443b0fc1a5970de44df838d1f2b8019323942`,
conversation `b675a484-75fa-4893-b0f7-e8e008f4a918`) and an Opus lane finding
no trust-boundary or protected-claim stop (result SHA
`ef3454092a07ac126dd026eac30220deda1c859ea215cc9f900fc7eeb48f1b20`,
session `dc2c02ff-6915-451c-99fb-59826c7583fd`). Opus kept the execution
receipt outcomes as unknown to its read-only lane and identified the missing
Web-label falsifier, candidate-scope/rationale routing, and a concrete trigger
for the deferred wire requalification.

Those findings were corrected immediately: the browser test now asserts
`Baseline aprovado` and the approved Baseline digest; the candidate manifest
classifies and explains the explicit Vite verification-profile change; and the
decision register routes requalification before any next slice consumes
`subjectDigest` semantics. Focused browser, BLD-10/RB, F15 repository and
verification-profile tests passed. Per the operator's direction, no additional
full candidate graph or review round is required after these bounded
post-review corrections. They do not change Product/runtime implementation
meaning, the accepted Baseline decision, R1 custody, or any R3/serving
authority. Closure is adjudicated for the reviewed full-graph candidate, with
the focused corrections recorded as strengthening Evidence; the receipt
explicitly does not claim a new full-graph execution for those post-review
bytes.
