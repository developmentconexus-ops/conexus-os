# 4D(RB-C1) — Builder runtime mechanical and live-E2B probe grant request

> **Status:** `REQUEST ONLY / DO NOT EXECUTE / CURRENT AUTHORIZATION STATUS OWNED ONLY BY docs/roadmap.md`
> **Depends on:** corrected RB-C0 independent review and operator adjudication
> **Product implementation authority:** `NONE`

## 1. Requested outcome

Authorize one bounded qualification-only probe of the exact
[`RB-C0 pin manifest`](4d-rb-c0-candidate-pin-manifest.json) and
[`probe design`](4d-rb-c0-worker-eval-and-probe-design.md). The probe answers
only whether the pinned dependency, executable, ACP adapter and guarded E2B
mechanics can satisfy `RB-C1-P01..P19`.

This request deliberately excludes real coding-model/provider calls and the
comparative Worker Eval. Those require a later, separately costed RB-C2 grant.

## 2. Exact requested mutation envelope

The future RB-C1 agent may create or modify only:

```text
qualification/4d/rb-builder-runtime/**
docs/evidence/4d/4d-rb-c1-builder-runtime-probe-result.md
docs/evidence/4d/4d-rb-c1-dependency-admission-receipt.json
docs/evidence/4d/4d-rb-c0-candidate-pin-manifest-rb-c1-successor.json
docs/index.md
docs/roadmap.md
```

The root `package.json`, root `package-lock.json`, Product/runtime/application
source, contracts, migrations, accepted owner documents and historical
qualification Evidence are read-only. A qualification-local package manifest
and lock do not install or admit Product dependencies.

## 3. Exact requested external inputs and effects

If granted, authorize only:

- read/download of the exact registry tarballs and npm attestations named in the
  RB-C0 manifest;
- read/query of npm registry metadata and time-stamped OSV records for the exact
  qualification lock;
- download of GitHub release asset ID `541770555`,
  `opencode-linux-x64.tar.gz` from immutable release `v1.18.27`, only if its
  SHA-256 is
  `4af5494f9433f59db8c1e344198f0ee72a50c06ec009fb4a8aeab4c2d4abd702`;
- one E2B template build using only
  `docker.io/library/node@sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2`
  plus the versioned qualification template source;
- at most eight E2B sandbox creations, concurrency one, each with a ten-minute
  timeout and an aggregate sixty-minute sandbox ceiling;
- E2B create, connect-by-exact-ID, command, pause/resume only where the named
  lifecycle test requires it, kill/destroy and metadata APIs;
- deterministic local fake-ACP process execution;
- upload of the verified OpenCode executable bytes to one of the authorized
  dedicated E2B sandboxes, followed by one version/ACP-handshake check inside
  that sandbox with no task prompt or provider credential; and
- one bounded control-side ACP byte relay to that exact sandbox process, with
  no control-plane executable fallback.

All created sandboxes must disable guest internet access and public traffic and
must be killed/destroyed at the end or recorded as a cleanup failure. The one
template and every sandbox ID are Evidence, not reusable production resources.
Every E2B mutation, reconnect, pause, command, kill and destroy call must target
an ID created and recorded by the exact RB-C1 run. Pre-existing, foreign,
historical or unrecorded account resources are read-only and must be refused
before mutation; discovery must not convert them into fallback targets.

## 4. Credential boundary

Only an operator-supplied E2B credential is requested. It remains in the
control-side process environment, is never written to repository Evidence and
is never forwarded to the guest. The launcher allowlist may contain only the
minimum OS process fields, exact qualification paths and the one E2B credential
needed by the host adapter.

No OpenAI, Anthropic, Google, OpenCode-provider, GitHub write, Sankhya, database,
deployment or production credential is authorized. The probe must fail closed
if any provider/model credential is present in the ACP child or E2B guest. The
future credential-bearing challenger topology remains unresolved and is not an
RB-C1 claim.

## 5. Install and acquisition policy

1. generate the qualification-local candidate lock without touching the root;
2. inspect the proposed lock, registries, Git dependencies and script-bearing
   packages;
3. run the clean locked install with lifecycle scripts disabled;
4. do not enable a script unless it is individually named, justified and added
   to the grant before execution;
5. do not use `npx`, `curl | sh`, a package install script or the OpenCode npm
   wrapper to acquire/execute the challenger;
6. download the exact immutable GitHub asset, verify SHA-256 before extraction
   and record the extracted executable SHA-256 without executing it locally;
7. upload the verified executable to the exact dedicated E2B sandbox and run
   only `--version` and the bounded no-prompt ACP handshake there;
8. the control-side relay may transport ACP bytes only for the exact run and
   physical `sandboxId`; it cannot spawn or fall back to a local executable;
9. the RB-C1 ACP client advertises no control-plane filesystem or terminal
   capability and denies every agent-to-client action request; and
10. treat signature, attestation, SBOM, license and advisory results as separate
   Evidence; none alone produces admission.

## 6. Required proof and stop conditions

The probe must implement and fire every `RB-C1-P01..P19` positive and negative
case in the RB-C0 design. It stops without widening when:

- a package/version, source, registry, integrity, executable or protocol
  identity differs from the manifest;
- an unexpected lifecycle script or Git dependency appears;
- a denied family, unadjudicated license, applicable advisory or invalid
  signature/provenance identity appears;
- the OpenCode asset digest differs or source-to-binary risk cannot be bounded;
- any path attempts to start the OpenCode executable on the control plane;
- the exact E2B base image/template cannot be materialized without fallback;
- guest egress/public traffic or credential isolation cannot be enforced;
- a dead/replaced sandbox receives a replayed write or continuation silently
  changes `sandboxId`;
- ACP permission, environment, malformed-message, cancellation or late-output
  controls do not fail closed;
- the ACP relay can cross run/physical-incarnation boundaries, loses explicit
  EOF/backpressure/cancel semantics or admits a local-executable fallback;
- the ACP client advertises or executes any control-plane filesystem, terminal
  or other agent-requested action;
- an E2B operation targets any template or sandbox ID not created and recorded
  by the exact RB-C1 run;
- any requested action requires a model/provider call, Product mutation,
  external input not named here or a larger external-effect ceiling.

A stop is an honest `FAIL`, `NOT_PROVEN` or blocker, not permission to substitute
a nearby version or mechanism.

## 7. Explicit exclusions

This request does not authorize:

- any real provider/model prompt, completion, embedding, evaluation or coding
  run;
- RB-C2 Worker Eval or candidate selection;
- Product code, root dependency, contract, database or migration changes;
- browser, real database, Git write/custody, Sankhya or production proof;
- any OpenCode executable instruction on the Conexus control plane;
- any provider credential in the E2B guest or any claim that the no-model
  handshake proves a credential-bearing RB-C2 topology;
- public network access from an E2B guest;
- reuse of the historical 3L E2B template as if it were an RB template;
- mutation or destruction of any pre-existing, foreign, historical or
  unrecorded E2B account resource;
- commit, push, PR, merge, deployment or production effect.

## 8. Requested operator decision

After RB-C0 independent review and adjudication, the exact requested decision is:

```text
AUTHORIZE RB-C1 exactly as bounded in
docs/evidence/4d/4d-rb-c1-live-probe-grant-request.md
```

Anything less remains no grant; anything broader requires a revised request.
