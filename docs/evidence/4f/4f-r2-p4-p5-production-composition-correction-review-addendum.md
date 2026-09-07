# R2 P4/P5 production composition — correction review addendum

> **Code candidate:** `b8ec320`
> **Correction range:** `c7a1060..b8ec320`
> **Mode:** narrow continuity review; not a new whole-package round

The prior production-composition candidate remains the base. Review only whether
this correction range preserves or changes the protected P4 closure properties:

- the restricted PostgreSQL subject resolver must treat active intent (`P0001`)
  and stale/incoherent subject (`P0412`) as uncertainty, never permanent refusal;
- that uncertainty must remain `INDETERMINATE` through Gateway and Brain,
  `UNAVAILABLE` in Project and HTTP `503` at PRJ-11, without observation,
  attestation or settlement;
- the real PostgreSQL negative matrix must cover the exact active-intent,
  ownership, qualification, configuration, environment, credential and Project
  lifecycle refusals while restoring the positive baseline;
- a legacy standalone attester input must not activate or silently downgrade the
  production Brain-binding path; manifest-only BRN-14 context remains valid.

Inspect the exact correction range and the directly implicated current files.
At minimum run or inspect:

```bash
git diff c7a1060..b8ec320 --check
node --test --test-concurrency=1 \
  tests/implementation/r2-p4-key-conformance-subject.test.mjs \
  tests/implementation/r2-p5-production-composition.test.mjs
npm run r1:s2:hub:typecheck
```

Return whether each property is `RESOLVED`, `NOT RESOLVED` or `UNKNOWN`, with
exact file/line evidence and any material blocker. A finding blocks only for a
reproducible false PASS, false STOP, unauthorized effect, protected-property
violation or correctness-critical missing authority. Do not edit files, call
providers, expose credentials, push, open a PR, merge or deploy.
