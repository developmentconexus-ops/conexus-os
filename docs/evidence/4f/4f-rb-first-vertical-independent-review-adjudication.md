# RB first Builder vertical — independent review adjudication

Date: `2026-09-07`

Reviewed implementation subject: `c3e8c3b80517f47aa3ffa7006d7518c2af92569d`
against base `89c47b6f14b9e08146de378ba31784a97b9ea0f3`.

The read-only Fable lane returned `CORRECT BEFORE CANDIDATE ACCEPTANCE` with two
material local execution gaps, three minor local gaps and one minor method
finding. The AGY lane produced no review output because its headless command was
auto-denied by the review environment. The Lead did not weaken that sandbox and
does not claim dual-lane convergence.

## Lead adjudication

- `F1` accepted. The existing tests did not execute the Builder Git-custody
  program or enough SQL refusal paths. A gated exact-image OCI proof now admits
  one exact child, checks the private Change ref and unchanged canonical main and
  remote configuration, and fires multi-commit and protected-path refusals. The
  PostgreSQL proof now fires idempotency-conflict, missing-authority,
  missing-Baseline, second-writer, revoked-authority, stale-Baseline and
  late/replaced-output controls. Executing the OCI proof exposed and corrected
  two real defects: invalid program-string escaping and an unreachable distinct
  multi-commit classification.
- `F2` accepted. `BLD-07` now consumes only `project.source.read`; other current
  Change reads consume `project.build`. A PostgreSQL control proves a principal
  with source-read retained and build revoked can read the diff but not the
  build-gated snapshot.
- `F3` accepted for the objective verification graph. `rb:first:check` is now a
  required `verify` leaf and CI additionally runs the real PostgreSQL proof. The
  exact OCI custody harness is explicit and was run locally against the admitted
  digest; rebuilding its historical recipe today produces a different image
  index, so that rebuild is deliberately not made a false required-CI gate. The
  suggested generated HTTP-schema projection is deferred:
  the seven routes are already checked against the canonical Builder wire by
  the existing wire gate and HTTP shape test, and introducing a second partial
  generator in this slice would create duplicate contract machinery. Reopen on
  a reproduced wire/implementation drift, not on ceremony.
- `F4` accepted in its bounded startup form. Builder recovery now completes
  before the Hub starts listening, removing the admission/recovery race. The
  current Hub remains a single-process deployment assumption; multi-process
  execution is outside this serial-writer vertical and must reopen recovery
  ownership before adoption.
- `F5` is a valid historical-method observation outside RB. The pre-existing A0
  lock-digest coupling is not expanded here and does not falsify this candidate.
- `F6` is deferred. The ordinary Build surface truthfully exposes FAILED without
  promoting ActorRun mechanics. Progressive execution detail remains available
  through `BLD-17`; making it primary Product UX is outside the first outcome.

No finding reopens R1, R2, the Builder owner semantics, ACP, private MCP, runtime
tournaments, Product-Agent work or R3. No live E2B/model run is claimed because
the required external credentials were unavailable; this remains a truthful
bounded proof unknown, not a favorable result.

## Post-publication model-admission correction

Operator questioning after PR publication exposed a localized composition
mistake not raised by the independent lane: Builder reused the exact
`project-inception-opus-5` constructor, turning a purpose-specific initial R1
admission into a coding-worker hardcode. This contradicted the accepted closed
deployment-catalog portability law, although the `CodingWorkerRuntime` itself
was already model-neutral.

The correction extends the finite server-owned Project catalog with a
`BUILDER_CODING` admission, retains an explicit configured selection, reuses the Project-owned
external credential slots, and persists the exact non-secret admission,
provider and model identities on ActorRun admission. Anthropic remains the only
currently implemented provider transport and may remain the initial default;
other providers require their own bounded transport admission, not changes to
Builder runtime semantics. `PRJ-29` remains Product-Agent model-policy
discovery and is not widened into a raw coding-worker model picker.

## Model-admission correction review and adjudication

The correction subject `8de4855a58f4319e0a54c6b684de00482daa5f56`
was challenged through the neutral
[model-admission review brief](4f-rb-builder-model-admission-review-brief.md).
The read-only Fable lane (requested alias `fable`, effort `xhigh`, session
`237866ef-78d5-4482-855f-646325ceddae`) found no protected-claim falsifier,
method finding or Product/plan gap. It reported four non-blocking local gaps.
The AGY `gemini-3.1-pro-high` lane again produced no review output because its
headless command permission was auto-denied. The Lead did not weaken the
sandbox and does not claim dual-lane convergence.

- `F1` accepted before publication. One accepted Project-owned catalog now
  carries both the exact R1 Inception/Explanation admission and configured
  Builder coding admissions. R1 retains its exact Opus selector; Builder uses
  its configured admission ID and neither can consume the other's capability.
  The duplicate Builder catalog file/env knob and duplicate parser are removed.
- `F2` accepted. A constructor-level negative control now fires when the exact
  admitted model ID and instantiated Mastra model disagree, without creating a
  sandbox or making a provider call.
- `F3` accepted. The unused exported constructor that encoded the old Inception
  admission shortcut is removed.
- `F4` accepted in the smallest shared owner. The OAuth token store exposes the
  same custody/content validation used at token access. Startup admission invokes
  it before any ActorRun, and each execution revalidates immediately before E2B
  sandbox creation. Missing file,
  malformed content and unsafe permissions all fire locally; expiry may still
  trigger the existing bounded refresh during use.

These corrections do not add a provider, model-routing policy, browser picker,
fallback, external call or new credential store. Because `F1` materially changes
the challenged catalog property, the corrected frozen candidate requires one
fresh independent confirmation before publication.

## Corrected-candidate confirmation

The shared-catalog subject `ad79b6780501bd90ea0f9f44e5e58eaf0414e1c9`
was challenged through the neutral
[confirmation brief](4f-rb-builder-model-admission-confirmation-brief.md).
The read-only Fable lane (requested alias `fable`, effort `xhigh`, session
`c2d85190-229d-4535-9ea7-cfacab87fa93`) found no material falsifier and
confirmed all named protected properties. It reported four non-blocking local
gaps and one non-blocking review-environment method finding. The AGY lane was
again auto-denied before output; no dual convergence is claimed.

- Credential drift after startup is now checked by the same local validator at
  the start of every `CodingWorkerRuntime.execute`, before `Sandbox.create`; an
  executable negative proves no sandbox-binding path is reached.
- R1 and Builder resolution of the same credential path now share one token
  store and therefore one in-process refresh single-flight. Cross-process token
  refresh coordination remains outside the single-process deployment assumption.
- The stage packet now states the exact catalog version, shared env/file roles
  and loud migration required from the former singleton R1 shape. The catalog
  resolver and its combined R1+Builder fixture prove the new composition branch;
  no live deployment migration is claimed.
- Catalog entries are checked offline against `PROVIDER_REGISTRY` exported by
  exact adopted `@mastra/core@1.63.2`; a registry-unknown model fires before
  credential or sandbox work. No dynamic registry refresh/network is enabled.
- The AGY permission failure is an honest assurance shortfall. It must be fixed
  or explicitly accepted by the operator before RB stage closure, but it does
  not falsify this PR candidate or justify weakening the read-only sandbox.

No external model/E2B execution is claimed by either review round. That live
qualification remains the next bounded step once operator-held configuration
and credentials are supplied.
