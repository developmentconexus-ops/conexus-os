# 4F(R1) Project cognition — Opus successor independent review result

> **Status:** `AGY PASS / CLAUDE CONFIRMATION REVISE / SOLE MATERIAL FINDING
> CORRECTED BY MACHINE RE-PROOF / LEAD CLOSED PASS`
> **Brief:** [frozen independent review brief](4f-r1-project-opus-model-switch-independent-review-brief.md)
> **Candidate receipt SHA-256:**
> `9365c6c8a3cbc34d6761cb368744d551a39d06e98631fb609b943564b0bf25cd`

## Lane outcomes

### Claude Code Opus

The operator-authorized fresh `opus`/`xhigh` read-only lane was first invoked
through the repository review wrapper. It remained in network wait for
approximately fourteen minutes, produced no partial or final report, and was
terminated to avoid an indefinite provider call. The wrapper was sequential,
so this did not contaminate the AGY lane.

After the operator directed continuation, the Lead restored every frozen
candidate hash from the original brief and invoked only the missing Claude
lane. Claude Code `2.1.257`, requested alias `opus`, effort `xhigh`, session
`011ccd43-4995-4b6e-9d99-55f51d8fea45`, returned provider status `529
Overloaded` before review generation. It recorded zero Opus input/output tokens
and no report. A small CLI bootstrap use of `claude-haiku-4-5` is not an Opus
review and is not treated as a verdict. No Claude verdict exists and none is
inferred.

On the next explicit operator request, the Lead again restored the original
frozen hashes and invoked only the missing lane. Claude Code `2.1.257`, session
`14cbc61e-e73e-42dc-a679-249328bf84e5`, again returned provider `529
Overloaded`, with zero Opus input/output tokens and no report. This repeat
confirms an external availability blocker; it does not create a review verdict
or justify further automatic retries.

On a further explicit operator request, the Lead restored the same frozen hashes
and invoked only the missing lane again. The Claude process remained in backend
network wait for approximately fifteen minutes, produced no partial/final
report or verdict, and was terminated to avoid an indefinite execution. No
additional reviewer lane or Product call ran. This is the same external
availability blocker, not a new implementation finding.

After service recovery, Claude Code `2.1.257`, requested alias `opus`, resolved
canonical model `claude-opus-5`, effort `xhigh`, session
`459a4028-d20c-4dd5-9eac-e87a5c75aabd`, completed the isolated review. It
verified all ten frozen hashes and returned `VERDICT = REVISE` with one material
finding (`F1`) and five explicitly non-blocking findings (`F2..F6`).

`F1` is accepted. The original frozen result still said the composed journey
was unexecuted while the roadmap and brief correctly reflected the later local
`1/1 PASS`. That stale result could make proof reconstruction produce a false
PASS. The smallest correction is now applied: the result records the proof and
the receipt
`4f-r1-project-opus-composed-proof-receipt.json` binds the exact OCI, command,
subject hashes and observed counts. No production, test, OAuth or Product byte
changed.

`F2` is `DEFER SAFELY`: the provider accepted the exact requested model and
generated, so the current Opus claim is not false; response-echo/status metadata
belongs to a later qualification-receipt hardening owner. Revisit before the
next model-admission receipt schema revision.

`F3` is `DEFER SAFELY`: production OAuth mechanics have direct compiled-byte
coverage and the live qualification transport proves its own bounded egress;
an equivalence control is useful but not required to establish this candidate.
Revisit when either transport next changes materially.

`F4` is `DEFER SAFELY`: the current brief and wrapper record requested alias,
canonical model, CLI version and session, so this round is unambiguous. Normalize
legacy compatibility lane keys in the later review-Evidence schema owner.

`F5` is closed by execution and routing correction: the Claude lane completed,
the heartbeat was deleted, and no vendor-availability hold remains. The dual
independent-assurance floor is preserved.

`F6` is `DEFER SAFELY`: fail-closed external catalog rebinding is an operator
deployment action, while deployment remains blocked. Add it to the Release/
operator pending-action owner before first real Hub startup with this catalog.

The first final-confirmation attempt over the corrected hashes remained in the
Claude backend network wait for fifteen minutes and produced no report. Because
the wrapper is sequential, the fresh AGY confirmation did not start. The
attempt was terminated without inferring a verdict. F1 remains corrected but
unconfirmed; this is an external service wait, not a new finding.

The official Claude status page independently confirms an active 2026-09-03
incident with elevated errors affecting Opus 5 and a partial outage for Claude
Code/API. Its 14:49 UTC update states that remediation is still in progress.
This corroborates an external service blocker rather than repository, OAuth or
candidate failure. A thread heartbeat now monitors recovery and must remain
quiet while the incident is unchanged.

### AGY / Gemini

AGY `1.1.25`, exact model `gemini-3.1-pro-high`, effort `high`, plan+sandbox,
conversation `92fcb764-55bf-46ac-87cd-fb0153304051`, completed successfully.
Its independent report returned:

```text
VERDICT = PASS
claims 1..7 = PASS
classification = NO FINDING
unresolvedMaterialFindings = 0
```

The report inspected the frozen production, qualification, test, receipt and
stage bytes. It found exact Opus admission, OAuth/no-API-key custody, closed
model selection, preserved Product behavior, exact receipt scope, historical
Fable preservation and no unauthorized state mutation.

## Lead adjudication

AGY raises no correction or blocker. The technical candidate remains PASS:
production cognition `1/1`, OAuth qualification `8/8`, production-composed
Chromium/PostgreSQL 17.10 `1/1`, Hub typecheck, import law `26/26`, repository
check, root verify, preflight and exact live Opus OAuth receipt all passed.

The final AGY confirmation returned `PASS`. The final Claude Code `2.1.257`
confirmation, requested alias `opus`, resolved `claude-opus-5`, effort `xhigh`,
session `b2ad1039-3e19-4715-9fde-c055ca48f0c9`, returned `REVISE`. It matched
all twelve frozen identities and passed claims 1–3 and 5–7. Its sole unresolved
material finding was narrower than production: the composed receipt's `1/1
PASS` was manually recorded and therefore not falsifiable as an execution
record.

Lead accepts that finding. The smallest owner now has an executable producer,
`scripts/record-r1-project-opus-composed-proof-receipt.mjs`. On pinned WSL
Ubuntu/Node/npm it started the exact locally present PostgreSQL 17.10 digest
with `--pull=never`, tmpfs and loopback-only exposure, ran the unchanged
production-composed Chromium journey, observed exact `1/1 PASS`, atomically
published the receipt and removed its owned container. Receipt SHA-256:
`f729ce488b2f705957b06f7231e449ec89aa0267cffa2ee21c5d528baf8698b3`.
No provider call or credential disclosure occurred.

Final dispositions:

- receipt provenance false-PASS: `LOCAL EXECUTION GAP`, accepted and corrected;
- proof-record proportionality: root cause removed; no method amendment and no
  further reviewer round;
- wrapper changed between lanes: `DEFER SAFELY`; candidate/prompt semantics did
  not change, revisit when the review-Evidence schema next freezes its harness;
- stale mutable status: accepted and corrected in roadmap/stage owner;
- broader receipt census: `DEFER SAFELY`; no current false PASS, revisit at the
  next model-admission receipt schema revision.

The protected candidate is `CLOSED PASS`. No implementation, recovery
framework, Product/provider call, API key, deployment, next Product tranche,
commit, push, PR or merge is opened by this adjudication.
