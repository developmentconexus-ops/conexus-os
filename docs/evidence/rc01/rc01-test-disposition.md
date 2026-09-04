# RC-01 nominal-test disposition

The handoff reported `24` failures but retained neither TAP output nor the six
missing test identities. Fresh pre-correction execution of the preserved working
tree produced `317` tests with `18` failures. RC-01 will not invent the absent
six names. Every current test remains present, and the final nominal suite is
the deciding current census.

| # | Observed test or retained historical slot | Protected claim / owner | Classification | Disposition |
| ---: | --- | --- | --- | --- |
| 1 | closed 3N verifier admits operator-authorized 3O CLOSED | Architecture phase sequencing; roadmap + 3N verifier | SUPERSEDED_STATUS_PROJECTION | Conditionalized the old Product-block assertion after 3N/3O/C-018 closure. |
| 2 | GF-01 lock | Locked frontend artifact identity; 4C Evidence | SUPERSEDED_STATUS_PROJECTION | Shared roadmap helper now admits bounded R1 after 4C closure; lock digest remains enforced. |
| 3 | P-01 app-first | P-01 locked interaction truth; 4C Evidence | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; Product assertion preserved. |
| 4 | P-01 F14/P7 | P-01 evidence continuity | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; exact artifact assertions preserved. |
| 5 | P-01 density | P-01 locked density | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; exact artifact assertions preserved. |
| 6 | P-01 baseline/F05 | P-01/F05 continuity | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; exact artifact assertions preserved. |
| 7 | P-01 shell | P-01 shell identity | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; exact artifact assertions preserved. |
| 8 | P-01 P7 historical | P-01 historical/current separation | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; historical identity remains checked. |
| 9 | W-01 lock | W-01 locked interaction truth | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; lock digest remains enforced. |
| 10 | W-02 authority preflight | W-02 authority feasibility | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; authority assertions remain enforced. |
| 11 | W-02A lock | W-02A locked interaction truth | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; lock digest remains enforced. |
| 12 | W-02B lock | W-02B locked interaction truth | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; lock digest remains enforced. |
| 13 | W-03 lock | W-03 locked interaction truth | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; lock digest remains enforced. |
| 14 | W-04 lock | W-04 locked interaction truth | SUPERSEDED_STATUS_PROJECTION | Same shared-helper correction; lock digest remains enforced. |
| 15 | compressed Phase-4 program | Current phase/tranche projection; roadmap | SUPERSEDED_STATUS_PROJECTION | Replaced pre-implementation Product block with bounded R1 and later-tranche block. |
| 16 | current 3N architecture verification | Closed architecture and bounded implementation gate | SUPERSEDED_STATUS_PROJECTION | Product stays blocked only until 3N, 3O and C-018 are closed. |
| 17 | closed 3N admits C-018 | C-018 sequencing | SUPERSEDED_STATUS_PROJECTION | Same conditional architecture-gate correction. |
| 18 | ratified C-018 deny-law | C-018 and implementation gate | SUPERSEDED_STATUS_PROJECTION | Replaced eternal deny with bounded R1 admission and R2/RB deny. |
| 19 | historical handoff slot H19 | No retained test identity or output | UNKNOWN | Not deleted or guessed; current full census covers all extant controls. |
| 20 | historical handoff slot H20 | No retained test identity or output | UNKNOWN | Not deleted or guessed; current full census covers all extant controls. |
| 21 | historical handoff slot H21 | No retained test identity or output | UNKNOWN | Not deleted or guessed; current full census covers all extant controls. |
| 22 | historical handoff slot H22 | No retained test identity or output | UNKNOWN | Not deleted or guessed; current full census covers all extant controls. |
| 23 | historical handoff slot H23 | No retained test identity or output | UNKNOWN | Not deleted or guessed; current full census covers all extant controls. |
| 24 | historical handoff slot H24 | No retained test identity or output | UNKNOWN | Not deleted or guessed; current full census covers all extant controls. |

Root cause for all 18 reproduced failures was status projection, not a Product,
architecture, wire or locked-artifact defect. The correction is deliberately
small: current invariants remain active, while historical “Product must remain
blocked forever” assertions no longer override the operator-opened bounded R1
tranche. The six unknown historical identities remain a disclosed provenance
limitation, not a manufactured PASS.

## Additional diagnostic dispositions

These commands remain available but are not members of the current S6/RC-01
deciding proof set:

| Command | Classification | Exact disposition |
| --- | --- | --- |
| `npm run r1:g0:verify` | `SUPERSEDED_STATUS_PROJECTION` | Retains the pre-project-cognition root dependency equality and therefore rejects the operator-authorized Mastra/Anthropic/Zod adoption. The admitted successor is `npm run r1:a0:g0:verify`; the owning truth is `docs/evidence/4f/4f-r1-s6-final-closure-stage-packet.md`. |
| `npm run r1:s1:verify` | `HISTORICAL_EXTENDED_PROOF` | Replays the superseded A0 source digest/convention. The S6 closure owner explicitly does not require replaying historical S1–S5 receipts merely for assurance. |
| `npm run r1:s4:p2:check` | `HISTORICAL_EXTENDED_PROOF` | Asserts the pre-S6 exact six-route census and rejects authorized `PRJ-07`/`PRJ-24`. The current S4 PostgreSQL regression remains in the deciding proof set. |

Their source and tests are retained. Their exclusion from CI removes stale
status/census projection only; it does not convert a failed claim into a pass.
