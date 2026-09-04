# 4F(R1) Project Opus successor — final Opus confirmation result

> **Disposition:** reviewer Evidence consumed by final Lead adjudication
> **Lane:** Claude Code `2.1.257`, requested alias `opus`, resolved
> `claude-opus-5`, effort `xhigh`, read-only plan mode
> **Session:** `b2ad1039-3e19-4715-9fde-c055ca48f0c9`
> **Brief SHA-256:**
> `3e3ae23bdd9deb1ed1187323b46fa6024e4472ff6424d42c81685618f82ddf1e`
> **External raw wrapper result SHA-256:**
> `5ab60d916a090b8265bd2d69e0ed1170999ab197257b19aa9c5ce70b3b81b9f9`
> **Raw verdict:** `REVISE`

## Reviewer result

The lane independently matched all twelve frozen identities, confirmed that no
production/test/qualification bytes changed in the F1 correction, and returned
claims 1–3 and 5–7 `PASS`. Claim 4 was `PASS on execution route, WEAK on
record`: the manually authored composed receipt had no executable producer, so
its decisive `1/1 PASS` assertion could not be falsified.

The sole unresolved material finding was therefore a `LOCAL EXECUTION GAP` in
the receipt provenance. The reviewer prescribed the smallest correction:
machine-emit the receipt from the actual composed run or add an equivalent
re-verifier. It explicitly concluded that the mechanical re-proof requires no
further independent round.

The remaining findings do not block the protected candidate:

- the record/proof distinction is a proportionality observation whose root
  cause is removed by the machine-emitted receipt; no method amendment is
  required now;
- the wrapper changed between lanes, but only its output transport and bounded
  capture changed; the neutral prompt and frozen Product candidate did not;
- mutable status lagged the completed AGY artifact and needed reconciliation;
- a broader future receipt census is useful but no current false PASS was
  demonstrated.

## Receipt-last correction

`scripts/record-r1-project-opus-composed-proof-receipt.mjs` now owns one exact
execution: it requires WSL Ubuntu and the pinned Node/npm versions; refuses a
non-local PostgreSQL image through `--pull=never`; starts only a named,
loopback-bound, tmpfs-backed container from the exact admitted digest; runs the
unchanged composed test; accepts only exact `1/1 PASS`; publishes atomically;
and removes only its owned container.

That producer executed successfully and published
`4f-r1-project-opus-composed-proof-receipt.json`, SHA-256
`f729ce488b2f705957b06f7231e449ec89aa0267cffa2ee21c5d528baf8698b3`.
The receipt records producer SHA, exact test-output SHA, exact OCI execution
reference, subject hashes and the observed result. No Product/provider call or
credential disclosure occurred.

This closes the sole material finding by mechanical re-proof. Reviewer output
remains Evidence; the final disposition is recorded in the shared Lead
adjudication owner.
