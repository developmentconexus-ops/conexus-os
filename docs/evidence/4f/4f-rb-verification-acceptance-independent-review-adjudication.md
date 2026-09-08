# RB verification and acceptance — independent review adjudication

Date: `2026-09-08`

Implementation candidate: `7bd8e5487347d568769e7ec0c698791145c8c398`
against integrated base `839d5496359b95261c59906f51c0ce439d20c251`.
Later commits update only review/status Evidence.

## Convergence

The first complete challenge exposed material recovery and settlement gaps.
Lead correction made `RESULT_READY` recovery honest, rejected malformed/NULL
reports transactionally, preserved every verifier Finding, and kept internal
report fields out of the closed Product projection. A fresh review on corrected
candidate `c332d3012da06a98645c2cc44010bdb33b9ef524` then found no false acceptance
or isolation defect. Fable raised one ambiguous authority question: verifier
admission did not re-apply the creator's current `project.build` authority.

Lead adjudication, challenged by the GPT-6 Astra advisor, accepted that finding
as material against Builder owner §9.4 and this packet's current-eligibility
law. Candidate `7bd8e54` now rechecks `project.build` both before creating the
verifier ActorRun and before acceptance settlement. Revocation at either point
leaves the exact candidate/diff `UNVERIFIED`; it creates no acceptance and never
turns human `project.review` into settlement authority.

Final isolated lanes over `7bd8e54`:

- Fable, Claude Code `2.1.257`, requested alias `fable`, effort `xhigh`, session
  `ecb97c16-a94f-44df-94af-debe8aa2892c`: no method or Product/plan finding;
  two non-blocking local gaps; no protected-claim falsifier.
- AGY `1.1.27`, `gemini-3.1-pro-high`, effort `high`, conversation
  `f208d459-a2d8-4787-8560-146d8094bd47`: `NO FINDING`, artifact verdict
  `CLEAR`. The wrapper response linked the artifact but did not copy its verdict
  into `verdictRaw`; exit was zero and no denied action or repository mutation
  occurred.

Both lanes independently confirmed from the exact installed Mastra `1.63.2`,
`@mastra/e2b` `0.11.0` and E2B `2.46.1` source that the verifier model receives
exactly the Conexus `readChangedFile` tool. Filesystem tools are absent without
a filesystem; all sandbox/process tools are disabled; no computer, search, LSP,
memory or default coding-agent tool is configured.

## Lead disposition

- Recovery/claim failure: corrected. `RESULT_READY` becomes `UNVERIFIED`, exact
  diff remains, writer is not replayed, repeated recovery is idempotent, and an
  already admitted `VERIFYING` attempt is not cancelled by the claim-failure
  function.
- SQL false-PASS resistance: corrected. Missing report members, NULL identity
  material and malformed checks quarantine the run; PASS requires positive
  intent truth, zero Findings and only PASS checks. FAIL persists every Finding;
  INCONCLUSIVE remains valid Evidence without acceptance.
- Current authority: corrected. Revocation before claim creates no verifier
  ActorRun; revocation before settlement rejects PASS. Review revocation still
  affects only human disclosure.
- Cross-Project disclosure: strengthened proof now uses a foreign Project with
  valid review authority, so the Project relation itself is the firing refusal.
- Index routing: corrected to expose the current packet directly.

The remaining observations are `DEFER SAFELY`:

- automatic verification rerun is outside this packet; current failures are
  honest and preserve candidate truth. Reopen with `BLD-13` or the first real
  correction/rerun journey;
- denied review material and known-empty both disclose no bytes, which cannot
  leak or create acceptance, but UI guidance may be clearer. Reopen in the
  Project Build component when grant-aware presentation is admitted;
- internal verifier reason/failure detail is intentionally absent from the
  closed Evidence wire. Reopen the smallest 4A/4B Evidence owner when a proven
  human recovery job requires it;
- verifier ActorRun purpose remains internal and shares the current WorkUnit;
  reopen only if a BLD-17 user job requires distinct public meaning;
- Plan and contract revision identities coincide in this one-item DIRECT Plan;
  reopen with the first real Plan revision consumer;
- not every structurally impossible legacy-corruption case has a dedicated
  permanent test. Current reachable claim, settlement, recovery, malformed
  report, authority, cross-Project and tool-boundary paths have deciding tests;
  reopen on a reachable counterexample or dependency pin change.

The live composed proof uses a protected temporary catalog derived from the
deployment catalog because the host catalog does not yet contain
`builder-verification-primary`; it reuses the admitted Anthropic credential and
adds only the `BUILDER_VERIFICATION` capability in test-local state. This proves
the production composition and model transport, not that deployment
configuration is complete. Ordinary Hub deployment must add an explicit
server-owned verifier admission first; no new credential kind is required when
the admitted provider/credential slot is reused.

No finding reopens ACP, runtime tournaments, private MCP, generic eval/telemetry,
concurrent writers, Product-Agent work, R3, Release or deployment. Independent
convergence is clear for the candidate. Reviewer output is Evidence; operator
acceptance and merge remain separate decisions.
