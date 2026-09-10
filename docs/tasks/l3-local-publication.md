# L3 — Local publication and versions task plan

## Goal and design

Publish an exact app version locally, let its authorized users use it without
Builder access, and continue development while the published version remains
stable. Registry, Release, Project, Identity & Access and MAR keep their accepted
ownership. Local publication is still distinct from Preview and from public
`conexus.fun` activation.

**Design:** [approved delivery design](../roadmap.md#approved-local-platform-delivery-design).
Status and grants belong only to the roadmap. Contract/file detail is frozen
in L3.1 before an implementation increment is admitted.

## Required context and existing source

- [Release/operations](../reference/release-deployment-and-operations.md),
  [MAR serving](../reference/managed-execution.md),
  [security](../reference/security-and-authority.md),
  [Release wire](../../contracts/api/product/release-paths.yaml),
  [operations and caller grammar](../product/operation-ledger.md).
- [L1](l1-local-build-preview.md) artifact and serving seams;
  [L2](l2-app-data-sdk.md) data/runtime declarations.
- Inspect `apps/hub/src/registry/{module,store}.ts`,
  `apps/hub/src/server.ts`, `apps/hub/src/identity-access/`,
  `apps/hub/src/platform/config.ts` and generated contract consumers.
  Existing Registry/Preview code is not evidence of a full Release executor.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Already decided / precise reading | Remaining question and expected output |
| --- | --- | --- |
| L3.1–2 release | [C-005](../decisions/index.md); [Release owner](../reference/release-deployment-and-operations.md), §§12.1–12.6; [Release wire](../../contracts/api/product/release-paths.yaml), PromoteRelease/GetProjectServingState | Immutable exact composition and served verification are fixed. Select the concrete producer/target/conditional activation and bind existing operation identities |
| L3.1 access | [security owner](../reference/security-and-authority.md), §§34.1–34.3; [MAR](../reference/managed-execution.md), §27.1 | Close app-session and local-origin realization; do not treat Preview permission as app access |
| L3.3 evolution | [Release owner](../reference/release-deployment-and-operations.md), §§13.1 and 16.1–16.4 | Determine actual data compatibility for rollback and failed promotion; produce a recovery test bound to those migrations |
| L3 comparison | [Mitra influence](../research/mitra/influence-on-conexus.md), opening §§5–6 | Preserve useful version/serving visibility. Conexus §13.1 defines environments within one logical Project, so do not copy the historical Mitra production-Project fork pattern |

Use current browser/HTTP/server documentation when selecting local session and
origin mechanics, checked against installed packages/configuration. The
accepted security boundaries are requirements; framework defaults are evidence
to verify. Remote/public ingress research belongs to its later activation
consumer unless it reveals a concrete local-origin contradiction.

## Implementation work breakdown

### L3.1 — Close composition and local serving contract

- [ ] Trace exact app/query/action/job/Brain/Connection revisions actually
  instantiated by the app into the accepted Release manifest; absent optional
  kinds do not require dormant runtime implementation.
- [ ] Select concrete Release/Promotion and MAR implementation files, local
  target/origin configuration, environment conformance, caller contracts and
  proof commands in this packet. Preserve current authorization on promotion.
- [ ] Close app access/session and DEV/published database boundaries, including
  runtime capabilities from L2. Share serving mechanics with L1 only where
  Preview and Published App identity/authorization remain distinct.
- [ ] Select exact candidate receipt inputs; retained R3 aggregate output
  cannot establish current Release proof. Record the execution grant in roadmap.

### L3.2 — Publish and inspect the exact version

- [ ] Produce immutable release artifacts from the verified candidate, apply
  target conformance and switch serving only under the accepted preconditions.
- [ ] Verify actual served bytes/runtime against the intended composition
  before reporting `SERVED_VERIFIED`; neither rebuild-on-serve nor mutable latest
  may replace the exact published result.
- [ ] Wire Versions/Promotion/serving status and app-access administration to
  the existing Product interaction. A user without Project build/source access
  must still be able to use an app when its independent app access permits it.

### L3.3 — Evolve and recover a published application

- [ ] Build a second candidate without replacing the published version; promote
  it deliberately and show which version is served throughout.
- [ ] Exercise failed promotion, stale authorization and an exact eligible
  rollback. Data migrations follow the existing compatibility/forward-repair
  laws; rollback is not a promise to reverse committed business data.
- [ ] Demonstrate that denied app access, missing bytes, invalid conformance
  and stale proofs cannot become successful serving.

## Proof, completion and follow-on

Exit requires two exact app versions, independent app access, observed promotion
and verified served identity, with failure/authorization tests on real local
composition. Reuse contract/browser proof only for its actual named claims;
L3.1 must identify additional test files and commands before code begins.
Apply the roadmap's full candidate verification/review requirements at closure.

Produces serving/Release authority for L4 external operations and L5 jobs.
Public domain ingress and first-production activation are separate follow-on
work. Their recovery/identity obligations remain at the operations owner;
real local side effects still carry their own applicable protections.
