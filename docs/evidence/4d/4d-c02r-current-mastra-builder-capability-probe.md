# 4D C02R — Current Mastra Builder Capability Probe

> **Status:** `MECHANICAL PROBE COMPLETE / MODEL-QUALITY PROOF OPEN`
> **Probe date:** `2026-08-28`
> **Location:** isolated temporary directory outside the repository
> **Product dependency/install authority:** `NONE`

Executable reproduction lives in
[`qualification/4d/mastra-builder-capability`](../../../qualification/4d/mastra-builder-capability/README.md).

## 1. Proof question

Does current Mastra provide only a conversational Agent, or does it expose
mechanics sufficient to compose a serious coding harness? Which quality claims
remain unproved without a real model/E2B/maintenance benchmark?

## 2. Exact probe identity

```text
Node                 24.18.0
npm                  12.0.2
@mastra/core         1.63.2
@mastra/memory       1.28.1
@mastra/libsql       1.22.2
zod                  4.5.2
install mode         npm install --ignore-scripts --save-exact
installed packages   183
node_modules size    156 MB
```

Registry integrity observed:

```text
@mastra/core@1.63.2
sha512-BHVDF4GtQnIqRND/lPVVoTnmoNzZ7+voz+EpI4YSY0W7In6c/EOrmMnshuNQSDJ9NpxQNrwip0WGYpRYwzFirQ==

@mastra/memory@1.28.1
sha512-ZMKblBgsr7mVBVqsZTT2DYZ7yzCQq7Zc9iEsHrDDSFSa8s9k4ysS7fXNNWUzLzzr7jOiHtvrg6fmfH32snEy5w==

@mastra/libsql@1.22.2
sha512-Nr21NY1VhalnpVAkD3tl/LpsBOD6nXrt5si0cR3K2be+rAUWXH6ncBs+KijEfugINDwl9JkseEwpMncYXjhWZQ==
```

This is research identity, not an admitted Product pin. Current source/package
admission still must satisfy RP-G0.1 and B06.

`npm audit` reported one transitive low-severity resource-consumption advisory
through the v5 alias of `@ai-sdk/provider-utils`; no audit fix was applied.

## 3. Documentation findings

Current official and exact embedded package documentation establishes:

- `AgentController` is a beta collaborative runtime host with isolated Sessions,
  persistent threads/settings, modes, model switching, tool permissions/
  approvals, resumable interactive tools, subagents, channels and UI display state;
- `createCodingAgent()` provides Workspace, task-list signals when Memory exists,
  transient-model error processors and a goal-judge default;
- it explicitly does **not** provide the Mastra Code product prompt, modes or
  tool composition;
- Workspace combines filesystem and command sandbox, supports BM25/vector
  search, versioned skill sources, background processes and optional LSP;
- the default local workspace runs with the application process's host
  permissions and is not a production Builder isolation boundary;
- SDK-agent and ACP mechanisms can host vendor coding loops while retaining
  their own tools, permissions and runtime behavior;
- AgentController and DurableAgent remain beta and require version-specific
  qualification.

## 4. Mechanical probe A — default coding workspace

`createCodingAgent()` was instantiated without a provider call and resolved its
default local Workspace. The Workspace reached `ready` and reported the exact
contained temporary filesystem and running local sandbox.

`getToolsForExecution()` exposed:

```text
mastra_workspace_delete
mastra_workspace_edit_file
mastra_workspace_execute_command
mastra_workspace_file_stat
mastra_workspace_get_process_output
mastra_workspace_grep
mastra_workspace_kill_process
mastra_workspace_list_files
mastra_workspace_mkdir
mastra_workspace_read_file
mastra_workspace_write_file
```

The probe successfully:

- read a TypeScript source file through the Workspace tool;
- executed `node --version` through the sandbox tool;
- returned validation failure for an intentionally wrong `grep` argument rather
  than executing a malformed request;
- exposed no `ast_edit` or LSP tool because their optional packages/server were
  not installed/configured.

This proves usable file/command mechanics and schema validation. It does not
prove safe isolation, code quality or Paved-Road conformance.

## 5. Mechanical probe B — collaborative harness composition

An explicit Workspace, Memory, LibSQL storage, `createCodingAgent()` and
`AgentController` were composed with:

- `plan`, `build` and `review` modes;
- one constrained reviewer subagent definition;
- one repository-local `verify-change` skill;
- task/goal support;
- category-level `ask` permission policy;
- BM25 index over source and skills;
- one exact resource/scope/thread binding.

Observed:

```text
initial mode first run       plan
switched mode                build
initial mode after recreate  build
stored thread count          1
skill discovery              verify-change
BM25 query "add"             positive result
```

The second process reconstruction restoring `build` demonstrates persisted
thread-scoped mode settings for this exact probe. It does not prove live Session,
approval or active-run survival; official docs state those are process-local.

The current display projection exposed keys for:

```text
tasks / previousTasks / queuedFollowUps
modifiedFiles
pendingApproval / pendingSuspensions
activeSubagents / activeTools
tokenUsage
currentMessage / bufferingMessages / bufferingObservations
```

This is substantially more than a basic chat loop.

## 6. Existing real qualification Evidence

Package A previously executed real bounded Mastra Code/Codex/E2B probes on the
then-exact 1.56.0 family. Current accepted outcomes include:

- Builder AgentController persistent/current-dispatch properties qualified;
- E2B qualified only with the physical-incarnation guard;
- one persistent CodingSession/thread baseline;
- Observational Memory evaluated and kept off because net benefit was not proved;
- no Product implementation correctness or complete provider/model quality claim.

That Evidence remains valid only for its exact pins and properties. It is not a
current-package admission or complete Builder quality benchmark.

## 7. What the probe falsifies

```text
Mastra Builder candidate = one simple conversational Agent
```

is falsified. Current Mastra offers a coding-harness substrate including
collaborative sessions, Workspace, tasks/goals, modes, skills, approvals,
subagents, search and external coding-agent bridges.

## 8. What remains open

The probe does not decide:

- native Mastra coding loop versus Mastra host + SDK/ACP coding agent;
- real E2B integration on current pins;
- context compiler and prompt quality;
- AST/LSP value and operational cost;
- Git custody/Change/WorkUnit/ActorRun/SHARE integration;
- browser/Preview/verification loop;
- greenfield application quality;
- second-turn maintenance, refactor and external-integration quality;
- cost/latency/context dilution;
- current-package security/source admission.

Those claims require the Conexus Worker Eval against the same real tasks and
firing invariants. Feature inventory cannot select the winner.

## 9. Repository recovery note

The first attempt to create the temporary directory was expanded incorrectly by
the shell and `npm init` added metadata fields to the root `package.json` before
the command was interrupted. The exact generated delta was removed with a
bounded patch, `package-lock.json` was unchanged, and required `npm ci` restored
root `node_modules`. No Product dependency or residual root package delta remains.
