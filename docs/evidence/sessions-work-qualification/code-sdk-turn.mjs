// Drives one agent turn through @mastra/code-sdk's controller mount, pointed
// at a local OpenAI-compatible stub server via the SUPPORTED custom-provider
// path, no paid provider involved.
//
// `MastraCodeConfig.settingsPath` does NOT reach this: `resolveModel()` in
// dist/agents/model.js:42 calls `loadSettings()` with zero arguments, so
// `settings.customProviders` always comes from the real global settings.json
// (getAppDataDir()/settings.json), never from config.settingsPath. Verified
// by tracing the first failed run: the model call went through
// ModelRouterLanguageModel/GatewayManager/ModelsDevGateway (@mastra/core's
// generic string-model router), not MastraCodeGateway#resolveLanguageModel,
// and failed with "Could not find config for provider local-stub" because
// models.dev has never heard of it.
//
// The supported override is `setCustomProvidersSource` (dist/agents/
// custom-provider-source.js:5, re-exported from dist/agents/model.js:153,
// reachable through code-sdk's own `"./*"` package.json exports map as
// `@mastra/code-sdk/agents/model.js`). `resolveCustomProviders()` (model.js:45)
// checks it BEFORE falling back to settings.customProviders and, once
// registered, it is authoritative — this is what makes the stub reachable
// without writing to the user's real global settings.json.
import { prepareAgentControllerMount } from '@mastra/code-sdk';
import { setCustomProvidersSource } from '@mastra/code-sdk/agents/model';
import { Mastra } from '@mastra/core/mastra';
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.env.MC_PROJECT_ROOT;
const STUB_BASE_URL = process.env.MC_STUB_BASE_URL;
const SCRATCH = process.env.MC_SCRATCH;
const ASSERT_FALSE = process.env.MC_ASSERT_FALSE === '1';

if (!PROJECT_ROOT || !STUB_BASE_URL || !SCRATCH) {
  throw new Error('MC_PROJECT_ROOT, MC_STUB_BASE_URL, MC_SCRATCH are required env vars');
}

const providerId = 'local-stub'; // getCustomProviderId("Local Stub") in settings.js
const modelId = `${providerId}/stub-model-1`;

setCustomProvidersSource(() => [
  {
    name: 'Local Stub',
    url: STUB_BASE_URL,
    apiKey: 'test-key',
    models: ['stub-model-1'],
  },
]);

const filesystem = new LocalFilesystem({ basePath: PROJECT_ROOT, allowedPaths: [PROJECT_ROOT] });
const workspace = new Workspace({
  id: 'poc-workspace',
  name: 'PoC workspace',
  filesystem,
  sandbox: new LocalSandbox({ workingDirectory: PROJECT_ROOT, env: process.env }),
});

const mode = {
  id: 'build',
  name: 'Build',
  // Raw core workspace tool names: passing our own `workspace` (instead of
  // letting code-sdk build its default one via getDynamicWorkspace) skips
  // mastracode's TOOL_NAME_OVERRIDES remap (write_file -> ...), so the name
  // exposed to the model is the @mastra/core constant
  // WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE = "mastra_workspace_write_file".
  availableTools: ['mastra_workspace_write_file', 'mastra_workspace_read_file'],
  defaultModelId: modelId,
};

const storagePath = path.join(SCRATCH, 'mc.db');

const { base, mastraArgs, finalize } = await prepareAgentControllerMount({
  cwd: PROJECT_ROOT,
  workspace,
  modes: [mode],
  subagents: [],
  storage: { backend: 'libsql', url: `file:${storagePath}`, isRemote: false },
  initialState: { projectPath: PROJECT_ROOT, yolo: false },
  disableMcp: true,
  disableHooks: true,
  disablePlugins: true,
  disableGithubSignals: true,
});

new Mastra(mastraArgs);
await finalize();

const { controller } = base;
const session = await controller.createSession({ resourceId: 'poc-resource' });
await session.thread.create({ title: 'PoC turn' });

let approvals = 0;
session.subscribe((event) => {
  if (event.type === 'tool_approval_required') {
    approvals += 1;
    session.respondToToolApproval({ decision: 'approve', toolCallId: event.toolCallId });
  }
});

session.subscribe((event) => {
  if (event.type === 'error') console.error('[agent error]', event.error);
});

await session.sendMessage({
  content: 'Bump the counter to 1 by editing app/counter.js.',
  untilIdle: true,
});

const filePath = path.join(PROJECT_ROOT, 'app', 'counter.js');
const finalContent = fs.readFileSync(filePath, 'utf8');
const expected = 'export const counter = 1\n';
const changed = finalContent === expected;
const pass = ASSERT_FALSE ? !changed : changed;

console.log('APPROVALS:', approvals);
console.log('FINAL_CONTENT:', JSON.stringify(finalContent));
console.log('ASSERT_FALSE_MODE:', ASSERT_FALSE);
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
