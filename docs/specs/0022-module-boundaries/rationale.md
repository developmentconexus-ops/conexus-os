# 0022. Rationale for explicit module ownership

## Context

The baseline's native import law passes all 35 owner-to-owner file edges by special-case exceptions. Architecture §5 says public module constructors are the boundary, while the checker forbids most of those imports and permits selected internals. Seven domain files sit in a technical directory available to every owner. The registry's nominal sealed value has an exported abstract constructor that permits subclassing; its WeakMap closes that hole only at runtime.

The accepted investigations correctly identified the structural conflict. Two premises needed correction. The shared sealed value is necessary because validation precedes runner preparation and retention follows it. Removing the shared value would change that sequence. The slug file's table names are comments, not queries. A focused SQL AST census also finds authorization reads outside admission.ts, so a blanket "IAM admission exception" would miss current real behavior.

## Options considered

### Strict composition-only imports and generic consumer ports

This keeps every owner unaware of another owner's types. It would require changing actual proof, manifest, recipe and artifact consumers to generic parameters or shared copies. The current private guide and checker mismatch arose partly from that pressure. It moves meaning out of owners or makes types less useful. Existing generic hosting proof ports remain useful; rewriting all contracts as generics is unnecessary.

### Package manifests and a separate boundary framework

The inherited references describe named interfaces and declared dependencies in much larger modular systems. Separate manifests, package declarations, link/query layers and a new framework would introduce several machine owners beside the native checkers. No current consumer needs independent installation or separate deployments. The existing checker already discovers source roots, resolves TypeScript imports and checks cycles. Extending it is sufficient.

### Named owner interfaces and existing native checks

Explicit pure/shared interfaces live beside their producers, and module construction remains in composition. The existing checker owns the inventory and rejects unknown owners. SQL access follows the same boundary through operations on the admitted transaction. The registry keeps its own hidden nominal class and payload WeakMap. This deletes existing placement and exemption problems without a new runtime.

A `public.ts` interface alongside `module.ts` intentionally differs from a single barrel exporting every constructor and implementation. The sandbox's application-check bundle needs only pure policies and manifest definitions. Loading Hub composition or provider/database machinery through that barrel would be a regression. Better Auth's named package interfaces supply a current reference for this distinction; exact entry declarations keep its export set small. The implementation must prove the actual bundle, not assume tree shaking removes unwanted dependencies.

## Recommendation and acceptance boundary

Recommend named owner interfaces and existing native checks. Keep admission, held-run source/owner checks, lock order, one-statement served snapshots and transaction atomicity. Replace platform domain placement, subclassable sealed values, contradictory import rules and ordinary cross-owner SQL. Delete the seven old platform entries, obsolete file carve-outs, duplicated registry contracts and superseded SQL projections after all their callers move.

Technical acceptance is pending. The worker does not approve this proposal. The planning session may accept it under the task's delegated technical scope; product decisions and merges remain outside that delegation.

Preview pointer relocation is later Q5 work. Registry's run/source verification is later run-proof work. Each becomes a precise, stale-checked temporary dependency rather than being silently removed or swallowed into a Builder redesign. This boundary wave must leave the later migration smaller and named, not claim those issues solved.

## Evidence and limits

Baseline `3233c0d19a8106d4f2ba8142a81779c5b6ceac46`, Node 24.20.0, npm 12.0.2, TypeScript 6.0.2 and unchanged package-lock. Preflight and import law pass. The rerun of the inherited census gives 35 owner file edges and zero cycles. A native SQL tagged-template probe gives 240 registered relation occurrences and 32 cross-owner occurrences; comment and literal controls confirm the slug false positive is removed.

A compiler-host overlay and actual Rolldown bundle exercised the native seal with the proposed hidden class and real consumers. Construction/inheritance/field-copy compile negatives, canonical digest, copied-value runtime refusal, wrong-run refusal and immutable visible fields pass. The public shape also runs the native seal and uses actual platform.sql; libpg-query 17.7.4 parses its bound query. These do not prove final transaction behavior or final entry-graph completeness. Unit cards require the real PostgreSQL race and scope tests when those operations move.

No live provider, real E2B, shared database or production service was used. Baseline proof receipts remain outside the public repository. Unaffected historical evidence is reused only when its exact head and command are identified.

## References

The index's reference table identifies newly audited commits and file lines. The inherited Medusa/Packwerk/Spring/Backstage/Effect/Twenty study citations are marked unaudited rather than reproduced as current proof. Conexus architecture §5/11, database §5/6, security §2, code §1/2/4/5/7 and testing §1/4/6 govern the retained invariants. Delivery's native unit-map and complete CI-impact rules govern closure.
