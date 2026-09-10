# BLD-10 Preview corrected candidate result manifest

> **Status:** FROZEN REVIEW CANDIDATE / corrected after graph-and-glue review; no edits after this manifest was created
> **Base:** `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`
> **Review subject:** BLD-10 projection, proof coverage and routed authority

This manifest binds the second independent review to the current dirty
worktree. Tracked edits are represented by the binary diff digest; untracked
paths are represented by their exact bytes below. A change to any listed path
invalidates this candidate and requires a new manifest and review.

```text
tracked git diff --binary sha256
95fa4abe98509855403686acd39645081be94a82991f07c71dfa4be60813ee7f
```

| Path | SHA-256 |
| --- | --- |
| `apps/hub/migrations/023_rb_builder_preview_subject.sql` | `849357f4daf7254ca7c7a2d487989cde75b45a130eb75ab72b84fbd37eabaf4f` |
| `apps/hub/src/builder/preview.ts` | `07c046c3fcc66c3c608299f32a10e11db3b7de5bcca09bf5f3ae1ff1bd46f118` |
| `tests/implementation/bld-10-preview.test.mjs` | `be4ba3f52671b4abc59b0be2a203d9d1d8241172497bc742e3bf348993bf8ef0` |
| `tests/implementation/rb-builder-first-vertical.test.mjs` | `4a4fa88098ac3b919edd3bb7d87a62f84d6fe511600f1674617afbc7987de649` |
| `tests/repository/conexus-verify.test.mjs` | `8429e9b7d89a7cddeca02fe064e942da202afcf18b8192ba88a157576ca35c8f` |
| `docs/evidence/4f/4f-autonomous-roadmap-execution-goal.md` | `ed92de61252c9a7c20e377081930c9e0a81c844c5df362b833d20daf2c9bee80` |
| `docs/evidence/4f/4f-bld-10-preview-stage-code-packet.md` | `7629f68a9662c8cc7f03db447fde0a29b1be6e40577ada36e1d00d301e6f1da9` |
| `docs/evidence/4f/4f-bld-10-preview-independent-review-brief.md` | `f53075dd4d0cd2e6f35c4bed079010125ab1cbd64d07de2a8a224662433bf4dc` |
| `docs/evidence/4f/4f-bld-10-preview-final-review-brief.md` | `3d44c1a5fd931133c9bc4a2901ff846d77c4fc591abeb1f73e7fc2022d826126` |
| `tests/implementation/rb-builder-browser.test.mjs` | `e2d81bd2f31d7f4ef267906c201081f99609dd1258398d869797e6f250bae321` |
| `tests/implementation/rb-builder-first-vertical.test.mjs` | `0a756a0f77b1cd6c0cf3771c390f85a7db461b856d532cd4eefa094687a443b8` |

The review must inspect the current repository independently and treat this
file as a candidate binding, not as an authority verdict. The operator and Lead
adjudicate all findings.
