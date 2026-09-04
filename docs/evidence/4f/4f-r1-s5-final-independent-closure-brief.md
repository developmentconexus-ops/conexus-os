# 4F(R1) S5 — Final independent closure brief

> **Mode:** fresh isolated read-only closure lanes
> **Candidate:** current working tree after the bounded native transition-reason correction
> **Authority:** Evidence only; reviewers edit no files and create no Product authority

## 1. Question and exact candidate

Decide whether S5 may close over the already-realized S1..S4 browser surface
without weakening the previously closed native R1C-14 successor. Inspect the
current working tree, with primary scope limited to:

- `docs/evidence/4f/4f-r1-s5-browser-hardening-candidate.md`;
- `apps/hub/src/http/app.ts`;
- `apps/web/src/app/shell.tsx`, the realized route components and
  `apps/web/src/styles.css` named by that packet;
- `tests/implementation/r1-s5-browser-boundary.test.mjs` and
  `tests/implementation/r1-s5-browser-hardening.test.mjs`;
- the `r1:s5:*` scripts in `package.json`;
- `scripts/record-r1c14-native-readmission-receipt.mjs`, only for the bounded
  transition-reason correction recorded in packet section 8.

Repository authority is `AGENTS.md`, `docs/roadmap.md`, `docs/index.md`,
Engineering Method 1.1, the 4F implementation slice plan S5 row and the locked
T-01/GF-01/W-01 Screen Contracts. Do not treat chat or this brief as Product
authority.

## 2. Frozen protected claims

Stop closure only for a reproducible route to failure of one of these claims:

1. every realized route refetches server truth and preserves exactly the four
   admitted client-state classes;
2. Chromium 1234, Firefox 1538 and WebKit 2336 run the same isolated wide/narrow,
   focus, reduced-motion, authority and command matrix from the exact admitted
   Playwright/Node image boundary;
3. deep-link SPA serving, Helmet headers and secret-free production bundles fail
   closed without `/api/*` HTML fallback;
4. forged URL/cache/storage state, narrowed session authority and synchronous
   double activation cannot disclose, promote or duplicate Product effects;
5. no Product operation, table, generated transport or Product meaning changed;
6. native R1C-14 keeps exact OCI identity, false-PASS resistance, zero Product
   delta, secret non-disclosure, historical Evidence and receipt integrity;
7. the transition correction only classifies current S5 changes to inherited
   paths and does not relax custody membership, digest comparison or PASS rules.

Blocked scope remains cognition/R1C-13, provider/model Product calls, production
effects, Product-app scope, external custody/publication, commit, push, PR and
merge.

## 3. Deciding proof to reconstruct

The Lead observed:

- `npm run r1:s5:p0:check`: 5/5 PASS plus Hub/Web typechecks;
- `npm run r1:s5:p1:browser`: isolated Chromium, Firefox and WebKit processes
  completed with exit 0; each engine reports its same behavioral subtest PASS;
- `npm run r1:s3:p6:check`: 17 PASS, one intentionally skipped live proof;
- `npm run r1:s4:p2:check`: 10/10 PASS;
- `npm run r1:s2:import-law`: 26/26 PASS;
- `npm ci`: 191 packages installed, 192 audited, zero vulnerabilities;
- `npm run verify`: PASS with the pre-existing Redocly warnings;
- initial native regression: 30/31 PASS, failing closed because four S5 inherited
  paths lacked transition reasons;
- after the bounded correction: native suite 31/31 PASS and manifest 17/17 PASS,
  preserving OCI index
  `sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`
  and result SHA-256
  `d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6`.

Reviewers may run read-only inspection and tests but must not install, edit,
invoke another reviewer, call Product/providers, use credentials, operate
production/external custody or perform Git mutations.

## 4. Required output

Return one concise JSON object with:

```json
{
  "verdict": "PASS | REVISE | STOP",
  "protectedClaims": [{"claim": "...", "result": "PASS | FAIL", "evidence": "..."}],
  "findings": [{"id": "...", "classification": "METHOD FINDING | PRODUCT / PLAN GAP | LOCAL EXECUTION GAP | NO FINDING", "material": true, "evidence": "...", "smallestOwner": "..."}],
  "unresolvedMaterialFindings": 0
}
```

Do not propose optional framework/recovery hardening as a blocker. Identify it
separately as non-material with a concrete revisit trigger if useful. Do not
expand the protected-claim census, recursively review the review framework or
infer permission for R1C-13/S6.
