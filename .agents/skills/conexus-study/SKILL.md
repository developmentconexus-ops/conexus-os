---
name: conexus-study
description: Study a Conexus wave or question before any spec: today's code by census, why it is so, and how reference code bases built by engineers solve it, so Conexus copies and adapts instead of inventing. Use when your instructions name a study, a part of a study, or a synthesis.
---

# Study

Conexus copies what engineers already built and adapts it. A study finds, in real reference code,
how the thing is done, measures today's code against it, and finds the root cause of what is wrong.
It changes no code. Its report feeds the spec's "References copied" table and its decisions.

A Claude session invokes a skill as `/<name>` (`/pstack:<name>` for pstack), a Codex session as
`$<name>`. Where this skill names a pstack skill the session does not have, follow the rule written
beside it.

## Rules

1. **Attack the premise, always.** The question as it arrived is not the answer. Ask why until the
   root cause, and say whether the premise held. Never skip this because the change "looks known".
2. **References in their code.** Read the source, never memory or a blog post. Record each
   reference's version (commit, or installed package version) and cite `file:line`. Ask every
   reference the same questions, then compare them in one table.
3. **The census is a script.** It finds every instance by mechanism (AST, a lint rule, a query),
   prints the number and `file:line`, and reruns with one command.
4. **Proved or not proved.** A claim is proved by running something (a spike, a probe, a query) or
   it is listed as not verified. Falsifiable claims only.
5. **The guides measure.** Each finding names the guide section it breaks.
6. **Reuse.** Start from earlier studies; correct them where the code says otherwise.
7. **Decisions go to the operator** through the planning session, with options, a recommendation
   and the reference behind it. A fact you can observe is not a decision: observe it.
8. **The repository is public.** The report, the census and every query follow
   [the company data rule](../../../docs/reference/security-and-authority.md#7-data-protection-and-egress).

## Parts

Your instructions name your part. Each part writes only its section of the report template
([`references/report.md`](references/report.md)):

- **today**: sections 2 and 7, the census and how it works now. Use pstack `how`; without it, trace
  the code from entry point to effect and write the overview, the key concepts, where things live
  and the gotchas.
- **why**: section 3, the specs, pull requests and decisions. Use pstack `why`; without it, read the
  specs, the pull requests, the [decision register](../../../docs/decisions/index.md) and the Git
  history (`git log -S`, `git blame`) that produced the shape, and cite each.
- **references**: section 4, for the references your instructions name.
- **synthesis**: the whole report, from the part reports. Check every claim you keep against the
  code, rerun the census, and mark each part claim audited or dropped.

## Evidence

Cheapest first: [evidence](references/evidence.md) (telemetry, Mastra's
spans, logs, the [`verify`](../verify/SKILL.md) skill, reference code). For Mastra, the installed
version is the truth; then how Mastra's own products (Factory, Mastra Code) do it.

## Gate

The study ends at the operator's gate: the operator agrees with what the wave wants, what stays out
and when it ends (section 8). Then [`conexus-spec`](../conexus-spec/SKILL.md) starts from section 10.
