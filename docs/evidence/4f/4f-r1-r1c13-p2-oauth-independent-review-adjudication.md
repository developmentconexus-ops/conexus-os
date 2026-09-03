# R1C13-P2 OAuth independent review — Lead adjudication

> **Lead disposition:** `CLEAR / R1C-13 CLOSED PASS`
> **Date:** `2026-09-02`
> **Further review:** not justified

## Review provenance

The first closure run is retained outside the repository at
`/home/leandrotheodoro/.cache/conexus/reviews/r1c13-p2-oauth-final/conexus-review-result.json`
with SHA-256
`f04b1ceefa76310f1f7555b5c2513dd7bb1213642e89db6f79d4fd420755212d`.
Claude Code Fable used session
`1cc97451-643f-4328-a2e3-01c4722888c6` and returned `STOP`; AGY used
conversation `9576ab60-d503-4c8b-815d-07a2007b2db0` and returned `REVISE`.

The one justified final run is retained at
`/home/leandrotheodoro/.cache/conexus/reviews/r1c13-p2-oauth-final-round2/conexus-review-result.json`
with SHA-256
`9f7b9cc38d4c64b9ed17861cb575f4b1b2dfa4611c28c0804beb3ca175c39e52`.
Claude Code Fable normal resolved to `claude-opus-5`, version `2.1.257`,
session `c609162b-fb70-4846-b459-7d719208764a`, and returned `REVISE`.
AGY `gemini-3.1-pro-high`, version `1.1.24`, conversation
`7cf81c15-d667-4732-9a5b-f5d5acaa5615`, completed analysis but its CLI
timed out while delivering the response; it supplied no adjudicable verdict.
The wrapper correctly refused a candidate-bound resume, so no fresh or
unbound replacement review was run.

The Engineering Method requires one fresh independent challenger at this trust
boundary, not reviewer consensus. Fable supplied that independent challenge.
The AGY timeout remains an execution fact, not a hidden PASS.

## Surviving findings and corrections

1. **Joined composition — accepted and corrected.** P2-P08 now exercises
   `Mastra Agent → exact catalog entry → MastraModelGateway → Anthropic OAuth
   adapter → bounded transport`. The suite is `23/23 PASS`, including
   `8/8` P2.
2. **Observation window — accepted and corrected.** Observation begins before
   the provider import. Node 24 performance entries extend the canary and live
   proof across DNS, TCP socket and HTTP. The final live receipt records exactly
   one admitted event at each layer and zero unauthorized network attempts.
3. **First-round retention — accepted and corrected here.** Exact external
   result paths, hashes, reviewer versions and session identities are retained.
4. **Manifest coverage — accepted and corrected.** The frozen manifest now
   includes P0 and P1 test hashes as well as every P2 proof owner.
5. **Supply-chain re-evidence — accepted and corrected.** The final isolated
   lock has 161 verified registry signatures, 37 verified attestations, no high
   advisory, and the two already-owned low GHSA-866g-f22w-33x8 findings.

## DEFER SAFELY

- token-boundary helper convergence and a chunked token-response duplicate
  falsifier: both current branches fail closed; revisit at S6 adoption;
- stale refresh-lock recovery: current local qualification fails closed;
  revisit before unattended or multi-user use;
- refresh-path live classification: the refresh origin is pinned and tested;
  revisit before S6 live-provider proof;
- derivation of every receipt boolean instead of assertion-backed literals:
  no current false PASS survives; revisit in receipt tooling;
- the S6 credential route: R1C-13 proves local personal OAuth only. The S6
  stage packet must name its exact credential mechanism and owner before any
  Product/root byte. R1C-13 does not silently authorize production, pooling or
  multi-user use.

## Lead conclusion

The blocking findings were local proof gaps. Their corrections did not change
the protected property; they made the deciding proof reliable. Exact identity,
false-PASS resistance, zero Product delta, secret non-disclosure, Evidence
preservation and deciding-review integrity now survive. A third review would be
recursive assurance without a new material falsifier.

`R1C13-P2 = CLOSED PASS`; collectively `R1C-13 = CLOSED PASS`.
