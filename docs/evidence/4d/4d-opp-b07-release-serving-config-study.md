# 4D OPP-B07 — Release, Serving and Configuration Study

> **Status:** `PASS 1 OPERATOR APPROVED / THREE-PLANE COMPOSITION + REAL SERVING PROBE LEADING`
> **Inputs:** C-005, C-013, C-014, C-016, R6, `DAT-06..07`, `REL-01..08`, OPP-B02/B03/B05/B06
> **Research date:** `2026-08-28`
> **Deployment/prototype execution:** `NOT PERFORMED`
> **Implementation authority:** `BLOCKED`

## 1. Decision questions

1. Which artifact and process mechanisms preserve immutable Project Release
   composition on the accepted single-Linux-VM topology?
2. How are Project Release, Hub platform deployment and mutable environment
   state kept separate?
3. What exact proof distinguishes process readiness, pointer activation and real
   `SERVED_VERIFIED` truth?
4. How does functional configuration remain Release-pinned while compatible
   secret rotation stays outside Release bytes?

## 2. Three planes that must not collapse

```text
Project Release plane
→ immutable Project bundles/query/job/Brain/binding/config/proof composition
→ content-addressed Project artifacts
→ active Project/environment Release pointer

Platform deployment plane
→ exact Hub/Keycloak/PostgreSQL/service-manager binaries and configuration
→ process lifecycle/readiness

Mutable environment plane
→ databases, credential material, runtime state, active pointer and current qualification
```

A Project Promotion is not a container deployment. A Hub deployment is not a
Project Release, and process readiness is not `SERVED_VERIFIED`.

## 3. Project artifact and serving architecture

### Local content-addressed store

The accepted first topology already includes local Artifact/Blob/CAS backing and
Hub/MAR direct serving. The smallest current realization stores immutable
Project artifacts under content digests and closes the exact set into the
ReleaseManifest.

Required mechanics:

- hash canonical artifact bytes before admission;
- write to a staging path, verify length/digest, then publish without exposing a
  partial blob;
- reject a different byte sequence for an existing digest;
- keep ReleaseManifest closure free of circular self-hash;
- serve only artifacts reachable from the current authorized Project/environment
  Release, never from possession of a path or digest alone;
- include the CAS and Release closure in off-host recovery Evidence;
- garbage collection may remove only blobs proven unreachable from every
  retained owner root and recovery hold.

Object storage, MinIO or a remote registry becomes relevant when scale,
availability or multi-host distribution falsifies local CAS. It is not needed
for optionality alone.

**Disposition:** `LOCAL CAS LEADING FOR FIRST INSTALLATION / STORAGE IMPLEMENTATION NOT SELECTED`.

### OCI artifacts

OCI image manifests/config/layers are content-addressed by descriptors and
digests and include target OS/architecture. OCI is a strong format for the Hub
deployment artifact and for imported external service images.

OCI image identity does not prove runtime configuration, signature, database
conformance, active Project Release or served Project bytes. Project Release
bundles should not be forced into one container per Project.

**Disposition:** `LEADING HUB PACKAGING CANDIDATE / NOT PROJECT RELEASE IDENTITY`.

## 4. Platform process alternatives

### A — native immutable Hub bundle + systemd

Systemd is already available in the accepted Linux guest class and provides
direct service supervision, restart policy, hardening, credential-file
injection and `Type=notify` readiness. It adds no application orchestrator or
control plane.

Required adaptation:

- `ExecStart` references one immutable versioned deployment directory/digest;
- a separately controlled current symlink/unit drop-in may switch only after
  artifact verification and configuration preflight;
- non-root dedicated identity, bounded filesystem/network/capability access and
  read-only application paths;
- credentials supplied as protected files/`LoadCredential`-class inputs rather
  than command line or ordinary environment where supported;
- Hub sends readiness only after startup config, DB, migrations and required
  local dependencies satisfy their exact startup contract;
- bounded SIGTERM drain stops new admission, resolves/cancels owned work safely
  and exits before the service-manager timeout;
- watchdog/liveness proves process responsiveness only.

**Disposition:** `LEADING MINIMUM PROCESS-SUPERVISION CANDIDATE`.

### B — OCI images + Docker Compose

Compose can pin images by digest, define services/networks/volumes, healthchecks,
configs/secrets and restart behavior. It can package Hub, Keycloak and supporting
services reproducibly on one host.

Costs and limits:

- adds daemon/runtime/network/volume lifecycle and its own upgrade surface;
- `build` or pull-by-tag during activation would violate exact admission;
- healthcheck execution is delegated to the container engine and proves only
  the declared check;
- configs/secrets and bind mounts remain external mutable inputs;
- Compose reconciliation or healthy containers do not prove Project
  `SERVED_VERIFIED`;
- publishing Compose with environment values risks binding or secret leakage.

**Disposition:** `STRONG SINGLE-HOST PACKAGING CHALLENGER / REAL OPERATIONS PROBE REQUIRED`.

### C — Podman/Quadlet

Systemd-native OCI lifecycle, daemonless/rootless options and unit-level
hardening are strategically attractive. It remains a challenger until exact
host support, Keycloak/PostgreSQL operation, upgrade and recovery Evidence are
compared with A/B.

**Disposition:** `STRATEGIC CHALLENGER / BOUNDED PROBE`.

### D — Kubernetes/Nomad

Their scheduling, rollout, service-discovery and policy surfaces do not improve
the accepted single-VM/no-HA first installation enough to justify another
control plane.

**Disposition:** `REJECT CURRENT F1 / REOPEN ON MULTI-HOST OR HA CONSUMER`.

### E — PM2 or application-level process manager

Duplicates system service supervision while providing no stronger Release,
credential, hardening or served-composition proof.

**Disposition:** `REJECT CURRENT F1`.

## 5. Configuration contract

```text
Release-pinned configContractDigest
→ slot names, type, scope and requiredness
→ non-secret functional values
→ exact logical environment/binding references
→ compatibility and reload/restart law

external credential/config resolution
→ secret handle + current compatible secret version
→ platform deployment values
→ host/network/storage identities
```

Rules:

- one schema-validated configuration snapshot is resolved before readiness and
  recorded by safe digest/provenance;
- environment variables, files, systemd credentials, Compose secrets or a
  future secret service are transports, never configuration authority;
- unknown fields, missing required slots, wrong types or forbidden environment/
  binding combinations fail before readiness;
- secret plaintext never enters source, image, ReleaseManifest, receipt, logs,
  process arguments or browser;
- compatible secret rotation re-resolves the same slot without rebuilding the
  Project Release; incompatible contract change requires revalidation/new
  Release;
- dynamic reload is admitted per slot only when atomicity, rollback and consumer
  behavior are proved; restart is the honest default.

No generic dynamic-configuration service is required for F1.

## 6. EnvironmentConformance

The target snapshot must cover the actual non-production environment used by R6:

```text
platform deployment artifact/process identity
+ Node/runtime and target OS/architecture
+ PostgreSQL major, roles, databases and connectivity boundaries
+ migration ledger/checksums/schema fingerprints
+ exact Project artifact availability and ReleaseManifest closure
+ configContractDigest + safe resolved configuration digest
+ required binding/qualification identities and credential resolvability
+ ingress/TLS/session/Published-App authorization prerequisites
+ MAR/Gateway readiness required by the composed Release
```

Conformance is fresh Evidence over the real target. A cached desired-state file
or healthy process cannot substitute for it.

## 7. Promotion and activation protocol

```text
authorize exact actor/Project/environment/Release
→ recheck current admitted proof
→ read expected current pointer/generation
→ acquire Release-owner conflicting guard before material work
→ verify target EnvironmentConformance
→ execute admitted migration branch/recovery gate when required
→ recheck proof + conformance affected by material work
→ CAS active pointer from expected generation to exact Release
→ persist POINTER_SWAPPED, not success
→ perform independent real serving probe
→ persist SERVED_VERIFIED only on exact match
```

The concurrent loser performs no DDL, drain or pointer effect. A retry inspects
actual migration/pointer/served state and continues idempotently; it does not
blindly replay.

Rollback is another governed Promotion to an eligible Release. It is forbidden
when current schema/config compatibility cannot be proved; forward fix or
validated recovery remains the exit.

## 8. Real serving verification

Process health and internal CAS lookup are insufficient. The verifier uses the
same caller-addressable, authenticated Published-App ingress and authorization
path required by the Product.

Leading protocol:

```text
fresh authorized verification session/request
→ resolve exact Project + environment through normal ingress
→ read non-cached entry/bootstrap response
→ obtain server-issued active Release/manifest coordinate
→ retrieve exact entry and content-addressed assets
→ hash bytes and compare with ReleaseManifest artifact closure
→ execute one bounded Release-pinned safe runtime/query smoke probe when applicable
→ verify response/runtime coordinate matches the same Release
→ persist servingVerification Evidence subject to exact pointer generation
```

Requirements:

- server derives the Release coordinate; caller cannot select a hidden stale
  Release and call that current;
- mutable entry/bootstrap responses are no-cache or use exact pointer-aware
  validators; content-addressed assets may be immutable-cached;
- a stale cache returning HTTP 200 fails;
- guessed asset path/digest without current app authorization fails;
- pointer change during verification invalidates the result and requires a new
  probe;
- verification failure does not rewrite history or silently re-enable an
  incompatible prior Release.

`SERVED_VERIFIED` remains Release owner truth derived from qualified Evidence;
the health endpoint, proxy, container engine and verifier own no Release state.

## 9. Required falsifiers

1. `B07-P1`: mutated/partial CAS bytes cannot be admitted under an existing digest.
2. `B07-P2`: Project Release and Hub deployment identities cannot substitute for each other.
3. `B07-P3`: tag/latest, build-at-activation or mutable artifact alias fails admission.
4. `B07-P4`: secret plaintext is absent from artifact, manifest, config digest, logs, argv and response.
5. `B07-P5`: missing/wrong/unknown config or incompatible secret slot fails before readiness.
6. `B07-P6`: healthy process/container without target conformance cannot promote.
7. `B07-P7`: concurrent Promotion loser performs zero migration/drain/pointer effect.
8. `B07-P8`: pointer swap or HTTP 200 alone cannot produce `SERVED_VERIFIED`.
9. `B07-P9`: stale/wrong entry or asset bytes through real ingress make serving verification fail.
10. `B07-P10`: guessed digest/path without current Published-App authorization is denied.
11. `B07-P11`: pointer generation changing during the serving probe invalidates Evidence.
12. `B07-P12`: incompatible schema/config blocks rollback to an old Release.
13. `B07-P13`: bounded shutdown stops new admission and leaves no falsely successful owner work.
14. `B07-P14`: recovery/restart begins unverified and must re-establish conformance and real serving proof.

## 10. Pass-1 outcome

```text
OPP-B07 PASS 1 = OPERATOR APPROVED
Project Release / platform deployment / mutable environment = THREE DISTINCT PLANES
local content-addressed Project artifact store = LEADING FIRST-INSTALLATION SHAPE
OCI image digest = LEADING HUB PACKAGING CANDIDATE / NOT PROJECT RELEASE
systemd = LEADING MINIMUM PROCESS-SUPERVISION CANDIDATE
Docker Compose = STRONG SINGLE-HOST PACKAGING CHALLENGER
Podman/Quadlet = STRATEGIC CHALLENGER
Kubernetes/Nomad = REJECT CURRENT F1
PM2 = REJECT CURRENT F1
schema-validated startup snapshot + secret-handle separation = LEADING CONFIG SHAPE
real authenticated ingress/byte/runtime probe = REQUIRED FOR SERVED_VERIFIED
exact artifact store/process manager/container runtime/config schema = 0
Product implementation authority = 0
```
