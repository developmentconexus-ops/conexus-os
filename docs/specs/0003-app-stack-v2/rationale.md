# 0003. Rationale: the app stack v2 and the platform check as a Builder tool

## Context

The apps the Builder makes run on the REACT_VITE_V1 profile of C-028: React 19, Vite and TypeScript,
with no component, chart, router or form library, and a server half of manifest, handlers and SQL
migrations. The Builder cannot install packages; the only packages are the ones in the E2B image
(`apps/hub/compiler-template/package.json:9-16`). The core use of Conexus is company apps and
dashboards, so every table, chart and form is written by hand, in plain SVG for charts
(study 15).

The loop that decides whether an app is admitted has three measured defects (study 15). Admission
runs the candidate's own `conexus/check.sh`, which the Builder can edit in Construir. The refusal
reason is cut at 400 characters, and a normal Vite output is already 394. The Chromium smoke that
opens the app runs only after admission, and its error text is dropped, so the model never sees
screen errors. Nothing type checks the code: Vite strips types without checking them.

The screens call the server with raw `fetch` and untyped JSON, although each operation already has
a JSON Schema in `manifest.json`. A renamed field shows up only when a person uses the Prévia.

The Prévia enforces `style-src 'self'`, which blocks any library that injects a `<style>` element.
Deep links (`/notas`) return 404 today because the Prévia serves only declared files.

The operator wants the stack settled before prompt v2 is written, so the prompt describes the stack
that will stay (2026-09-29).

## Options considered

### Option 1: Keep the V1 stack, fix the check in place

Keep React only, move the check into a Hub owned script (study 15, A1), keep the shell call.

**Pros**:
- Smallest change; no new E2B image.

**Cons**:
- Dashboards and forms stay hand written; the `erp/sales-dashboard` case pays for it.
- No typed contract, so the type check would catch little.

### Option 2: A fixed, richer stack aligned with the Hub, a generated client, the check as a tool (chosen)

React with TanStack Router and Query, shadcn on Base UI with Tailwind, Recharts, react-hook-form with
zod, TanStack Table; a client generated from the manifest; one Hub owned check exposed as
`conexus_check`.

**Pros**:
- Almost every version already runs in the Hub web app (`package.json`), so one set to upgrade.
- Measured clean under the Prévia CSP with Base UI and a patched chart (study 17, section 2.3).
- The type check makes the generated contract real; one report serves the model, admission and UI.

**Cons**:
- About 170 MB more in the E2B image and about 220 KB more first load JavaScript.
- Base UI and TanStack Table v9 are less familiar to models than Radix and v8.

### Option 3: Same stack on Radix, and OpenAPI for the contract

**Pros**:
- Radix is the shadcn default most models have seen; OpenAPI is a known standard.

**Cons**:
- Radix's dialog broke the Prévia CSP on every open (measured); fixing it means `'unsafe-inline'`
  styles, a security decision of its own.
- An app has one route shape (POST to `/__conexus/api/<op>`); an OpenAPI file would have no reader.

## Rationale

The product is dashboards and forms for companies, so a component and chart kit is load bearing,
not polish. Aligning with the Hub keeps one set of versions and puts the apps on code the team and
the Factory already review. Base UI wins over Radix on a measured fact, the Prévia CSP, not on
taste. The manifest already is the contract, so generating the client from it follows "derive from
authoritative schemas" and adds no second source; OpenAPI waits for a consumer.

The check becomes a tool now because the stack change forces the check to be rewritten anyway
(generate, type check, CSP aware boot), and the tool is a thin wrapper around that script. Owning the
gate in the Hub closes the edit, cut and blind spot defects in one move. A type error blocks
admission like a build error; a boot failure is reported but does not block, which keeps the C-020
amendment that admitted source stays repairable.

The operator chose one neutral Conexus look built from tokens (Claude Design's model: one design
system applied to every new design), with a company style and a per app choice as the next step.
That serves people who use several company apps and keeps the door open for company branding
without touching the apps.

Operator decisions of 2026-09-29: React with TanStack; Base UI; react-hook-form with zod; type error
blocks and boot only warns; neutral token based look now, company style later; client generated from
the manifest; `conexus_check` in Construir only; AC-27 eval after slice 6; dev skills `shadcn` and
`frontend-design`, with design and construction split into two Builder skills.

## Evidence

- Study 15, `15-app-stack-and-check.md` in the operator's study notes: the three check
  defects, the "Teste" rows traced to Prévia use, the overclaim "3 operações validadas".
- Study 17, [17-app-stack-decision.md](../../research/builder/17-app-stack-decision.md): the pinned picks,
  the probe app under the Prévia CSP, bundle and image sizes, the deep link 404 and its fix, the
  check design, the skill outline.
- Probe app: session scratchpad `stack-proto` (not kept; the study records its results).

## References

**Project sources**:
- Spec 0002 (AC-1, AC-6, AC-10, AC-14, AC-27, Tool contract).
- `docs/decisions/index.md`: C-020 amendment, C-028.
- Hub web `package.json` and `apps/web/src/app/router.tsx` (versions and code routes).
- `apps/hub/src/hosting/preview-routes.ts` (the Prévia CSP), `apps/hub/src/builder/application-starter.ts`,
  `application-artifact-runtime.ts`, `run-runtime.ts`, `migrations/0014_agent_user_template.sql`.
- Studies 14, 15 and 17.

**Practices & standards**:
- Derive types from the authoritative schema; generate, do not hand copy.
- The gate is platform code the candidate cannot change.
- Content Security Policy without `'unsafe-inline'` styles.

**Links** (verified by the study 17 and tool discovery checks):
- Introducing Claude Design: https://www.anthropic.com/news/claude-design-anthropic-labs
- Set up your design system in Claude Design: https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design
- Anthropic skills (frontend-design, web-artifacts-builder): https://github.com/anthropics/skills
- shadcn MCP: https://ui.shadcn.com/docs/mcp
- TanStack Intent: https://tanstack.com/intent
