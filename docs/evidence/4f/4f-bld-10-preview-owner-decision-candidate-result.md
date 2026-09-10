# BLD-10 approved-Baseline closure candidate manifest

> **Status:** FROZEN REVIEW CANDIDATE / no edits after this manifest
> **Base:** `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`
> **Review subject:** BLD-10 approved-Baseline decision closure, projection proof and routed authority

This manifest binds the fresh dual-lane review to the current dirty worktree.
Tracked edits are represented by the binary diff digest; each listed candidate
path is represented by its exact bytes below. The verification receipt is
intentionally excluded because it records this frozen candidate's digest after
the graph runs. A change to any listed path invalidates this candidate and
requires a new manifest and review.

Scope classification for this candidate is explicit. The migration, Builder
projection/routes/store, Web Build surface, BLD-10/RB tests and the routed
4F decision/evidence documents are **in-subject** implementation, authority or
proof bytes. The `package.json` `rb:first:check` command, the `web-build` leaf
in `scripts/conexus-verify.mjs`, and its repository assertion are **out-of-
subject mechanical verification-profile bytes**: they use the explicit local
Vite binary so this pinned Linux graph has a deterministic executable, while
preserving the same build, leaf identity and scope. They carry no Product or
contract meaning and are included only because the deciding candidate graph
must execute them; this rationale is part of the candidate binding.

```text
tracked git diff --binary sha256
fe7b0f4a0befc968426ec192f184923c9f945360bdc1f170bbc1d1d655446dc0
```

| Path | SHA-256 |
| --- | --- |
| `apps/hub/migrations/023_rb_builder_preview_subject.sql` | `849357f4daf7254ca7c7a2d487989cde75b45a130eb75ab72b84fbd37eabaf4f` |
| `apps/hub/src/builder/preview.ts` | `07c046c3fcc66c3c608299f32a10e11db3b7de5bcca09bf5f3ae1ff1bd46f118` |
| `docs/evidence/4f/4f-autonomous-roadmap-execution-goal.md` | `ed92de61252c9a7c20e377081930c9e0a81c844c5df362b833d20daf2c9bee80` |
| `docs/evidence/4f/4f-bld-10-current-subject-owner-decision-packet.md` | `caa23edefcd956874a3359e133837333811ee09ca9fbfdb794ed7acf986c9745` |
| `docs/evidence/4f/4f-bld-10-preview-candidate-result.md` | `c16ee5f8fce4a9ff9c91791af863b7df7fb1b31cdfc3c423d101d306c38b8173` |
| `docs/evidence/4f/4f-bld-10-preview-final-review-brief.md` | `3d44c1a5fd931133c9bc4a2901ff846d77c4fc591abeb1f73e7fc2022d826126` |
| `docs/evidence/4f/4f-bld-10-preview-independent-review-brief.md` | `f53075dd4d0cd2e6f35c4bed079010125ab1cbd64d07de2a8a224662433bf4dc` |
| `docs/evidence/4f/4f-bld-10-preview-owner-decision-closure-review-brief.md` | `f76db5c771fcad8e1fde7c6f9b2498d38657989b30c7c4c03a1b07e476fae3a8` |
| `docs/evidence/4f/4f-bld-10-4c-f15-owner-requalification-preparation.md` | `f60e54303430459fef00aaf3673d1e16a7141930347d0637f1e75c92380957d3` |
| `docs/evidence/4f/4f-bld-10-4c-f15-owner-disposition.md` | `083522690018ffd29f0b8fbbae644741e0f6ce65f43ba137b5b812feeed4a515` |
| `docs/evidence/4f/4f-bld-10-preview-stage-code-packet.md` | `d5ad8ece57257e488bdf15e265d39865f49e0c8c3b963f75a4ff01e3e56ac283` |
| `docs/evidence/4f/4f-bld-10-gpt6-astra-advisor-receipt.md` | `e25cc9d60aabca9008b8092741fed4b263993a8db894a022d3617beee5ea2240` |
| `docs/evidence/4f/4f-r3-admission-preparation.md` | `1102788c8de5dc55a7bf76f538846a1ee3e9bc21fab36f55e5f233d925b7790b` |
| `tests/implementation/bld-10-preview.test.mjs` | `79de2741f36704c9f25c247ad4eb8e3a6f5c063192c405e212724a852982ce2f` |
| `apps/web/src/features/builder/components/project-build.tsx` | `196ac383b909eb8b5c2f437b2fab53e9f8ffd1f9c53dcc4ba237df3e411d167c` |
| `package.json` | `123b9cc156a7cd9f6137d41bb4f728f0fe5710e6b19702703661d9e2a60d4c73` |
| `tests/implementation/rb-builder-first-vertical.test.mjs` | `049804481e09ab3ab7e9bd2d1e9357775a398b9447c68e817486b3e4ba0fbddc` |
| `tests/implementation/rb-builder-browser.test.mjs` | `3c8aa259cd67185cefc65c79c722aaae1786437f593c9924df5819267135dbfd` |

The review must inspect the current repository independently and treat this
file as a candidate binding, not an authority verdict. The operator and Lead
adjudicate all findings.
