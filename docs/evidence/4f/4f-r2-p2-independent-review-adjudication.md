# 4F(R2) — P2 independent review adjudication

> **Reviewed implementation:** `025339096af65d19a7aa9bd07892262367cc6644`
> **Frozen review envelope:** `09d5d4407bc9a1afe2bdacce49938e5b31d55c16`
> **Correction implementation:** `b4fae5c5211cc096cff8567591186a6d6ba6768d`
> **Lead disposition:** `BOUNDED CORRECTION / P2 CLEAR AFTER PROOF`

## Independent lanes

Both successful lanes were fresh and received the same candidate manifest and
neutral brief without receiving one another's output.

```text
Fable
  Claude Code      2.1.257
  requested alias  fable / xhigh / plan/read-only
  resolved model   claude-fable-5-1
  session          78538899-aee8-4d30-b92f-86b8e6a389a0
  raw verdict      REVISE

AGY
  CLI              1.1.26
  requested model  gemini-3.1-pro-high / high / plan+sandbox
  resolved label   Gemini 3.1 Pro (High)
  conversation     a308ca09-bdcd-4bf8-8b81-92382e673058
  raw verdict      CLEAR
```

Two earlier AGY invocations were canceled before producing a review because
headless permissions denied repository reading and then a diagnostic command.
They are not review Evidence and no verdict is inferred from them. The local AGY
configuration now retains only the added WSL repository read admission; the
temporary broad command admission was removed after the successful sandboxed
lane.

## Lead adjudication

1. **PRODUCT / PLAN GAP / CORRECTED:** accepted pre-R2 authority said later
   permissions cannot be inferred from creator status. The operator had
   explicitly approved the P2 `brain.read` semantics: default false; exact
   pre-R2 creator backfill; exact future WS-01 creator grant; independent later
   revocation. `docs/product/permission-contract.md` now records this as the
   first-consumer successor transition. Admission consults only the independent
   `can_read_brain` fact, never `can_create_project`; the two facts remain
   independently revocable. No generic admin bundle or additional Permission
   is inferred.
2. **LOCAL EXECUTION GAP / CORRECTED:** the admission function now distinguishes
   membership presence from the independent capability without exposing either
   table. Non-member or nonexistent Workspace returns the contract's 404 class;
   a member lacking `brain.read` returns 403. PostgreSQL and HTTP RED/GREEN proof
   cover all three states before any Registry/Brain disclosure.
3. **LOCAL EXECUTION GAP / CORRECTED:** the packet did not preserve an explicit
   P2 mutation ceiling before implementation. The closure section records the
   actual bounded paths and proof strategy. More importantly, P3 is explicitly
   opened with its exact ceiling and falsifiers before any P3 implementation;
   recurrence is a method blocker.
4. **LOCAL EXECUTION GAP / DEFER SAFELY:** `BRN-02?forProjectId` remains an exact
   fail-closed transitional refusal. Why safe: it performs no DB access and
   discloses neither Brain nor Project truth. Revisit trigger: P4 begins the
   Project Brain binding vertical. Later owner: P4 must implement the accepted
   `project.manage + brain.bind` purpose-bound summary disclosure and delete the
   transitional problem path. F18 and generic `brain.read` remain closed.
5. **LOCAL EXECUTION GAP / CORRECTED:** the exact post-correction real Git proof
   is durably recorded below and in the stage packet: `npm run r2:p2:live`
   passed on clean correction commit `b4fae5c`, using the admitted Git OCI and
   PostgreSQL 17.10, in `208291.54476ms`. It exercised the production CLI,
   concurrent entrypoints, pending recovery, hardlink/ref/alternates falsifiers
   and all four production routes over a synthetic non-production Brain.
6. **NO FINDING / TRIGGER RETAINED:** migration 011 may change while the complete
   unintegrated R2 stage is formed because no integrated R2 database exists and
   every prior P1/P2 database was disposable clean-bootstrap proof. Once 011 is
   pushed or merged, later evolution must use a new migration rather than
   rewriting integrated bytes.

The remaining Fable notes are non-findings: duplicate structural port types,
P2-local synthetic-content lint and cross-database/shared-root misconfiguration.
They neither falsify the frozen claims nor justify a new abstraction or review
round.

## Deciding correction proof

```text
npm run r2:p2:check                               PASS
npm run r2:p2:postgres                            PASS / PostgreSQL 17.10
npm run r2:p2:live                                PASS / 208291.54476ms
migration 011 sha256                              b7ab508a6a8c6c7c61c371b868fe6ca7b863221a244978d2b82ece08342f0b98
Atlas 1.3.0 hash                                  h1:6DhFZb8lc5B1aw9YoeCtEZF4Ik1n2XXql1y5AKh3ctg=
```

No second independent round is justified. The authority correction records the
already approved behavior; the HTTP correction narrows disclosure while
preserving the challenged default-deny/owner-isolation property; the live rerun
proves the corrected production path. Neither correction changes the frozen
Brain/Git/Registry/health architecture that both lanes challenged.

P2 may close only after the correction commit and this adjudication pass clean
`npm test`, `npm run verify`, `npm run verify:extended` and
`npm run conexus:preflight`. Reviewer outputs remain Evidence, not authority.
