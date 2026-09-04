# 4F(R1) — S2 P0 closed-path custody reopen

> **Disposition:** `P0-CLASS REOPEN AUTHORIZED / V2 PROTOCOL SELECTED`
> **Scope:** custody metadata and bootstrap controls only
> **Product mutation:** zero

## Falsifier and root cause

The first P5 recording attempt deterministically failed with
`S2_PART_CLOSED_PATH_DRIFT:tests/repository/import-law.test.mjs`. That path
was legitimately owned first by S2-P2 and later by S2-P4. The original
recorder compared the live P4 bytes against every historical record,
including the superseded P2 digest, instead of comparing once against the
latest authorized owner.

The failure exposed a second bootstrap limitation. The original P0 validator
was deliberately one-shot: after Product materialization, A0-owned changed
paths must remain classified as changed, while baseline validation still
requires their pre-S2 digests. A corrected recorder therefore changes the
plan digest, but the original validation cannot be truthfully regenerated
against either an invented baseline or reverted Product bytes.

The operator authorized a bounded P0-class reopen. No Product meaning,
operation, Permission, schema, table, role, runtime behavior or external
effect is reopened.

## Preserved v1 lineage

The exact pre-reopen subject is preserved under
`docs/evidence/4f/s2-p0-reopen-v1/`:

- plan `980790152d983621e78690265d7345531396702f5b64049eac111adf0de97e11`;
- validation `e7332714d2a414396ebb7845307056432322274abed41b1d2a1eb4f38973f405`;
- P0 `61512d399523266fa36964d04e724b082a1d681439f869e98c00a4043bde8618`;
- P1 `7ad337d036a547cb4024739cf5f05e9f88a920f2bc5678335551c687ec8fc26c`;
- P2 `80ef42bc89f4e97d931f24ee5d92687fd60f2abc963da65900bfcd09aaa27d89`;
- P3 `be2957335d46b81e4dbdf97e2473e07dfb49379e8b9ace3acc04707a13786ca7`;
- P4 `3ec04c1f60bfc121cad751ca014da60c081d9d8f93200f47576d32d118a787cf`.

The archive also carries byte-exact base64 copies and SHA-256 digests of the
three sealed bootstrap sources corrected by v2. Every archive path is outside
the runtime custody roots and is pinned once as a source reference; it is not
given a second ownership disposition. The translator additionally embeds the
eight historical archive digests as independent mechanical anchors, so a
self-consistent rewrite of both archive and live v1 files is refused.

## Selected v2 protocol

The smallest sustainable correction has three sealed bootstrap changes:

1. the plan schema admits `currentDigest` and `currentTreeDigest`;
2. the validator runs the JSON Schema as a standing guard and admits current
   bytes only when a different, digest-pinned prior validation and its exact
   plan are present;
3. the part recorder folds historical records into one path-to-latest-owner
   map before checking closed-path drift.

All materialized exact paths and generated roots carry current digests. For
P0–P4 paths those digests must equal the latest legitimate v1 part record.
The only derivable carve-out is a path whose existing `mutationWindows`
contains S2-P5; this covers the in-flight implementation result, roadmap and
index bytes reviewed as the P5 subject and creates no hand-maintained escape
list.

`scripts/rebootstrap-r1-s2-v2.mjs` is a digest-pinned, one-shot source
reference, not a standing bootstrap tool. It proves the permitted field-level
plan delta, validates the archived chain and current tree, then translates
P0–P4 by changing only `planDigest`, `validationDigest` and
`previousPartPassDigest`. Historical `affectedPaths`, proofs and review
records pass through byte-objectively. A rerunnable assertion compares every
translated record with its archived counterpart after removing exactly those
three envelope fields.

Translation stages every new canonical record through fsynced temporary files
beside the preserved Evidence, outside every custody root. It keeps exact v1
backups there until all runtime-root post-checks pass and restores those
backups after a failed or interrupted attempt. No mixed P0–P4 envelope is
accepted, and no transient filename is exempted from runtime custody.

Fresh review turns in the established Opus session
`b7ea0a6d-1d04-4dd2-9a7e-462c9ee9c257` and Gemini Pro conversation
`8ccc7b09-0b3f-4b56-a084-b6d024aa6447` attest the v2 validation and
translation envelope. The translator refuses any other session pair. The
inherited P0–P4 review fields remain historical attestations of
their original subjects; they are not represented as fresh Product reviews.
The canonical Lane 1 label remains the operator-ratified legacy
`Claude Code Fable`, while its session identifies the actual Opus lane.

## Proof and stop law

The reopen stops if any of the following is true:

- v2 differs from v1 outside the three bootstrap digests, added current
  digests and added source references;
- an adopted non-P5 path differs from its latest historical owner;
- the P5 carve-out is enumerated instead of derived from mutation windows;
- schema/plan divergence survives validation;
- a translated part changes anything outside its three envelope fields;
- a synthetic post-owner drift does not fire
  `S2_PART_CLOSED_PATH_DRIFT`;
- any G0, S1 or A0 receipt changes;
- P5, conformance, manifest and receipt cannot publish in receipt-last order.

The v2 lineage is a custody re-issue of the same exact S2 Product delta. S3,
R1C-14, cognition/R1C-13, provider calls, commit, push, PR and merge remain
outside this correction.
