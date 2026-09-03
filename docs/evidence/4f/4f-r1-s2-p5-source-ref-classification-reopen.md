# S2-P5 source-reference classification reopen

**Scope:** bounded P0-class custody correction after the v3 P5 receipt RED
**Product delta:** none
**Execution boundary:** reissue validation and P0-P4 envelopes only; P5 remains open

## Evidence

The v3 receipt classifier correctly classified `apps/hub/public/**` as `GENERATED`, then reached the next previously masked path and refused `scripts/rebootstrap-r1-s2-v2.mjs` as unclassified. The plan deliberately includes executable lineage artifacts as `sourceRefs`, while the ownership manifest includes every source reference but assigned no class to non-document source references.

## Root cause and invariant

The manifest enumerated `sourceRefs` without giving that declared provenance collection an ownership rule. Every manifest entry must have one unambiguous class. S2 lineage and governance sources are `PLATFORM-CONTRACT`; they are neither generated Product output nor application-owned code.

## Smallest sustainable correction

- Register every `sourceRef` as `PLATFORM-CONTRACT` through the same conflict-refusing class registry used by other exact paths.
- Preserve generated-root precedence only when no conflicting exact class exists.
- Prove executable source references are classified and conflicting ownership still fails closed.
- Archive the exact v3 plan, validation, P0-P4 records, and pre-correction receipt source.
- Reissue validation and P0-P4 envelopes only. Do not synthesize or preserve the invalid v3 P5.

## Stop conditions

Stop on any Product byte change, current digest drift, archive mismatch, source-reference class conflict, envelope payload change, P5 appearance before fresh proof, or reviewer rejection.
