---
name: conexus-prove
description: Prove a finished Conexus wave against its spec on the real app, before its pull request goes to the operator. Use when your instructions name a wave branch and its spec to prove.
---

# Prove a wave

You prove that the head of a wave branch does what its spec promises. You read and run; you never
change code. A green CI and a builder's report are not proof. Only what you observe, and cite,
counts. Your deliverable is a report, not a pull request.

A Claude session invokes a skill as `/<name>` (`/pstack:<name>` for pstack), a Codex session as
`$<name>`. Where this skill names a pstack skill the session does not have, follow the rule written
beside it.

## Steps

1. Read the spec's Summary, Requirements and "Deletes and census". Each `AC-N` is a check, and each
   surface the spec names (route, table, screen, migration) must exist.
2. **Behavior kept.** For a wave that changes structure, run the pin the spec names (the first unit's
   characterization tests or equivalence harness) on the head. Then capture the observable outputs
   of the touched surfaces on `main` and on the head, each in its own isolated copy, and diff them.
   They must match, except for differences the spec names. Any other difference is a regression.
3. **Behavior added.** Drive each AC on the real app with the [`verify`](../verify/SKILL.md) skill
   (launch, doctor, drive, evidence, cleanup). Screens in light and dark
   ([T §8](../../../docs/development/testing.md#8-screens)). What `verify` replaces (the model, E2B)
   is named in the report. A real Builder turn needs explicit authority
   ([T §9](../../../docs/development/testing.md#9-builder-proof)): ask, do not run it.
4. **Read what happened, not only what showed.** For every AC you drive, and for every failure,
   read the record of that run, cheapest first ([evidence](../conexus-development/references/evidence.md)):
   - the traces: the `verify` launch exports OpenTelemetry to the development backend
     (`infra/telemetry/compose.dev.yaml`, Grafana with Tempo, Loki and Prometheus) tagged
     `deployment.environment.name=verify`; find the request's trace and the time of each call;
   - the Hub's structured log lines in the run's `hub.log`, by log code, each with its `trace_id`;
   - Mastra's own spans (`mastra_ai_spans`) and thread messages with the `verify` skill's
     `node $C db`, SELECT only, for agent steps, tool calls and model calls;
   - the page console in `browser.log`: an error no feature file lists as expected is a finding.

   The browser is the run's own headless Chromium, started by `verify`. Never attach to a browser the
   run did not start. If the telemetry backend is not running, the trace checks are blocked: say so,
   do not start it, and ask. A failed AC is reported with its trace id, its log code and the span
   where it broke, so the fix unit starts from the cause.
5. **The code got smaller.** Run each census line of the spec on `main` and on the head, and report
   both numbers. Report `git diff --numstat main...HEAD` with product code apart from tests, SQL and
   generated files.
6. **Verdict per AC**, each one of:
   - met: the check passed, with its evidence cited;
   - missing: specified and never built;
   - not applied: built, but it fails at runtime (for example a migration not in the schema);
   - blocked: not exercised, with what it needs.

   The wave passes only when every AC is met, every named surface exists, no regression is found and
   every census line reached its target.

## The evidence gate

- No evidence, no "met". Each met AC cites the command and its output, the URL and the screenshot,
  or the query and its result.
- Nothing launched, nothing met. If the app did not start, every AC is blocked.
- A tool you could not use makes its checks blocked, never "looks right in the code".
- List what you did not check.
- Evidence stays outside the repository, and the report carries no company data
  ([S §7](../../../docs/reference/security-and-authority.md#7-data-protection-and-egress)).

## Report

The head commit proved; the AC table with verdict and evidence; the regression diff result; the
census before and after; the numstat; what was replaced; where the evidence lives. If the `verify`
feature map was wrong or missing a feature, say which, so it is fixed with pstack
`maintain-verification-skill`; without pstack, correct the feature file under
[`verify/features`](../verify/features/README.md) against the source it describes.

A failed AC or a regression becomes a fix unit, built like any unit, and the proof runs again on the
new head. On a `lane:qualification` wave, a separate review runs pstack `interrogate` over
`main...wave/<name>`; without pstack, two fresh reviewers on different models read the whole diff
independently against the spec and the guides, and every finding carries its evidence.
