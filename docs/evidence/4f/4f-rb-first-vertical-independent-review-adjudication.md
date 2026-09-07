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
