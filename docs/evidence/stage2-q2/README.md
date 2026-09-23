# Stage 2 Q2 evidence

**Task:** [Stage 2 Q2 data programming model qualification](../../tasks/stage2-q2-data-programming-model-qualification.md)

## Q2.0 guidance discovery

**Result:** Mastra Factory exposes repository skills from the session workspace. The server and data guide now ships as the `conexus-server` skill in each Project source checkout.

The installed versions were `@mastra/code-sdk` 1.7.2 and `@mastra/factory` 0.15.0. Factory initializes `projectPath` as an empty string in `node_modules/@mastra/factory/dist/factory.js:393-399`. Before creating the workspace, it sets `projectPath` to the session `workdir` in `node_modules/@mastra/factory/dist/workspace.js:303-309`. That workdir is resolved from the session sandbox. Factory builds the workspace on `SandboxFilesystem` and includes `.agents/skills` in its repository skill roots in `node_modules/@mastra/factory/dist/workspace.js:467-486`.

The no-model probe at [`q2.0-skill-catalog-probe.mjs`](q2.0-skill-catalog-probe.mjs) mounted the generated server skill through Mastra Factory's `FactorySkillSource`, `SandboxFilesystem` and `Workspace`. The catalog listed `conexus-server` with its expected description. Its output is in [`q2.0-skill-catalog-probe.txt`](q2.0-skill-catalog-probe.txt). The probe uses a local command adapter in place of a live E2B sandbox and made zero model requests. Factory's installed source confirms that its E2B session uses the same sandbox filesystem and repository skill roots. R1 will measure whether the Builder loads and follows the skill on the live path.

The guide keeps its Q1 content. `apps/hub/src/builder/application-starter.ts` writes it to `.agents/skills/conexus-server/SKILL.md`; the shared host instruction names that skill. The starter no longer writes `conexus/SERVER.md`. `conexus/check.sh` remains unchanged and still builds the server handlers and validates the manifest and migrations.

## Q2.0 verification

`node --test tests/implementation/builder-application-starter.test.mjs` passed all 8 tests. A combined run with `builder-factory-provisioning.test.mjs` could not start its database-backed cases because `CONEXUS_TEST_DB_HOST` was not configured. The pilot clusters were not used by that suite.

## Q2.1 status

No Builder run has started. The Q2.0 Hub change is being pushed for the coordinator restart. Record R1-R4, the run budget, and the final verdict here after the Hub restarts.
