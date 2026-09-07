# R2-P6 Control Plane — review adjudication and closure

Status: **CLOSED PASS**
Date: 2026-09-07
Implementation packet: [`4f-r2-p6-control-plane-implementation-packet.md`](4f-r2-p6-control-plane-implementation-packet.md)
Reviewed material candidate: `1220b3e078d45b407a97df908a788397a64dd882`
Closure proof correction: `9bc9fcbf7ca2234128c9ffe8a4c8694a878b8aff`

## Outcome

P6 realizes the locked W-02A/W-02B/P-02 Control Plane journey over the exact
20 R2 routes. The four browser destinations use the generated same-origin
transport and the production Hub modules. Publication, qualification and
Project adoption remain separate; credentials remain write-only; stale cached
authority and qualification state cannot be rendered or reused as current.

P6 adds no Product operation, Permission, record class or provider capability.
Its composed provider boundary is loopback-only and makes no new live Sankhya
claim. P7 remains the separately bounded live qualification/egress and whole-R2
closure part.

## Independent review

### Fable

Claude Code CLI `2.1.257`, requested alias `fable`, resolved model
`claude-fable-5-1`, effort `xhigh`, read-only plan mode.

- Session `3663a99e-dba7-4486-821a-04be9c7e1698` returned `REVISE` on the
  initial composition candidate `1840a24`. The surviving findings were stale
  TanStack state after nondisclosure/removal and insufficiently firing retry
  and CI controls.
- `ffa42c1` makes Project data usable/renderable only after a successful current
  response and retains one CON-05/07/08 idempotency key for the same human
  attempt. `b7b7b85` binds qualification presentation to the exact current
  revision, server qualification identity and terminal server state.
- Session `db1cf779-adac-473e-be3b-10f883f1ba2f` returned `PASS` on the corrected
  behavior. `1220b3e` only strengthened the recommended qualification fixture
  so the state guard is load-bearing; it changed no reviewed Product behavior.

Lead classification: the initial results were `LOCAL EXECUTION GAP`, corrected
before closure. Final surviving blocker count: zero.

### AGY / Gemini

AGY CLI `1.1.27`, configured `gemini-3.1-pro-high`, effort `high`, isolated plan
and sandbox conversation `082a5708-96b6-404f-9551-88f989dad7ff`. The local DB
records trajectory `e94e4165-940e-4e9d-ab67-3b4af235684d`; its internal model
placeholder does not preserve a separate effort field.

AGY returned `REVISE` with four proposed `LOCAL EXECUTION GAP`s. Lead rejects
all four against the frozen contract and candidate:

1. PRJ-14 does not admit `If-None-Match`; its generated carrier is
   `EXPLICIT_CURRENT_SUBJECT`, and the body already sends exact
   `expectedCurrent: ABSENT|PRESENT`. Adding the proposed header would invent a
   competing wire precondition. PRJ-11 is the distinct operation that uses
   `If-None-Match: *` for confirmed Brain-binding absence.
2. CON-05 and CON-08 create the key before mutation and retain it while the
   same input fingerprint is retried. CON-07 retains `credentialAttemptKey`
   across an ambiguous failure. CON-06 has no idempotency-key contract. The
   report's `reviseConfig`/per-retry description does not match the candidate.
3. The candidate has no `apiKey` state. Its exact `clientId`, `clientSecret`
   and `xToken` fields are cleared in `onSettled`, including failure, and the
   browser proof reopens the editor and observes empty fields.
4. Qualification detail is rendered only when response revision, server
   qualification identity and terminal server state all match. The browser
   proof hides prior `PASSED` output after both CON-06 and CON-07.

The AGY output therefore identifies no reproducible route to a protected-claim
failure in `1220b3e`. Its nominal verdict is retained as Evidence, not silently
rewritten. No rerun is justified because adjudication required no Product or
material implementation correction.

## Deciding proof

```text
npm ci                                      PASS / 336 packages / 2 known low advisories
npx --no-install playwright install chromium PASS
npm run r2:p6:a:postgres                    PASS / 1 of 1 / PostgreSQL 17 / 24.132 s
npm run r2:p6:browser                       PASS / 1 of 1 / real Chromium
R2-P6 production composition                PASS / 1 of 1 / 415.6 s
npm run verify                              PASS
npm run repository:check:extended           PASS / 1182 tracked files
npm run r1:r1c14:native:check               PASS / 31 tests
git diff --check                            PASS
```

The gated production composition used built browser assets, production Hub,
restricted PostgreSQL roles, the production encrypted credential backend and
the admitted OCI Git executor. It traversed 27 method/path requests over the
exact 20 modules, asserted Git blobs/HEAD and final database state, and allowed
provider-shaped traffic only to controlled loopback for companies 1 and 2.

The first clean-root run exposed that the P6 UI build wrote untracked bytes to
`apps/hub/public` before `repository:check`. `9bc9fcb` redirects only the
verification build output to ignored dependency cache. This is a proof-harness
correction: the same production Vite build executes, while the canonical tree
remains clean. It changes neither reviewed behavior nor the deciding composed
proof and does not trigger another independent round.

## Closure and boundary

All P6 protected claims pass and the blocker census is zero. `R2-P6` is
`CLOSED PASS`; `R2-P7` opens under the existing autonomous-through-P7 grant and
the operator's exact authorization for safe read-only use of the configured
real Sankhya system. No credential value may enter chat, Git, logs, output or
Evidence. Push, PR, merge, deploy, ERP writes, R3+ and RB/Mastra remain blocked.
