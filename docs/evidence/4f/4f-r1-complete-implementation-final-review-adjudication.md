# 4F(R1) — Complete implementation final independent-review adjudication

> **Lead disposition:** `CLEAR / S6+R1 RECEIPT-LAST PERMITTED`
> **Candidate:** `4f-r1-complete-implementation-review-candidate-v2.json`
> **Protected-claim census:** frozen claims 1–9; no expansion
> **Provider/Product calls:** none

## Exact binding and reviewer identities

```text
brief sha256     90a5d92bdaae738dc36afa0527292fcfa162405274e81714443864229fa1405d
candidate sha256 3c4f0ce79ad369af82cd8aff87fd89a78bb55ca5bb02e84b77f46f572ec5ecd8
combined output  fe08a4d5fc9b7520c38494f562a341d063a9b95659dc00a32873fd8a9485dec4
```

The Claude compatibility lane key remained `opus`. The operator authorized the
temporary model alias `opus` because Fable quota was exhausted. Claude Code
`2.1.257` resolved it to canonical `claude-opus-5`, effort `xhigh`, read-only
plan session `2784b29b-c6ae-4348-86e1-8d62b94cd8ad`; raw verdict was `REVISE`.
The extracted report digest is
`153690db69af71b2657ad15e33035d075e63047bc82ce1847ad5563f08dfc944`.

AGY `1.1.24` used `gemini-3.1-pro-high`, effort `high`, plan+sandbox
conversation `7f461495-2c45-41c4-a971-8c6090235f54`. Its CLI response put the
complete report in the read-only plan artifact rather than emitting the exact
wrapper verdict line. That supporting artifact has sha256
`5e7f5015344e1d5c7fe1a1584acb021e2c5941f1faf441ca673713745c660fac`,
contains the required claims 1–9 result and ends with `PASS` / zero unresolved
material findings. The lane is adjudicable; it is not represented as a wrapper-
captured verdict.

The two lanes were fresh and isolated. Neither received the other output.

## Candidate-freeze reproduction

The v2 digest note excludes only the v2 manifest and final-confirmation brief,
which were written after capture. Re-running the recorded algorithm over the
unchanged candidate reproduced every value:

```text
dirty paths excluding framing                   417
git diff --binary | sha256sum                   e90a59f5ff9afb194cc9c11599b83bcb6888432fc0e332f60e206a2520744b97
untracked path+sha256 census, NUL-sort          83c8e760c81cfd1df2b79cd3dc0f6400094645757cb6645322a7a3454eb58aab
tracked+untracked path+sha256 census, NUL-sort  51067494e7865ba536b608ead76e12fc866f2778a6b849e4a5aaa364b3787d43
implementation path+sha256 census, NUL-sort     4f0957ebd38e610292644f8807a9aeea1205851b9725539ccef48a00ec0aa803
4F Evidence path+sha256 census, NUL-sort        5c8619358153bbf591aacd0d18e3c2d2fa2b5036305ca7bddd23c8e89c61882f
```

For each census, repository-relative paths came from `git ls-files` with the
candidate's stated tracked/untracked set, the two framing paths were excluded,
entries were NUL-sorted, each file was hashed by `sha256sum`, and that emitted
path+digest stream was hashed again. This resolves Opus U1 without changing the
reviewed candidate.

## Finding adjudication

| Finding | Lead disposition | Reason / route |
| --- | --- | --- |
| Opus F1, unavailable-lane rule | `NO CURRENT BLOCKER` | Current Method 1.2 and the skill already forbid `CLOSED PASS` while either lane is pending. This round has two delivered independent reports, including the whole R1C-13 subject. A future missing lane remains pending or requires an operator-ratified method change; it is never a hidden PASS. |
| Opus F2, PRJ-07 orphan reservation recovery | `DEFER SAFELY` | A lost process leaves the key fail-closed at 409; no Candidate, Baseline, duplicate authority or partial durable Product truth is created. The current runtime is one local process and unattended/multi-instance operation is blocked. Revisit before either becomes admitted; smallest owner is S6 inception recovery using the existing S3 lease pattern. Claim 3's safety property remains true; availability recovery is not claimed closed. |
| Opus F3, OAuth refresh lock across processes | `DEFER SAFELY` | Shipped custody retains atomic owner-only writes and in-process single-flight but not R1C-13's cross-process lock. Product/provider execution and multi-process/production custody remain blocked, so no current protected claim fails. Restore or explicitly re-admit the cross-process mechanism before restart overlap, multiple Hub processes or unattended OAuth use. OAuth-vs-API-key, scopes and secret custody do not reopen. |
| Opus F4, Atlas plus runner digest authorities | `DEFER SAFELY` | Exact Atlas 1.3.0 bytes regenerated the chain unchanged and Opus independently reproduced every Atlas and runner digest. No current mismatch or false PASS exists. Bind the two representations when a Release/CR-1 attestation consumer appears or either migration identity mechanism changes. |
| Opus F5, telemetry-order/version regression controls | `NO CURRENT BLOCKER / DEFER DURABILITY` | Opus independently traced the import graph and confirmed telemetry is set before the only Mastra-reachable dynamic import. The composed proof itself asserts `server_version_num=170010`, and CI pins the exact PostgreSQL index. Add a narrower static ordering guard if the server composition changes; current bytes and deciding run are proven. |
| Opus F6, production root not executed | `SCOPED AS CLAIMED / DEFER SAFELY` | The candidate claims production **modules**, not the external-config production root. The test executes real Fastify, Project module, Mastra, Vite/Chromium and PostgreSQL with only identity/model stand-ins. Execute the root only under a separately authorized live-provider/config proof. |
| Opus F7, v2 authority routing | `ACCEPT / CORRECT NOW` | Roadmap, index, stage packet and receipt are updated in this closure. No Product byte or reviewed property changes. |
| Opus F8, proposal provenance wording | `ACCEPT / DOCUMENTATION CORRECTION` | Project validates model-returned provenance against admitted tool outputs before settlement but does not make provenance durable Product authority. The stage packet is narrowed to that exact behavior. Product wire/response meaning does not reopen. |
| Opus U2–U5 | `RESOLVED BY LEAD PROOF` | Network facts were revalidated; exact Docker/Chromium/R1C-14 runs passed; required suites ran; Atlas 1.3.0 exact SHA was executed and reproduced the chain. |
| Opus U6, S3/S4/S5 not all permanent CI steps | `DEFER SAFELY` | Permanent CI protects current objective properties, not every historical gate. Current S4 PostgreSQL proof ran on 17.10; whole implementation was independently inspected; reopen only if a current required property loses coverage. |
| Gemini | `NO FINDING / PASS` | All nine claims PASS; zero unresolved material findings. |

## Lead conclusion and termination

No surviving finding demonstrates a false PASS, unauthorized effect, wrong
Product truth, secret disclosure, loss of exact Git/OCI custody, or unreliable
deciding proof for the frozen closure claims. Valid recovery, cross-process and
future-attestation findings are explicitly deferred with concrete admission
triggers and owners. The only current repository-authority/documentation gaps
are corrected without changing Product bytes or a protected property.

Another reviewer call is therefore forbidden by the proportionality rule: no
surviving material correction invalidates the reviewed property or deciding
proof. Publish the S6/R1 closure result receipt-last, then stop. A live model
test, production, next tranche, commit, push, PR or merge requires a separate
exact operator grant.
