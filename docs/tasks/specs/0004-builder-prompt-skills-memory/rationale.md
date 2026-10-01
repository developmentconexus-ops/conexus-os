# 0004. Rationale

## Context

The Builder's prompt grew by accretion: a Conexus prompt, a mode prompt, a 1,400 word planning
checklist and a connector brief with the whole integrator guide, about 8,700 tokens before the first
message. Claude Code's Opus 5.5 prompt spends about 1,600 tokens on behavior. On 2026-09-30 Leandro
and the HQ session rewrote it section by section on the Claude Code base (HQ
`docs/research/builder/system-prompt-v2.md`, studies 44 and 48).

Two modes force a choice the person does not understand and that Leandro himself never uses in Claude
Code or Mastra Code. Study 45 found that planning works as a skill the model loads when the request
is new, big or unclear, with approval through the question card. Studies 50 to 53 wrote that skill
and a build skill from Claude Code, Mastra Code, Codex, Superpowers, the jm skills and pstack.

`AGENTS.md` means instructions people write everywhere else in the market, yet Conexus uses it for
the Builder's own notes, under an 8 KB cap that refuses a version. Study 52 found that
Builder written overviews hurt agents (an ETH study measured lower success and more than 20% more
cost), while short human written instructions help. Study 49 compared Mastra's memory kinds and chose
observational memory plus files plus recall.

The change touches the prompt assembly, the modes, the tools, the skills root, the starter, the
memory settings, the web chat and the eval. Leandro wants today's prompt compared with the new one on
the same requests before today's is deleted.

## Options considered

### Option 1: a new variant beside today's, then delete today's

Build everything as a new prompt variant behind the switch that exists today, compare, then delete
today's.

**Pros**:
- The comparison Leandro asked for runs on the same Hub, the same eval and the same requests.
- Each step ships and proves itself; a bad result stops the flip without a revert.

**Cons**:
- Two prompts and two mode sets coexist for a while, which "one way per thing" forbids as a steady
  state.
- The eval and a few runtime paths branch on the variant until step 7.

### Option 2: replace in one change

Measure today's Builder, then delete the plan mode and today's prompt and ship the new Builder as
the only one, and measure again.

**Pros**:
- No parallel paths, less code at every moment.

**Cons**:
- The comparison is against a kept baseline, not a live side by side run.
- A regression found late means reverting a large change.

### Option 3: keep all variants

Add `v3` as a sixth variant and keep the experiments.

**Pros**:
- Every variant stays comparable in the bakeoff.

**Cons**:
- Keeps about 5,000 words of prompt text and four plan formats already decided against.

## Rationale

Option 2. Leandro chose it on 2026-09-30 ("já substitui tudo"), after first leaning to Option 1 for
the comparison. The comparison survives without keeping the old code: the eval measures today's
Builder on three requests before any change and the new one after, so nothing old lives beside the
new. That follows "migrate callers then delete legacy" and removes the per conversation variant
problem a cross check found (the variant was chosen per message, so one conversation could jump
between prompts). The cost is a larger single change and a regression that only a run shows landing
before it is measured; the Chromium scenarios run before the merge and the rerun follows it.

Choices settled while writing, each with the runner up:
- Placeholders filled by the Hub at turn start, not by a template engine: three strings and two
  blobs do not need one (runner up: Mastra dynamic instructions per request, which is how the text is
  delivered anyway).
- Date in `America/Sao_Paulo`: every customer is in Brazil today (runner up: UTC, wrong three hours
  each night).
- Cutoff from a table keyed by model id, dropped when unknown (runner up: asking the provider, which
  no provider answers).
- `MEMORY.md` cut at 200 lines or 16 KB, as Claude Code cuts its memory index by lines, plus bytes so
  a few huge lines cannot flood the prompt. The Builder groups it by type, so the Hub never opens the
  memory files.
- The Sankhya guide as a static skill in `builder-skills/`, the one owner of the text, read by the
  skills processor like the other skills (runner up: generating it at Hub start, which needs a
  writable skills root and a connector catalog at boot).
- The approval as behavior the eval measures, not a write guard: prove first, guard what the
  measurement shows (Leandro's rule). The approval lives in the conversation, so an interrupted turn
  asks again.
- Observations stay per conversation, as Mastra's default and Mastra Code; `retrieval` reaches the
  other conversations of the Project (resource scope is marked experimental in the Mastra docs).
- The model is the Mastra session's for the one mode; no precedence rules of our own.
- No `AGENTS.md` refusal: the file is the people's (runner up: keep the refusal).
- Test Projects deleted instead of migrated: Leandro said they were all tests.

## References

**Project sources**:
- Spec 0002 (`docs/tasks/specs/0002-builder-own-harness/index.md`), AC-1 to AC-10, AC-18, AC-23 and
  the 2026-09-29 amendment.
- `apps/hub/src/builder/harness/prompt.ts`, `modes.ts`, `methodology.ts`, `tools.ts`,
  `controller.ts`; `apps/hub/src/builder/memory.ts`, `project-knowledge.ts`, `run-runtime.ts`;
  `apps/hub/src/connectors/builder-brief.ts`, `sankhya/skill.ts`; `scripts/builder-eval/`.
- HQ (`conexus-hq`) `docs/research/builder/`: `system-prompt-v2.md`, `conexus-plan-skill-draft.md`,
  `conexus-build-skill-draft.md`, studies 44 to 53; HQ `docs/scope/scope.md` items 6 and 11.
- The installed `@mastra/memory` docs on observational memory `retrieval`.

**Practices & standards**:
- Skill authoring best practices (Anthropic): progressive disclosure, degrees of freedom.
- Subtract before you add; migrate callers then delete legacy paths (pstack principles).
