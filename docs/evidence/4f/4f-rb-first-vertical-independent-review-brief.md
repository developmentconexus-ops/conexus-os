# RB first Builder vertical — independent implementation challenge

## Subject and authority

Repository: `https://github.com/developmentconexus-ops/conexus-os.git`.
Exact implementation candidate: `c3e8c3b` on `rb-builder-first-vertical`.
Implementation comparison base: `89c47b6f14b9e08146de378ba31784a97b9ea0f3`.
This brief and later adjudication-only commits are not additional implementation.
This is a material diff challenge, not merge, deployment or Change acceptance.

Reconstruct `AGENTS.md`, the current roadmap/index, applicable Engineering and
Repository methods, Blueprint Harness §§10.4–10.6 and the RB first-vertical
stage-code packet. Current repository authority supersedes this orientation.
R1 and R2 are integrated and must not be casually reopened. The operator
authorized the first observable RB vertical; R3 and later Builder/Product-Agent
work remain inactive.

## Protected claims and falsifiers

- BLD-03 creates one durable Change pinned to the exact approved Baseline/source
  and derives only the minimum DIRECT/CONTROLLED Plan, CodingSession and WorkUnit.
- One Change lineage has one serial writer. Hub/Builder state is authoritative:
  worker narration, model output and sandbox completion cannot settle work.
- Coding uses Mastra native coding-agent mechanics only through the Conexus-owned
  `CodingWorkerRuntime` and one explicitly created remote E2B sandbox. There is
  no implicit/local fallback or replacement-incarnation replay.
- Guest material contains source only: no Hub database, owner-state, arbitrary
  secret, provider credential or Git remote write authority. Network egress is
  denied and the source remote is removed before coding.
- Project/Change/WorkUnit/ActorRun/admission-token/base/sandbox identities are
  revalidated. Revoked/stale/late/replaced output fails durably; it cannot settle
  current work.
- Hub uses the admitted OCI Git capability to validate one exact descendant
  commit, protected paths and bounded diff before writing only a private Change
  result ref. Canonical `main` remains unchanged.
- `project.build` and `project.source.read` are explicit revocable IAM facts,
  initially derived only from the completed PRJ-03 creator receipt, never from
  `can_manage`. Runtime roles receive functions and no direct owner-table access.
- The ordinary Project Build surface lets a human create a Change and inspect
  current Plan/progress/result/diff without exposing Mastra/E2B/ActorRun as the
  primary experience or implying candidate acceptance.
- Existing import law, R1/R2 behavior, migration custody and required wire
  contracts remain intact.

A reproducible violation of these properties, an owner/contract contradiction,
or a false-PASS route is material. Preference, future runtime breadth, missing
ACP/private MCP/eval infrastructure, or lack of a second ceremony is not.

## Proof reconstruction and explicit unknowns

Lead used Linux Node 24.20.0/npm 12.0.2 and ran: `npm ci`; Playwright Chromium
installation; `npm run verify`; `npm run rb:first:check`; and
`npm run r1:r1c14:native:check`, all GREEN after the final candidate. The RB
suite includes real Chromium, production-module orchestration negatives and a
real PostgreSQL 17 migration/role/late-output-quarantine proof. Import-law RED
controls are green. Existing OpenAPI warnings remain non-blocking and unchanged.

No E2B or model credential was present in the session, so no live external coding
run is claimed. Inspect whether that is a truthful bounded proof gap or exposes a
concrete false-PASS/capability defect. Do not invoke providers, start containers,
edit files, publish branches or perform any external write from this review.

## Output and limits

Use Blueprint §10.6 classes: `METHOD FINDING`, `PRODUCT / PLAN GAP`, `LOCAL
EXECUTION GAP`, or `NO FINDING`. Every finding must give exact evidence,
reproducible failure path, materiality, smallest owner/stage, protected invariant,
stop scope, required correction and what must not reopen. Distinguish an unproven
live property from a code defect. Review the whole candidate independently; do
not consult the other lane. Lead adjudicates all output. Reviewers cannot accept
RB, merge, deploy, or expand the authorized slice.
