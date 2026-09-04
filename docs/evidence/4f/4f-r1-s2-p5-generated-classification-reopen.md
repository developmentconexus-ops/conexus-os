# 4F(R1) — S2 P5 generated-root classification reopen

> **Disposition:** P0-CLASS V3 REISSUE AUTHORIZED BY CONTINUING AUTONOMOUS S2 GRANT
> **Scope:** receipt classification and part-history census only
> **Product mutation:** zero

## Reachable falsifier

The first v2 P5 conformance attempt stopped before writing any conformance,
manifest or receipt:

    S2_RECEIPT_UNCLASSIFIED:apps/hub/public/assets/index-6QHdMXqc.js

The plan correctly owns apps/hub/public as one GENERATED root and binds its
tree digest. The receipt builder walks that root but its class map contains
only exact paths from A0 and the S2 exact-path collections. It therefore has
no classification for a new content-hashed descendant. This branch was latent
in A0, whose plan had no generated root, and became reachable only when S2 P5
first attempted to build the final manifest.

Listing bundler outputs individually is refused: it duplicates the generated
root authority, couples the plan to content-hashed filenames and still changes
the plan digest. An unpinned wrapper or hand-authored manifest is custody
laundering. The only truthful route is a bounded v3 reissue.

## Preserved v2 lineage

docs/evidence/4f/s2-p5-reopen-v2/ preserves byte-exact P0–P5 part records.
Its canonical lineage bundle preserves the v2 plan
8e56ed30c85a201196a03b56b221332660d7d4fe246b537893d1e08d384051b1,
validation
50caa32f0f79e9fd7da85cdb2842d8fc5e0cf65ce72990d3fff46e91d44d605f,
pre-fix receipt recorder, pre-v3 part recorder and the exact v2 translator.
The v3 translator hard-pins the bundle plus all six part-record digests before
parsing them.

The older v1 archive and v2 adoption evidence remain byte-pinned by the plan.
No G0, S1 or A0 artifact changes.

## Exact correction

The receipt classifier derives generated ownership from plan.generatedRoots.
One descendant may match at most one root. A conflicting exact class is
refused; an inherited exact GENERATED entry from the prior manifest is
coherent. Every generated descendant is emitted as GENERATED, never
PLATFORM-CONTRACT or APP-OWNED.

The part recorder selects archived records whose planDigest equals the current
validation's reissue.previousPlanDigest and whose part strictly precedes the
part being recorded. This permits all six v2 parts to remain standing source
references while P5 compares only P0–P4 and is freshly recorded with the
current custody protocol.

The current custody suite proves normal generated classification and the RED
cases for an absent root disposition and overlapping generated roots. Its new
digest replaces the prior P5 S2:CUSTODY binding. Product/runtime/migration
proof subjects are unchanged; only cheap deterministic qualification is
repeated. PostgreSQL, Keycloak/Chromium live and migration protocols retain
their already qualified digests because no subject byte changed.

## V3 translation and stop law

scripts/rebootstrap-r1-s2-v3.mjs is a digest-pinned one-shot source reference.
It permits exactly two changed bootstrap digests, added v2 lineage/evidence
references and no movement in any currentDigest/currentTreeDigest. It
translates P0–P4 envelopes only, removes the v2 P5 record through the same
recoverable transaction, and leaves P5 to the corrected standing recorder.

Stop if any of these is true:

- v3 differs from v2 outside the two bootstrap digests and added source refs;
- any adopted exact or generated digest moves;
- any v2 archive digest or payload changes;
- P0–P4 translation changes anything outside the three envelope fields;
- P5 retains the old custody protocol digest;
- generated-root overlap or missing classification does not fire;
- a generated descendant is emitted under a non-generated class;
- conformance, manifest or receipt exists before the corrected sequence;
- any prior receipt changes or receipt-last publication fails.

R1C-14/S3, cognition/R1C-13, provider calls, commit, push, PR and merge remain
outside this correction.
