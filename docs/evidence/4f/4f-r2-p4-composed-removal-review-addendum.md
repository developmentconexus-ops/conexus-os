# 4F(R2) — P4 composed removal/resolver review addendum

> **Mode:** continuity addendum in the same two isolated read-only lanes
> **Combined comparison base:** `e3ec7bdd296966e939ddd1e588bd5fc100b41f89`
> **Implementation candidate:** `b5e58a4140afc3c1646fd59db4ecdfa6dd28dd2d`
> **Omitted implementation:** `479c62c817902fa84236a3efab370afaa67fa40f`
> **Prior resolver brief:** `docs/evidence/4f/4f-r2-p4-subject-resolver-independent-review-brief.md`
> **State:** `COMBINED-PACKAGE COVERAGE INCOMPLETE / ADDENDUM PENDING`
> **Authority:** reviewer output is Evidence; Lead adjudication owns acceptance

## Why this addendum exists

The prior brief compared the trusted subject resolver against `f25d48e`, which
already contained the PRJ-12 implementation. Roadmap and the stage packet require
the composed resolver/removal package to receive independent challenge before
acceptance. Complete that missing coverage without repeating the already
challenged resolver scope.

Resume only your own prior isolated session. Do not inspect or infer another
lane's output. Preserve your prior independent observations. Reopen a resolver
property only if inspecting the omitted removal slice exposes a concrete
composition falsifier.

## Exact added review question

Challenge `e3ec7bd..b5e58a4` as one composed P4 package, focusing on PRJ-12
implementation commit `479c62c` and its interaction with the trusted resolver.
Determine whether clearing a current Project Brain binding is an exact,
authorized, delete-only, recoverable narrowing operation and whether removal,
pending intents, cancellation, restart or source movement can leave BRN-14 or
the conformance resolver observing a falsely authoritative subject.

## Additional protected claims and falsifiers

1. **Exact narrowing authority:** PRJ-12 requires authenticated current Project
   membership/direct `project.manage`, exact current binding and required
   `If-Match`; it does not require surviving `brain.bind`, `connection.use`,
   Brain health, conformance or provider availability.
2. **One absent representation:** clear means the canonical
   `.conexus/project/brain-binding.json` is absent. The Git child is deterministic
   and delete-only, carries no replacement bytes, deletes no APP-owned or other
   platform path and preserves every other tree entry.
3. **Current concordance:** before creating removal intent, current Git source,
   database source revision, binding row and exact declaration digest agree.
   Missing, mismatched or stale state refuses without mutation.
4. **Atomic settlement and CAS:** only the frozen exact intent/child can delete
   the exact current binding and advance the Project source revision atomically.
   Unknown Git outcomes, retries, competing work and restarts cannot report false
   success, settle a different child or destroy the prior authoritative state.
5. **Cancellation and historical safety:** cancellation before database
   settlement preserves the prior binding/source. Historical intents,
   attestations and unreachable Git objects never become current authority.
6. **Post-removal composition:** after successful removal PRJ-10 has no current
   binding, BRN-14 is `NOT_FOUND`, and the trusted key-conformance resolver cannot
   return an authoritative subject. Pending removal or source drift cannot yield
   a positive observation.
7. **Cumulative custody and privilege:** migration `016` preserves prior bytes,
   role isolation and table/function boundaries; migration `017` and its role do
   not reopen a deletion or settlement bypass. The composed proof labels real
   PostgreSQL/OCI Git truth honestly and makes no live Sankhya/provider claim.
8. **Scope preservation:** no production activation, credential use, arbitrary
   Git mutation, query registration, live observer, push, PR, merge or P5+ work.

Inspect migration `016`, `atlas.sum`, Project binding/recovery/Git execution,
route/module composition, migration runner and the deciding removal/recovery/
composed tests. Inspect migration `017` or resolver code only for the named
interaction above. Use the authority bootstrap, restrictions and finding classes
from the prior brief and repository methods.

Lead Evidence already recorded in current authority: real PostgreSQL migration
`4/4`, Brain settlement `3/3`, real OCI Git deletion/replay `1/1` in `370.0 s`,
composed PostgreSQL/OCI post-Git crash/restart `1/1` in `418.1 s`, and clean root
`npm run verify`. Treat those as Lead-reported Evidence unless independently
reconstructable read-only; do not run Docker, mutate state or access secrets.

## Addendum output contract

Return exactly one combined-package verdict: `CLEAR`, `REVISE` or `STOP`. For
each new or changed finding provide the existing classification, exact file/line
evidence, reproducible failure path, violated protected claim, smallest
correction and scope that must not reopen. Mark non-blockers `DEFER SAFELY` with
why-safe, revisit trigger and owner. State whether the added removal/composition
inspection changes any of your prior resolver findings. Do not compare lanes or
recommend another review unless a material correction changes a protected
property or deciding proof.
