# 4D(R1) — R1C-14 native readmission v12 review adjudication

> **Status:** `DIVERGENCE ADJUDICATED / CORRECTED IN v13 / GATE STILL OPEN`
> **Reviewed subject:** `v12 / result b108a08866fae4eb53bf6bbf66095bb93ae591f55387db9d4a9da1215754ef48`
> **Successor candidate:** `v13 / result 7af1dac74117f02fd3c87d6dc11f6fcbbd19c930287e1b83b7927c227dc09940`

## Independent lanes retained byte-exact

- Claude Code CLI `2.1.220`, requested model `opus`, resolved model
  `claude-opus-5`, effort `xhigh`, plan/read-only, session
  `f093731e-61ed-4dec-962a-fa3a37cb94ce`; retained wrapper
  `qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v12/review/opus-review-result.json`,
  SHA-256 `b1c5c95bb0c9eb4c4adab22d72afd57d5eb153bb9bab77d21302a0b98caec875`,
  raw verdict `REVISE BEFORE RECEIPT`.
- AGY CLI `1.1.23`, model `gemini-3.1-pro-high`, effort `high`, plan plus
  sandbox, conversation `bc7c84f2-f872-4971-ad67-c1c90b72a865`; retained
  wrapper
  `qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v12/review/gemini-review-result.json`,
  SHA-256 `c10dc9550ec65c60cd43bfa28949939dae78be39cb9c9d0bd0525cdbebc86939`,
  raw verdict `REVISE BEFORE RECEIPT`.

The lanes were fresh and independent. The Lead adjudicated each counterexample
against repository-current authority; raw reviewer disposition remains Evidence
and is not rewritten into an `ACCEPT` vote.

## Opus dispositions

| Finding | Lead disposition | v13 correction / boundary |
| --- | --- | --- |
| MF-1 raw reviewer verdict encoded as gate authority | accepted | lane files and raw verdicts are provenance; a digest-bound Lead adjudication with zero surviving findings owns closure |
| LEG-1 receipt pinned to superseded v11 | accepted; receipt stopped | path derives from `manifest.evidence.resultPath`; firing unit proves current-directory derivation |
| LEG-2 required CI would fail after PASS | accepted; receipt stopped | premature-publication refusal uses a synthetic CANDIDATE manifest and remains valid after real closure |
| LEG-3 output digest was a free string | accepted; receipt stopped | exact wrapper files are retained, hashed and structurally cross-checked to lane/tool/model/session/version/raw verdict |
| LEG-4 live rejected indices omitted | accepted for S3-P0 | both resolvable rejected indices are forbidden identities and mandatory live RED controls; platform manifest remains corroborating-only |
| LEG-5 brief pin disabled at PASS | accepted | brief digest is enforced in CANDIDATE and PASS states |
| LEG-6 double-decode/query locator class reachable | accepted | decode-to-closure plus residual `%`, empty segment and caller-query refusal; 12/12 admission suite |
| LEG-7 untracked repository/image custody | `DEFER_SAFE`, not a readmission defect | roadmap expressly withholds commit/export; receipt now states local-worktree provenance only, pending operator custody, and pending-actions retains exact revisit triggers |

Minor observations were also challenged. The finalizer test now takes expected
check IDs from the manifest rather than its candidate fixture. Intermediate
symlink custody and partial `.tmp-*` candidate directories have firing
refusals. Broad historical finalizer input aliases remain unchanged because the
exact current runner passes one closed shape and no reachable false promotion
was shown; removing compatible parsing would add churn without strengthening
the current invariant.

## Gemini dispositions

Both Gemini findings depend on the claim that Docker `.Id` must always be one
configuration digest. That premise is false in the exact deciding Docker Engine
`29.7.2` runtime:

```text
tag, default inspect    = sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851
tag, linux/amd64        = sha256:5c4c1731bb91b227c26ab40efd8298a8a9b3a3f8a5a40642d65817d581a72276
index, default inspect  = sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851
docker run exact index  = git version 2.55.0
```

Therefore the alleged impossible v12 proof is `NO FINDING`, and the alleged
S3 index/config conflation is `NO FINDING`. The observation becomes a bounded
runtime compatibility constraint: S3-P0 must prove these semantics on its exact
deciding Docker version and fail closed elsewhere; it does not replace the
binding identity.

## Boundary

No finding changes Product meaning, owner, Permission or schema. v13 retains the
same admitted OCI/Git identity, 17/17 proof controls, Product delta 0 and secret
contamination 0/334. Because material closure and locator properties changed,
fresh independent review is required. No receipt, S3 Product byte, commit,
push, PR, merge, provider call or external publication is authorized here.
