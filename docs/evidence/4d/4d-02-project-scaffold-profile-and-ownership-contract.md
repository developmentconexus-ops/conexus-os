# 4D-02 — Project Scaffold/Profile and Ownership Contract

> **Status:** `CLOSED / OPERATOR APPROVED / 2026-08-29`
> **4D closure:** `4D-A CLOSED / 4D-B OPEN FOR PLANNING`
> **Implementation authority:** `BLOCKED`
> **Dependency selection:** `0`
> **Physical directory/package topology:** `NOT SELECTED`

## 1. Decision

**Outcome:** `CURRENT STRUCTURE CONFIRMED / BOUNDED CONTRACT CANDIDATE`.

The smallest sustainable scaffold contract is one immutable Project profile
artifact, compiled deterministically through a mechanics-only boundary into a
staged Project tree, an `OwnershipManifest` and a `GenerationReceipt`.

```text
accepted Project Baseline intent
+ exact immutable profile artifact
+ exact canonical input set
→ deterministic compilation into an isolated staged tree
→ ownership/drift/conflict/conformance checks
→ admitted Project tree + generated receipt Evidence
```

This approved contract closes the semantics needed by `SCF-01..11`. It does not choose
a generator library, template engine, package, version, physical directory tree
or implementation topology. The operator approved it on 2026-08-29; 4D-A is
closed and only 4D-B property-contract planning may now open.

## 2. Evidence and authority

This contract derives from:

1. the accepted Project and Project Baseline owners;
2. the closed canonical 4B wire and ratified P13 handoff;
3. the operator-approved `117`-property ledger, especially `SCF-01..11`;
4. OPP-B05's approved profile-compiler + ownership-manifest architecture;
5. the accepted incremental-value law and first Builder-produced Budget
   Analyzer consumer.

It creates no Product operation, Permission, semantic owner, durable Product
record or application feature. Profile, manifest, compiler and receipt own
mechanics/provenance only.

## 3. Target invariants

```text
one exact Baseline intent
→ one exact profile artifact
→ one canonical input digest
→ one classified staged tree
→ one admitted receipt

every materialized path has exactly one ownership class
generated/protected drift never becomes authority
regeneration never overwrites APP-OWNED source
ordinary app evolution never weakens PLATFORM-CONTRACT invariants
no mutable latest participates in generation or update
failed application never becomes an admitted half-generated state
```

The scaffold remains **infrastructure-rich / Product-feature-poor**. A property
is present only because an admitted consumer needs it now or because an accepted
boundary must remain representable without instantiating dormant machinery.

## 4. Exact protocol identities

The logical contracts have stable schema identities:

```text
conexus.project-scaffold-profile/v1
conexus.project-scaffold-input-set/v1
conexus.project-ownership-manifest/v1
conexus.project-generation-receipt/v1
conexus.project-generation-attempt/v1
```

These are protocol/schema identities, not package names or concrete artifact
versions. A concrete profile is identified by the inseparable tuple:

```text
profileId
+ profileVersion
+ profileDigest
+ generatorProtocolVersion
```

- `profileId` is the stable identity of one profile lineage inside the single
  Conexus Software Factory;
- `profileVersion` is an immutable profile release identity; its ordering and
  compatibility are declared by the profile rather than inferred from a
  package-manager convention;
- `profileDigest` content-addresses the exact admitted profile bytes;
- `generatorProtocolVersion` identifies the compiler protocol the artifact
  requires;
- a version/digest mismatch, unsupported protocol or mutable alias is invalid;
- `latest`, network lookup and ambient installed version never decide output.

`MANAGED | DEDICATED` remains the existing `ApplicationRuntimeProfile` union,
not two factories or automatic conversion. The first admitted consumer uses
`MANAGED`; `DEDICATED` is represented as `PRESERVE_SEAM` and instantiates no
deployment or credential machinery.

## 5. Project Baseline input boundary

The readable Project Baseline remains the Project-owned, incremental statement
of architecture and Product meaning. For a software-publishing Project it must
carry enough scaffold intent to resolve:

```text
applicationRuntimeProfile
scaffoldProfileRef = profileId + profileVersion + profileDigest
generatorProtocolVersion
admittedConsumerRefs
admittedPropertyIds
canonicalInputSetDigest
material extension/escape decisions, when any
```

These are architecture/provenance facts inside the existing Baseline owner;
they do not create a parallel scaffold Product owner. Exact generated receipt
Evidence is pinned **with** the approved Baseline for execution/conformance but
does not enter the Baseline's semantic digest or determine Product meaning.

```text
approved Baseline digest
+ exact GenerationReceipt digest
→ scaffold execution/conformance identity
```

The existing 4B Baseline representation is not changed in 4D-A. 4D-B must
derive whether any of these facts require an additional generated projection;
it may not invent a second handwritten Baseline DTO.

## 6. Canonical generation inputs

`conexus.project-scaffold-input-set/v1` contains only canonical, non-secret,
order-normalized inputs:

| Input | Source/owner | Rule |
| --- | --- | --- |
| exact Baseline scaffold intent | Project | approved/candidate digest and source revision are references, never authorization |
| exact profile artifact | Artifact/provenance mechanics | resolved by identity + digest; artifact owns no Project meaning |
| application runtime profile | Project Baseline | `MANAGED` for the first consumer; `DEDICATED` seam only |
| admitted consumer/property set | 4D ledger + current Project Baseline | closed set; unused future capability is absent |
| canonical Product wire projection ref | 4B and exact operation owners | source digests + projection protocol/digest; generated output cannot self-verify |
| deciding constraint refs | each accepted owner | digest-pinned, provenance-preserving and deny-only |
| app seed intent | Project | optional non-secret initial Product source/config intent that becomes `APP-OWNED` on first admission |
| prior receipt and current tree census | generated Evidence/current Project Git | required for regeneration, upgrade, duplication comparison or rejoin |

Secrets, credentials, runtime tokens, Connection/Brain bindings, current grants,
DB contents, Release/runtime history, clock, randomness, machine paths,
filesystem enumeration order and network-resolved defaults are forbidden
generation inputs.

## 7. Logical topology for the first consumer

4D-A fixes logical responsibilities, not directories or packages:

```text
canonical profile source
generated Product/wire projections
platform-controlled host and extension seams
APP-OWNED Product/application source
generated conformance/constraint/tool projections
generation and ownership Evidence
```

The first profile is consumed by the real `MANAGED` Budget Analyzer path and
therefore admits only the scaffold responsibilities required for:

```text
R1 Project/Baseline foundation
→ RB Builder-created/evolved Project source
→ R3 Project data-path source
→ R4 registered read-only Query source
→ R5 Published Application source
→ R6 exact Release/conformance composition
```

The scaffold includes no Budget Analyzer business feature, screen design,
Sankhya mapping, Product Agent, PAR, AnalyticQuery, external-write path or
effect-capable job. 4D-B must derive the exact mechanics behind each admitted
responsibility before 4D-C may select a package.

## 8. Ownership manifest

Every materialized path is normalized and classified by
`conexus.project-ownership-manifest/v1`:

```text
normalizedPath
class = GENERATED | PLATFORM-CONTRACT | APP-OWNED
sourceRef + sourceDigest where controlled upstream
outputDigest
updateLaw
extensionPointRef when applicable
appOwnershipStartReceipt when APP-OWNED was seeded
```

Path normalization must make separators, relative traversal, case-collision,
Unicode ambiguity and duplicate targets explicit. An ambiguous or overlapping
path stops compilation. The manifest is generated from accepted sources and
owns no semantic meaning.

| Class | Initial materialization | Regeneration/update | Ordinary Builder mutation |
| --- | --- | --- | --- |
| `GENERATED` | exact canonical bytes from exact inputs | replace only from an exact admitted profile after prior-digest validation | forbidden; edit produces drift/refusal |
| `PLATFORM-CONTRACT` | protected seam/default from the profile | only through an admitted versioned migration or exact replacement preserving the invariant | consume only; extend through declared `APP-OWNED` extension points |
| `APP-OWNED` | optional seed, then Project custody begins at admission | preserve byte-for-byte; never implicit merge, overwrite or delete | allowed through current Change/Builder authority |

One physical path cannot be partly owned by multiple classes. Shared meaning is
expressed through a declared interface/manifest relation, not overlapping text
regions or regex ownership.

## 9. Generation and admission

```text
validate Baseline intent, profile, input set and prior receipt when required
→ resolve exact profile bytes by digest without executing them
→ compile in an isolated staged tree
→ normalize deciding bytes and path metadata
→ compile OwnershipManifest and per-path digests
→ compare staged, current and prior-receipt states
→ classify add/change/remove/preserve/conflict
→ preview the complete delta
→ refuse unresolved drift, overlap or unsafe class transition
→ apply as one admitted transition or leave the prior admitted state intact
→ run applicable conformance assertions
→ emit and pin one successful GenerationReceipt
```

A failed attempt emits `conexus.project-generation-attempt/v1` Evidence with
the refusal class and no secret material. It never replaces the last successful
receipt and never makes a partial tree admitted.

The successful receipt contains:

```text
profile identity tuple
compiler identity + protocol version
canonical input set digest
Baseline reference
OwnershipManifest digest
generated and platform tree digests
per-path class/source/output digests
applied migration chain
preserved APP-OWNED path census
zero unresolved conflicts
conformance result identities
```

## 10. Regeneration, upgrade and deletion laws

### 10.1 Same-profile reproduction

Identical admitted inputs must reproduce identical deciding tree and manifest
digests. A pre-existing `GENERATED` or `PLATFORM-CONTRACT` path whose current
digest differs from the prior receipt is drift, not an overwrite invitation.

### 10.2 Profile upgrade

```text
old exact profile + prior receipt + current tree + new exact profile
→ ordered admitted migration chain
→ preview
→ conformance
→ new receipt
```

Upgrade never means “run latest”. Source/target compatibility must be explicit.
A migration cannot silently change ownership class, Product meaning or an
accepted invariant.

### 10.3 Deletion

- `GENERATED` may be removed only when the new exact profile no longer emits it;
- `PLATFORM-CONTRACT` may be removed only by an admitted migration proving the
  invariant is preserved, replaced or legitimately no longer applicable;
- the compiler never deletes `APP-OWNED` content;
- an `APP-OWNED` obstruction produces conflict/escape adjudication, never
  overwrite.

## 11. Extension, eject and rejoin

Extension is the default. A profile-declared extension point names:

```text
extensionPointId
consumed PLATFORM-CONTRACT interface/version
allowed APP-OWNED implementation boundary
protected invariant/constraint refs
conformance assertions
```

Ordinary Product evolution occurs only in the `APP-OWNED` side of that relation.
The platform seam remains the enforcement boundary; an extension cannot grant
authority, add a generic executor or bypass current server checks.

Eject is an explicit, bounded escape-hatch decision, not whole-repository
ownership transfer. It must record in the Project Baseline:

```text
exact unmet property and current consumer
affected path/seam and prior class
why extension is insufficient
replacement APP-OWNED boundary
non-degradable invariants still enforced outside/around it
proof and firing falsifier
upgrade burden and residual risk
removal/rejoin condition
```

No eject is admitted for canonical wire meaning, Conexus authorization,
server-derived binding/destination, Release identity or another owner boundary
unless that smallest owner is first reopened and accepts a replacement. If the
invariant cannot remain enforceable, the result is `STOP`.

Rejoin is an explicit migration from the ejected state to a compatible exact
profile. It previews all ownership transitions, preserves app source unless a
human resolves a named conflict, reruns conformance and emits a new receipt.

## 12. Project duplication

`PRJ-06 DuplicateProject` uses a bounded intent manifest:

```text
source Baseline/profile intent
+ admitted APP-OWNED source/config intent
- credentials and secrets
- Connection/Brain bindings
- Project DB/data
- membership/grants/current authorization
- Release/runtime/run/Evidence history
→ new Project identity and destination Workspace authority
→ fresh deterministic generation from the pinned profile
→ explicit binding, qualification and access decisions
```

The source receipt is Evidence for classification only; it is not copied as the
destination's active receipt. The destination receives a fresh receipt bound to
its own exact inputs. This preserves the accepted `NO DATA` copy policy and does
not widen `PRJ-06`.

## 13. Distributed constraints, skills, hooks and rules

Any repository-local tool rendering that decides Builder context or Project
admission is `GENERATED`:

```text
one canonical profile asset + exact owner/provenance digest
→ same compilation act
→ tool-specific rendering
→ path/source/output digest in the receipt
→ freshness check at every deciding consumption
```

Local edits produce `STALE` and stop that deciding consumer. Renderings may
narrow cognition or admission through accepted deny-only constraints; they
cannot grant authority, accept a Change, certify compliance or become a second
rules owner. Downloading a profile never authorizes executing its tasks, hooks
or migrations.

## 14. Property closure and proof obligations

| Property | 4D-A contract result | Required later firing proof |
| --- | --- | --- |
| `SCF-01` | exact immutable identity tuple and Baseline pin law | wrong digest/protocol/mutable alias refuses |
| `SCF-02` | canonical input/normalization/receipt determinism | two clean reproductions match; hand edit turns red |
| `SCF-03` | protected class + extension-only mutation law | app attempt to weaken seam refuses |
| `SCF-04` | byte-preserving app custody + collision stop | representative regeneration preserves app bytes; overlap refuses |
| `SCF-05` | minimum Baseline scaffold intent + joint receipt proof identity | missing pin blocks admission/reproduction |
| `SCF-06` | admitted-consumer logical topology | unused business feature/property fails census |
| `SCF-07` | bounded duplication intent and fresh receipt | forbidden data/authority/history copy refuses |
| `SCF-08` | one Factory/profile grammar preserves DEDICATED seam only | automatic conversion/inherited capability credential refuses before activation |
| `SCF-09` | fresh digest-pinned generated projection/manifest | changed canonical source or self-verifying output turns red/`STALE` |
| `SCF-10` | source/owner relationships feed minimal affected-set mechanics | missing/extra edge or global invalidation turns red in 4D-B/D |
| `SCF-11` | exact deny-only distributed constraints | stale/widening/wrong-scope constraint stops and cannot grant |

4D-D must make these controls executable and demonstrate every material guard
firing. Documentation presence does not close the proof.

## 15. Strongest challenge

### Challenge A — profile compiler becomes a second Product authority

**Answer:** the profile admits only exact owner references and mechanics. It may
materialize or reject; it cannot invent Product operations, Permissions,
business schemas, access or acceptance.

### Challenge B — three classes are too coarse for real files

**Answer:** each path has one custody law. Cross-class collaboration occurs via
explicit interfaces/extension points. If a real consumer cannot fit without
overlap, that is a material falsifier for this contract, not permission for
mixed ownership.

### Challenge C — preserving app bytes blocks necessary platform migration

**Answer:** the conflict is surfaced before mutation and requires extension,
bounded eject or human-resolved migration. Silent merge is less sustainable
because it can destroy Product source or weaken protected seams.

### Challenge D — exact Baseline/receipt coupling creates duplicate truth

**Answer:** the Baseline owns architecture/Product intent; the receipt proves
one mechanical realization. Execution pins both, but the receipt cannot change
the Baseline or self-approve conformance.

### Challenge E — first profile front-loads the whole platform

**Answer:** admitted properties are consumer-gated. The first logical topology
names R1/RB/R3–R6 consumers and preserves only the DEDICATED seam. Dormant
Product Agent/PAR/effect machinery is absent.

## 16. Decision and reopen triggers

The operator-approved 4D-A outcome is:

```text
CURRENT STRUCTURE CONFIRMED
+ exact schema/provenance identities
+ Baseline input boundary
+ three-class mutation matrix
+ deterministic generation/update/duplication law
+ bounded extension/eject/rejoin law
+ SCF-01..11 proof map
```

Reopen only when material Evidence shows:

- a current Project path cannot have one ownership class;
- a real required update cannot preserve both app custody and platform invariant;
- the accepted Baseline cannot carry the minimum profile intent without a new
  Product operation/record;
- exact duplication cannot preserve `NO DATA` and fresh authority;
- a first real consumer requires topology absent from the admitted property set;
- deterministic reproduction cannot be achieved without an ambient/mutable
  input;
- a non-degradable owner/security/wire/Release invariant cannot survive bounded
  extension or eject.

Package preference, template-engine features, directory aesthetics and
hypothetical multi-team scale are not reopen triggers.

## 17. Approval and downstream route

```text
4D-02 = CLOSED / OPERATOR APPROVED / 2026-08-29
4D-A = CLOSED
4D-B/4D-03 = OPEN FOR PLANNING
exact dependency/package/directory selection = 0
Product implementation authority = 0
```

The next bounded action is to derive the 4D-B/4D-03 backend, frontend, data,
integration and verification property contract from the approved ledger and
this ownership contract. Exact dependency selection belongs later to 4D-C;
Product implementation, push, PR and merge remain unauthorized.
