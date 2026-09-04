# Historical review brief — closed 2026-08-31 R1C-14 Git source custody

> **Status:** `HISTORICAL / SUPERSEDED REVIEW INPUT / DO NOT USE FOR NATIVE READMISSION`
> **Current route:** `docs/evidence/4d/4d-r1-r1c14-native-readmission-review-brief.md`

Act as an independent adversarial reviewer. Read AGENTS.md first. Do not edit,
install, call a provider, commit, push or create a PR. The review subject is a
gate-only qualification, not S3 Product implementation.

Authority:

- `docs/evidence/4f/4f-r1-implementation-slice-plan.md` section 6;
- `docs/evidence/4e/4e-r1-gitinfra-and-bootstrap-correction.md`;
- `docs/evidence/4d/4d-06-r1-foundation-conformance-version-escape-evaluation-contract.md` R1C-14;
- `docs/evidence/4d/4d-r1-operation-reachability-map.md` only where routed;
- `docs/roadmap.md` exact next action.

Review every file under
`qualification/4d/r1-git-source-custody/`, especially the Dockerfile, probe,
admission tests, `evidence/results.json` and `evidence/build-metadata.json`.
Recompute or run read-only checks when useful. Preserve all unrelated state.

Try to falsify:

1. exact Linux Git source/tag/signature/key/binary/image/rootfs/dependency and
   BuildKit provenance custody;
2. whether `NO_RUST`, `NO_TCLTK`, `NO_GETTEXT` preserves every required R1
   capability without an unowned semantic escape;
3. per-Project bare isolation, canonical path denial and no alternates;
4. NEW and local synthetic HTTPS EXISTING_GIT completeness and immutable OID;
5. a genuinely concurrent expected-old-zero CAS with one loser and no retry;
6. caller credential, inherited helper/config, askpass, protocol, destination
   and redirect denial without secret disclosure;
7. complete bundle verify/same-ID restore/fsck and corrupt-pack refusal;
8. cleanup, S2 predecessor custody, zero Product/schema/operation delta;
9. whether any PASS is merely asserted, inconclusive or hidden by aggregation.

Return concise plain text with exactly:

```text
LANE=<actual model>
VERDICT=ACCEPT|REVISE|STOP
MATERIAL_FINDINGS=<integer>
GLOBAL_MAXIMUM=CLEAR|NOT_CLEAR
R1C14=PASS_ADMISSIBLE|NOT_ADMISSIBLE
FINDINGS:
- [severity] exact file:line, falsifier, required correction
```

Use `FINDINGS: - none` only if no material correction remains. Minor clarity
findings must be labeled MINOR and must not be silently promoted to a gate stop.
