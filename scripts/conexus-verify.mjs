import { randomUUID } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { spawn as spawnProcess } from 'node:child_process'
import { availableParallelism, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptFile = fileURLToPath(import.meta.url)

/**
 * The aliases are deliberately small and static.  They are routing names, not
 * a second verification implementation or a claim about the state of a gate.
 */
export const SCOPE_MANIFEST = Object.freeze({
  preflight: Object.freeze({ npmScript: 'conexus:preflight', npmArgs: Object.freeze(['--no-network']) }),
  repository: Object.freeze({ npmScript: 'repository:check', npmArgs: Object.freeze([]) }),
  final: Object.freeze({ npmScript: 'verify', npmArgs: Object.freeze([]) }),
})

const POSTGRES_ENV_DEFAULTS = Object.freeze({
  CONEXUS_TEST_DB_HOST: '127.0.0.1',
  CONEXUS_TEST_DB_PORT: '5432',
  CONEXUS_TEST_DB_NAME: 'conexus_test',
  CONEXUS_TEST_DB_USER: 'postgres',
  CONEXUS_TEST_DB_PASSWORD: 's6-ci-test-only',
})

// A class names what a step needs: PostgreSQL, a browser, or both.
const POSTGRES_CLASSES = new Set(['postgres', 'browser-postgres'])

// What a step shares with the others decides when it may run beside them:
//   locks  names of shared resources. Two steps that hold the same lock never overlap.
//   after  scopes that must have succeeded first, because this step reads what they write.
//          AFTER_ALL waits for every other step of the run.
// A step with none of these, and a class that needs no cluster, runs whenever a slot is free.
export const AFTER_ALL = 'all'

// Roles belong to the PostgreSQL instance, not to a database. The suites give the hub_* roles
// passwords of their own (ALTER ROLE hub_builder_ingress PASSWORD ...) and the baseline creates
// them with CREATE ROLE, so two suites on one instance overwrite each other's credentials even
// though every suite builds a database of its own. One lock stands for that instance, and every
// step whose class needs PostgreSQL holds it. Separating them would take an instance per step.
export const HUB_CLUSTER_LOCK = 'hub-postgres-cluster'

// `npx --yes @redocly/cli` installs into the shared ~/.npm/_npx cache on first use.
const NPX_CACHE_LOCK = 'npx-cache'

// The wire checks read /tmp/conexus-product-openapi.bundle.json, which wire-openapi-bundle writes.
const AFTER_BUNDLE = Object.freeze({ after: Object.freeze(['wire-openapi-bundle']) })

const candidateStep = (scope, command, environmentClass = 'static', sharing = {}) => Object.freeze({
  scope,
  command,
  environmentClass,
  graph: 'candidate',
  ...sharing,
})

// Browser steps run one at a time. Two of them side by side failed every run of this change (seven of
// seven): settings-browser timed out waiting for a heading and c020-browser was cancelled, in tests that
// take a few seconds alone. The cause was not found, so this is a serialization and not a fix. The
// suites share Chromium, Vite and the machine's four cores, and nothing else is known to be shared.
export const BROWSER_LOAD = 'browser-load'
const BROWSER_CLASSES = new Set(['browser', 'browser-postgres'])

export const locksOf = (step) => [
  ...(step.locks ?? []),
  ...(POSTGRES_CLASSES.has(step.environmentClass) ? [HUB_CLUSTER_LOCK] : []),
  ...(BROWSER_CLASSES.has(step.environmentClass) ? [BROWSER_LOAD] : []),
]

const HUB_BUILD_DIRECTORY = 'node_modules/.cache/conexus-hub-build'

// The hub typecheck also emits, once, the compiled Hub every Hub suite imports. It runs first and
// publishes the directory to the steps after it, so no suite compiles the Hub again.
const hubBuildStep = Object.freeze({
  ...candidateStep('c020-hub-typecheck', `rm -rf ${HUB_BUILD_DIRECTORY} && node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --pretty false --noEmit false --outDir ${HUB_BUILD_DIRECTORY}`),
  publishes: Object.freeze({ CONEXUS_HUB_BUILD: HUB_BUILD_DIRECTORY }),
})

/**
 * The candidate profile is the review-lane composition. Each entry is an
 * objective leaf or an intentionally distinct environment/selection proof.
 * Historical npm scripts remain available for explicit invocation, but are not
 * part of this current graph. Composite aliases are not used here because
 * they would repeat equivalent leaves. Candidate-freeze custody is invoked
 * explicitly by its own repository command; it is not a required-main CI
 * property while the candidate remains unadmitted.
 */
const GRAPH_STEPS = Object.freeze([
  hubBuildStep,
  candidateStep('hub-baseline', 'node --test --test-concurrency=1 tests/implementation/hub-baseline.test.mjs tests/implementation/hub-database-cleanup-postgres.test.mjs', 'postgres'),
  candidateStep('c020-migration-selection', 'node --test tests/implementation/hub-migration-selection.test.mjs'),
  candidateStep('c020-migration-postgres', 'node --test --test-concurrency=1 tests/implementation/hub-migration-postgres.test.mjs', 'postgres'),
  candidateStep('iam-membership-authority', 'node --test --test-concurrency=1 tests/implementation/membership-authority-postgres.test.mjs', 'postgres'),
  candidateStep('iam-application-access', 'node --test --test-concurrency=1 tests/implementation/application-access-postgres.test.mjs', 'postgres'),
  candidateStep('iam-installation-administrator', 'node --test --test-concurrency=1 tests/implementation/installation-administrator-postgres.test.mjs', 'postgres'),
  candidateStep('installation-settings-routes', 'node --test tests/implementation/installation-settings-routes.test.mjs'),
  candidateStep('iam-grant-surface-excision', 'node --test --test-concurrency=1 tests/implementation/grant-surface-excision-postgres.test.mjs', 'postgres'),
  candidateStep('hub-call-site-privileges', 'node --test --test-concurrency=1 tests/implementation/hub-call-site-privileges-postgres.test.mjs', 'postgres'),
  candidateStep('connector-postgres', 'node --test --test-concurrency=1 tests/implementation/connector-postgres.test.mjs', 'postgres'),
  candidateStep('connector-routes', 'node --test tests/implementation/connector-routes.test.mjs'),
  candidateStep('connector-broker', 'node --test tests/implementation/connector-token-cache.test.mjs tests/implementation/connector-broker.test.mjs tests/implementation/connector-fetch.test.mjs tests/implementation/connector-adapter-source.test.mjs tests/implementation/connector-handler-port.test.mjs tests/implementation/connector-handler-fetch.test.mjs tests/implementation/application-invoker.test.mjs'),
  candidateStep('connector-broker-postgres', 'node --test --test-concurrency=1 tests/implementation/connector-broker-postgres.test.mjs tests/implementation/connector-fetch-postgres.test.mjs', 'postgres'),
  candidateStep('connector-builder-brief', 'node --test tests/implementation/connector-builder-brief.test.mjs'),
  candidateStep('connector-builder-tool', 'node --test tests/implementation/connector-builder-tool.test.mjs'),
  candidateStep('builder-harness', 'node --test tests/implementation/builder-harness.test.mjs tests/implementation/builder-thinking-level.test.mjs tests/implementation/builder-ask-user.test.mjs tests/implementation/builder-submit-plan.test.mjs tests/implementation/builder-project-context.test.mjs tests/implementation/builder-memory.test.mjs tests/implementation/builder-model-stream-recorder.test.mjs tests/implementation/builder-run-operation.test.mjs tests/implementation/builder-sankhya-reader.test.mjs tests/implementation/builder-context7.test.mjs'),
  candidateStep('c020-builder-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-run-invariants-postgres.test.mjs tests/implementation/builder-run-execution-postgres.test.mjs tests/implementation/builder-c020-source-inspection-postgres.test.mjs', 'postgres'),
  candidateStep('c020-builder-request-text-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-run-request-text-postgres.test.mjs', 'postgres'),
  candidateStep('conexus-git-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-conexus-git-postgres.test.mjs', 'postgres'),
  candidateStep('factory-dependency-tree', 'node --test tests/implementation/builder-factory-dependency-tree.test.mjs'),
  candidateStep('builder-composition', 'node --test --test-concurrency=1 tests/implementation/builder-composition.test.mjs', 'postgres'),
  candidateStep('model-account-postgres', 'node --test --test-concurrency=1 tests/implementation/model-account-postgres.test.mjs', 'postgres'),
  candidateStep('google-ai-pro', 'node --test --test-concurrency=1 tests/implementation/builder-google-ai-pro.test.mjs'),
  candidateStep('openai-codex', 'node --test --test-concurrency=1 tests/implementation/builder-openai-codex.test.mjs'),
  candidateStep('anthropic', 'node --test --test-concurrency=1 tests/implementation/builder-anthropic.test.mjs'),
  candidateStep('run-runtime', 'node --test --test-concurrency=1 tests/implementation/builder-run-runtime.test.mjs tests/implementation/builder-diagnostic-appender.test.mjs tests/implementation/builder-trace-summary.test.mjs tests/implementation/builder-session-tripwire.test.mjs tests/implementation/builder-agent-retry.test.mjs tests/implementation/builder-runaway-step.test.mjs tests/implementation/builder-parallel-tools.test.mjs tests/implementation/builder-run-timing.test.mjs tests/implementation/builder-turn-stall.test.mjs tests/implementation/builder-session-lifecycle.test.mjs tests/implementation/builder-parked-run.test.mjs tests/implementation/builder-stream-backlog.test.mjs'),
  candidateStep('run-recovery-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-run-recovery-postgres.test.mjs', 'postgres'),
  candidateStep('builder-session-routes', 'node --test --test-concurrency=1 tests/implementation/builder-session-routes.test.mjs tests/implementation/builder-stream-facts.test.mjs'),
  candidateStep('conexus-git', 'node --test --test-concurrency=1 tests/implementation/builder-conexus-git.test.mjs'),
  candidateStep('application-data-postgres', 'node --test --test-concurrency=1 tests/implementation/application-data-postgres.test.mjs tests/implementation/application-cluster-installation.test.mjs', 'postgres'),
  candidateStep('application-runner-sandbox', 'node --test --test-concurrency=1 tests/implementation/application-runner-sandbox.test.mjs', 'postgres'),
  candidateStep('app-runner-http', 'node --test --test-concurrency=1 tests/implementation/app-runner-module.test.mjs tests/implementation/app-runner-http.test.mjs tests/implementation/app-path-classifier.test.mjs tests/implementation/app-runner-worker.test.mjs tests/implementation/application-release.test.mjs tests/implementation/manifest-enum.test.mjs'),
  candidateStep('application-server', 'node --test --test-concurrency=1 tests/implementation/application-server-build.test.mjs tests/implementation/preview-application-api.test.mjs'),
  candidateStep('application-host', 'node --test tests/implementation/application-host.test.mjs'),
  candidateStep('foundation-postgres', 'node --test --test-concurrency=1 tests/implementation/identity-access-postgres.test.mjs tests/implementation/workspace-postgres.test.mjs tests/implementation/project-postgres.test.mjs', 'postgres'),
  candidateStep('project-summary-activity-postgres', 'node --test --test-concurrency=1 tests/implementation/project-summary-activity-postgres.test.mjs', 'postgres'),
  candidateStep('project-summary-routes', 'node --test tests/implementation/project-summary-routes.test.mjs'),
  candidateStep('c020-registry', 'node --test --test-concurrency=1 tests/implementation/builder-application-registry.test.mjs tests/implementation/builder-application-registry-postgres.test.mjs', 'postgres'),
  candidateStep('c020-source-runtime', 'node --test --test-concurrency=1 tests/implementation/builder-working-source-runtime.test.mjs tests/implementation/builder-run-dispatch.test.mjs'),
  candidateStep('c020-failure-vocabulary', 'node --test --test-concurrency=1 tests/implementation/builder-failure-vocabulary.test.mjs'),
  candidateStep('c020-compiler-runtime', 'node --test --test-concurrency=1 tests/implementation/builder-application-runtime.test.mjs tests/implementation/builder-application-starter.test.mjs tests/implementation/builder-application-check.test.mjs', 'browser'),
  candidateStep('c020-browser', 'node --test --test-concurrency=1 tests/implementation/builder-browser.test.mjs tests/implementation/builder-parked-card-browser.test.mjs tests/implementation/builder-transcript.test.mjs tests/implementation/builder-conversation-rows.test.mjs tests/implementation/builder-memory-status.test.mjs tests/implementation/builder-plan-sections.test.mjs', 'browser'),
  candidateStep('settings-browser', 'node --test --test-concurrency=1 tests/implementation/settings-browser.test.mjs', 'browser'),
  candidateStep('application-access-browser', 'node --test --test-concurrency=1 tests/implementation/project-settings-access-browser.test.mjs', 'browser'),
  candidateStep('connector-integrations-browser', 'node --test --test-concurrency=1 tests/implementation/connector-integrations-browser.test.mjs', 'browser-postgres'),
  candidateStep('c020-e2b-template', 'node scripts/builder-e2b-template.mjs --check && node --test --test-concurrency=1 tests/implementation/builder-e2b-template.test.mjs tests/implementation/builder-compiler-template-recipe.test.mjs tests/implementation/builder-compiler-recipe-stack.test.mjs tests/implementation/builder-template-pins.test.mjs'),
  candidateStep('c020-compiler-v2', 'node --test --test-concurrency=1 tests/implementation/builder-compiler-allowlist.test.mjs tests/implementation/builder-client-generator.test.mjs tests/implementation/builder-app-starter-v2.test.mjs tests/implementation/builder-skill-examples.test.mjs', 'browser'),
  candidateStep('c020-web-typecheck', 'node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --pretty false'),
  candidateStep('c020-web-build', 'node node_modules/vite/bin/vite.js build --config apps/web/vite.config.mjs apps/web --outDir ../../node_modules/.cache/conexus-candidate-web-build --emptyOutDir'),

  candidateStep('db-catalog-snapshot', 'npm run db:catalog:check', 'postgres'),
  candidateStep('db-baseline-file', 'npm run db:baseline:check', 'postgres'),
  candidateStep('hub-postgres-pool', 'node --test tests/implementation/hub-postgres-pool.test.mjs', 'postgres'),
  candidateStep('db-role-register', 'npm run db:roles:check && node --test tests/implementation/cutover-hub-role-names.test.mjs'),
  candidateStep('db-role-provision-postgres', 'npm run db:roles:postgres', 'postgres'),
  candidateStep('hub-build-shared', 'node --test tests/implementation/hub-build.test.mjs'),
  candidateStep('repository-check', 'npm run repository:check'),
  candidateStep('repository-import-law', 'node --test tests/repository/import-law.test.mjs'),
  candidateStep('hub-log-sinks', 'node --test tests/repository/hub-log-sinks.test.mjs'),
  candidateStep('telemetry', 'node --test tests/implementation/telemetry-register.test.mjs tests/implementation/telemetry-redaction.test.mjs tests/implementation/telemetry-logs.test.mjs tests/implementation/telemetry-metrics.test.mjs tests/implementation/telemetry-trace-trust.test.mjs tests/implementation/telemetry-log-codes.test.mjs tests/implementation/hub-launch-flags.test.mjs'),
  candidateStep('repository-agent-context', 'node --test tests/repository/check-agent-context.test.mjs tests/repository/labels.test.mjs tests/repository/verify-gates.test.mjs tests/repository/worktree-reap.test.mjs tests/repository/worktree-new.test.mjs tests/repository/check-test-census.test.mjs tests/repository/ci-change-scope.test.mjs tests/repository/ci-install.test.mjs'),
  candidateStep('contract-projection-check-iam', 'node scripts/generate-r1-s1-contracts.mjs --check'),
  candidateStep('contract-projection-check-workspace', 'node scripts/generate-r1-s2-contracts.mjs --check'),
  candidateStep('contract-projection-check-project', 'node scripts/generate-r1-s3-contracts.mjs --check'),
  candidateStep('contract-projection-check-connector', 'node scripts/generate-r1-connector-contracts.mjs --check'),
  candidateStep('repository-contract-checks', 'node --test tests/repository/repository-contract.test.mjs'),
  candidateStep('knip', 'npx --no-install knip && node --test tests/repository/knip-config.test.mjs'),
  candidateStep('biome', 'npx --no-install biome ci .'),

  candidateStep('brand-wordmark-csp', 'node --test tests/implementation/brand-wordmark-csp.test.mjs', 'browser'),
  candidateStep('builder-tool-sentences', 'node --test tests/implementation/builder-tool-sentences.test.mjs'),
  candidateStep('builder-skills-guard', 'node --test tests/implementation/builder-skills-guard.test.mjs tests/implementation/builder-skills-no-answer-key.test.mjs tests/implementation/builder-skill-manifest-vocabulary.test.mjs'),
  candidateStep('builder-guidance-neutral', 'node --test tests/repository/builder-guidance-neutral.test.mjs'),
  candidateStep('conexus-preflight', 'node --test tests/repository/conexus-preflight.test.mjs'),

  candidateStep('identity-access-http', 'node --test tests/implementation/identity-access-http.test.mjs'),
  candidateStep('application-access-http', 'node --test tests/implementation/application-access-http.test.mjs'),
  candidateStep('workspace-membership-http', 'node --test tests/implementation/workspace-membership-http.test.mjs'),
  candidateStep('workspace-http', 'node --test tests/implementation/workspace-http.test.mjs'),
  candidateStep('workspace-reads', 'node --test --test-concurrency=1 tests/implementation/workspace-reads.test.mjs', 'postgres'),
  candidateStep('project-disclosure', 'node --test tests/implementation/project-disclosure.test.mjs'),
  candidateStep('project-command-postgres', 'node --test --test-concurrency=1 tests/implementation/project-command.test.mjs', 'postgres'),
  candidateStep('project-deletion', 'node --test tests/implementation/project-deletion.test.mjs'),
  candidateStep('project-deletion-postgres', 'node --test --test-concurrency=1 tests/implementation/project-deletion-postgres.test.mjs', 'postgres'),
  candidateStep('project-browser', 'node --test --test-concurrency=1 tests/implementation/project-browser.test.mjs', 'browser'),
  candidateStep('project-settings-deletion-browser', 'node --test --test-concurrency=1 tests/implementation/project-settings-deletion-browser.test.mjs', 'browser'),
  candidateStep('project-name', 'node --test tests/implementation/project-name.test.mjs'),
  candidateStep('shell-browser-boundary', 'node --test tests/implementation/shell-browser-boundary.test.mjs'),
  candidateStep('brand-tokens', 'node --test tests/implementation/brand-tokens.test.mjs'),
  candidateStep('web-style', 'node scripts/check-web-style.mjs && node --test tests/repository/web-style.test.mjs'),
  candidateStep('preview-form-policy', 'node --test tests/implementation/preview-form-policy.test.mjs', 'browser'),
  candidateStep('builder-credential-generation', 'node --test tests/implementation/builder-credential-generation.test.mjs'),
  candidateStep('builder-first-operational-delivery', 'node --test tests/implementation/builder-first-operational-delivery.test.mjs'),
  candidateStep('builder-planning-free-boot', 'node --test tests/implementation/builder-planning-free-boot.test.mjs'),
  candidateStep('builder-eval', 'node --test --test-concurrency=1 tests/implementation/builder-eval-criteria.test.mjs tests/implementation/builder-eval-simulator.test.mjs tests/implementation/builder-eval-scorers.test.mjs tests/implementation/builder-eval-serve.test.mjs tests/implementation/builder-eval-experiment.test.mjs tests/implementation/builder-eval-run.test.mjs tests/implementation/builder-eval-oracle.test.mjs tests/implementation/builder-eval-person.test.mjs tests/implementation/builder-eval-timing.test.mjs tests/implementation/builder-eval-plan-score.test.mjs', 'browser'),
  candidateStep('builder-eval-postgres', 'node --test --test-concurrency=1 tests/implementation/builder-eval-experiment-postgres.test.mjs', 'postgres'),
  candidateStep('protected-cluster-coverage', 'node --test tests/implementation/protected-cluster-coverage.test.mjs'),

  candidateStep('wire-openapi-lint', 'npm run wire:lint', 'static', { locks: Object.freeze([NPX_CACHE_LOCK]) }),
  candidateStep('wire-openapi-bundle', 'npm run wire:bundle', 'static', { locks: Object.freeze([NPX_CACHE_LOCK]) }),
  candidateStep('wire-bijection', 'npm run wire:bijection', 'static', AFTER_BUNDLE),
  candidateStep('wire-bijection-gate', 'node --test tests/repository/wire-bijection-gate.test.mjs', 'static', AFTER_BUNDLE),
  candidateStep('wire-carriers', 'npm run wire:carriers', 'static', AFTER_BUNDLE),
  candidateStep('wire-identity-workspace', 'npm run wire:identity-workspace', 'static', AFTER_BUNDLE),
  candidateStep('wire-project', 'npm run wire:project', 'static', AFTER_BUNDLE),
  candidateStep('wire-builder', 'npm run wire:builder', 'static', AFTER_BUNDLE),
  candidateStep('wire-connector', 'npm run wire:connector', 'static', AFTER_BUNDLE),
  candidateStep('wire-technical-lint', 'npm run wire:technical-lint', 'static', { locks: Object.freeze([NPX_CACHE_LOCK]) }),
  candidateStep('wire-technical-ingress', 'npm run wire:technical-ingress', 'static', AFTER_BUNDLE),
  candidateStep('conexus-backup', 'node --test tests/implementation/conexus-backup.test.mjs'),

  candidateStep('test-census', 'node scripts/check-test-census.mjs'),
  candidateStep('only-opt-in-skips', 'node scripts/check-test-skips.mjs', 'static', { after: AFTER_ALL }),
])

// The cheap static checks (typechecks, lint, repository and agent-context checks, contract
// projections, wire checks, census) run before the browser and PostgreSQL suites, so a run that is
// going to fail on them fails in seconds instead of after minutes. Nothing is dropped, only moved.
export const FAST_CHECK_SCOPES = Object.freeze([
  'c020-hub-typecheck',
  'c020-web-typecheck',
  'biome',
  'knip',
  'repository-check',
  'repository-import-law',
  'repository-agent-context',
  'repository-contract-checks',
  'contract-projection-check-iam',
  'contract-projection-check-workspace',
  'contract-projection-check-project',
  'contract-projection-check-connector',
  'conexus-preflight',
  'web-style',
  'builder-guidance-neutral',
  'db-role-register',
  'wire-openapi-lint',
  'wire-openapi-bundle',
  'wire-bijection',
  'wire-bijection-gate',
  'wire-carriers',
  'wire-identity-workspace',
  'wire-project',
  'wire-builder',
  'wire-connector',
  'wire-technical-lint',
  'wire-technical-ingress',
  'test-census',
])

// A stable partition: fast checks first in graph order, then the rest in graph order. The Hub build
// step stays first (it publishes the compiled Hub) and the skip check stays last (it reads the
// ledger of the whole run), because each is first or last in GRAPH_STEPS and the partition keeps order.
export function failFastOrder(steps, fastScopes = FAST_CHECK_SCOPES) {
  const fast = new Set(fastScopes)
  return Object.freeze([...steps.filter(step => fast.has(step.scope)), ...steps.filter(step => !fast.has(step.scope))])
}

export const CANDIDATE_GRAPH = failFastOrder(GRAPH_STEPS)

// A change that touches only documentation runs these steps: every step that reads a Markdown file,
// plus the OpenAPI bundle the bijection check reads, the census and the skip check that close every run. The path test lives in
// scripts/ci-change-scope.mjs.
export const DOCS_CHECK_SCOPES = Object.freeze([
  'repository-check',
  'repository-agent-context',
  'repository-contract-checks',
  'conexus-preflight',
  'wire-openapi-bundle',
  'wire-bijection',
  'wire-bijection-gate',
  'test-census',
  'only-opt-in-skips',
])

export const DOCS_GRAPH = Object.freeze(CANDIDATE_GRAPH.filter(step => DOCS_CHECK_SCOPES.includes(step.scope)))

const GRAPHS = Object.freeze({ candidate: CANDIDATE_GRAPH, 'candidate-docs': DOCS_GRAPH })

// Descriptive aliases make the manifest easy to discover for tests and small
// callers without creating another mutable allowlist.
export const ALLOWED_ALIASES = Object.freeze(Object.keys(SCOPE_MANIFEST))
export const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))

class VerificationCliError extends Error {
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'VerificationCliError'
    this.exitCode = exitCode
  }
}

function own(object, key) {
  return Object.hasOwn(object, key)
}

export function loadPackageScripts(root = repositoryRoot) {
  const packagePath = resolve(root, 'package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (packageJson.scripts === null || typeof packageJson.scripts !== 'object' || Array.isArray(packageJson.scripts)) {
    throw new Error('package.json scripts must be an object')
  }
  return packageJson.scripts
}

export function parseArguments(argv = process.argv.slice(2)) {
  const options = { scopes: [], list: false, dryRun: false, json: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    if (argument === '--list') {
      options.list = true
      continue
    }
    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (argument === '--json') {
      options.json = true
      continue
    }

    let scopeValue
    if (argument === '--scope') {
      index += 1
      scopeValue = argv[index]
      if (scopeValue === undefined || scopeValue.startsWith('--')) {
        throw new VerificationCliError('--scope requires a non-empty value')
      }
    } else if (argument.startsWith('--scope=')) {
      scopeValue = argument.slice('--scope='.length)
      if (!scopeValue) throw new VerificationCliError('--scope requires a non-empty value')
    } else {
      throw new VerificationCliError(`unknown option: ${argument}`)
    }

    const scopes = scopeValue.split(',').map(scope => scope.trim())
    if (scopes.some(scope => !scope)) throw new VerificationCliError('--scope contains an empty value')
    options.scopes.push(...scopes)
  }

  if (!options.help && !options.list && options.scopes.length === 0) {
    throw new VerificationCliError('--scope is required (use --list to inspect available scopes)')
  }

  return options
}

function manifestEntry(scope) {
  const entry = SCOPE_MANIFEST[scope]
  if (!entry) return null
  return {
    scope,
    npmScript: entry.npmScript,
    npmArgs: [...entry.npmArgs],
    alias: true,
  }
}

export function resolveScope(scope, packageScripts = loadPackageScripts()) {
  if (typeof scope !== 'string' || !scope.trim()) {
    throw new VerificationCliError('scope must be a non-empty string')
  }

  const normalized = scope.trim()
  if (own(GRAPHS, normalized)) {
    return { scope: normalized, command: null, graph: normalized }
  }
  const alias = manifestEntry(normalized)
  if (alias) return alias

  if (own(packageScripts, normalized)) {
    if (isMutationScript(normalized)) {
      throw new VerificationCliError(
        `npm script is not permitted as a verification scope: ${normalized} (generation/recording scripts may mutate repository state)`,
      )
    }
    return { scope: normalized, npmScript: normalized, npmArgs: [], alias: false }
  }

  const allowedScripts = Object.keys(packageScripts).sort()
  const suffix = allowedScripts.length ? `; npm scripts: ${allowedScripts.join(', ')}` : ''
  throw new VerificationCliError(
    `unknown verification scope: ${normalized}; aliases: ${ALLOWED_ALIASES.join(', ')}${suffix}`,
  )
}

export function resolveScopes(scopes, packageScripts = loadPackageScripts()) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new VerificationCliError('at least one verification scope is required')
  }
  return scopes.map(scope => resolveScope(scope, packageScripts))
}

export function assertExecutionEnvironment(entries, { platform = process.platform, dryRun = false } = {}) {
  if (dryRun) return
  if (platform !== 'linux' && entries.some(entry => entry.npmScript === 'verify' || own(GRAPHS, entry.graph ?? ''))) {
    throw new VerificationCliError(
      'final verification requires Linux; local Conexus proof must run in WSL Ubuntu with the pinned Node/npm toolchain',
    )
  }
}

export function listScopes(packageScripts = loadPackageScripts()) {
  const allScripts = Object.keys(packageScripts).sort()
  const rejectedScripts = allScripts.filter(isMutationScript)
  const scripts = allScripts.filter(script => !rejectedScripts.includes(script))
  const scopes = [...ALLOWED_ALIASES, ...scripts.filter(script => !ALLOWED_ALIASES.includes(script))]
  return {
    aliases: ALLOWED_ALIASES.map(scope => ({
      scope,
      npmScript: SCOPE_MANIFEST[scope].npmScript,
      npmArgs: [...SCOPE_MANIFEST[scope].npmArgs],
    })),
    scripts,
    rejectedScripts,
    scopes,
  }
}

function isMutationScript(script) {
  return /(?:^|[:_-])(?:generate|record)(?:$|[:_-])/i.test(script)
}

export function commandArguments(entry) {
  if (entry.command) return ['-lc', entry.command]
  return ['run', entry.npmScript, ...(entry.npmArgs.length ? ['--', ...entry.npmArgs] : [])]
}

const LEDGER_REPORTER = resolve(repositoryRoot, 'scripts/test-ledger-reporter.mjs')
const LEDGER_REPORTER_OPTIONS = `--test-reporter=spec --test-reporter-destination=stdout --test-reporter=${LEDGER_REPORTER} --test-reporter-destination=stdout`

// Every step records its skipped tests for the only-opt-in-skips leaf. A fresh ledger per run keeps
// apart two runs that share node_modules through a worktree symlink, and a test that calls
// runVerification in-process cannot clear the ledger of the run it is part of.
export const newTestLedger = (root = repositoryRoot) => Object.freeze({
  root,
  file: resolve(tmpdir(), `conexus-test-ledger-${randomUUID()}.jsonl`),
})

export function executionEnvironment(entry, processEnvironment = process.env, testLedger = null) {
  const nodeOptions = processEnvironment.NODE_OPTIONS ?? ''
  const instrumented = testLedger ? {
    ...processEnvironment,
    CONEXUS_TEST_LEDGER_ROOT: testLedger.root,
    CONEXUS_TEST_LEDGER: testLedger.file,
    NODE_OPTIONS: nodeOptions.includes(LEDGER_REPORTER) ? nodeOptions : `${nodeOptions} ${LEDGER_REPORTER_OPTIONS}`.trim(),
  } : processEnvironment
  if (!POSTGRES_CLASSES.has(entry.environmentClass)) return instrumented

  const names = Object.keys(POSTGRES_ENV_DEFAULTS)
  const selected = names.filter(name => processEnvironment[name])
  if (selected.length !== 0 && selected.length !== names.length) {
    throw new VerificationCliError('PostgreSQL verification requires either all CONEXUS_TEST_DB_* values or none')
  }

  return {
    ...instrumented,
    ...(selected.length === names.length ? {} : POSTGRES_ENV_DEFAULTS),
  }
}

export function formatCommand(entry) {
  if (entry.command) return entry.command
  return ['npm', ...commandArguments(entry)].join(' ')
}

function defaultClock() {
  return Date.now()
}

// A step that never exits burned a whole CI run on 2026-09-19 and left no evidence of which
// command it was. Two rules stop that repeating: no step inherits stdin, so nothing can block
// waiting for input that will never come, and every step is killed after this long and reported
// as a failure naming the command. The bound is far above the slowest honest step, which is a
// few minutes.
export const STEP_TIMEOUT_MS = 10 * 60 * 1000

// Runs one child in its own process group, buffers its output and resolves, never rejects, with
// the shape spawnSync returned. The group is what a timeout and a cancellation kill, so a step's
// browsers and servers die with it.
export function spawnBuffered(file, args, { cwd, env, timeout, killSignal = 'SIGKILL', signal, windowsHide }) {
  return new Promise((resolveResult) => {
    const chunks = { stdout: [], stderr: [] }
    let child
    let timer
    let timedOutAfter = false
    let cancelled = false
    let settled = false
    const kill = () => {
      try { process.kill(-child.pid, killSignal) } catch { try { child.kill(killSignal) } catch { /* already gone */ } }
    }
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolveResult({ ...result, stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') })
    }
    const onAbort = () => { cancelled = true; kill() }
    try {
      child = spawnProcess(file, args, { cwd, env, windowsHide, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      finish({ status: null, error })
      return
    }
    child.stdout.on('data', chunk => chunks.stdout.push(chunk))
    child.stderr.on('data', chunk => chunks.stderr.push(chunk))
    child.on('error', error => finish({ status: null, error }))
    child.on('close', (status, exitSignal) => {
      if (timedOutAfter) finish({ status: null, signal: exitSignal ?? killSignal, error: Object.assign(new Error(`${file} ETIMEDOUT`), { code: 'ETIMEDOUT' }) })
      else finish({ status, signal: exitSignal ?? undefined, ...(cancelled ? { cancelled: true } : {}) })
    })
    if (timeout) timer = setTimeout(() => { timedOutAfter = true; kill() }, timeout)
    if (signal) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export function runNpmScript(entry, { root = repositoryRoot, spawn = spawnBuffered, processEnvironment = process.env, testLedger = null, signal } = {}) {
  const args = commandArguments(entry)
  const executable = entry.command ? (process.platform === 'win32' ? 'bash.exe' : 'bash') : (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  return spawn(executable, args, {
    cwd: root,
    windowsHide: true,
    timeout: STEP_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    ...(signal ? { signal } : {}),
    env: executionEnvironment(entry, processEnvironment, testLedger),
  })
}

function normalizeExitCode(result) {
  if (Number.isInteger(result)) return result
  if (result && Number.isInteger(result.status)) return result.status
  if (result && result.status === null) return null
  if (result?.error) return null
  return 0
}

export function timedOut(result) {
  return result?.error?.code === 'ETIMEDOUT' || (result?.signal === 'SIGKILL' && Boolean(result?.error))
}

function errorMessage(result) {
  if (timedOut(result)) return `step exceeded ${STEP_TIMEOUT_MS / 1000}s and was killed`
  if (!result?.error) return undefined
  return result.error instanceof Error ? result.error.message : String(result.error)
}

// Steps run up to this many at once. CONEXUS_VERIFY_CONCURRENCY overrides the CPU count, and 1
// restores the old strictly serial run.
export function verificationConcurrency(processEnvironment = process.env, cpus = availableParallelism()) {
  const requested = Number(processEnvironment.CONEXUS_VERIFY_CONCURRENCY)
  return Number.isInteger(requested) && requested >= 1 ? requested : Math.max(1, cpus)
}

// A step may start when every earlier publisher is done, what it reads is written, and nothing
// running holds a lock it needs. Steps are offered in graph order, so the fast static checks start
// first and a step blocked on a lock does not hold back the ones behind it.
function isReady(entries, index, { finished, heldLocks }) {
  const entry = entries[index]
  for (let earlier = 0; earlier < index; earlier += 1) {
    if (entries[earlier].publishes && !finished.has(earlier)) return false
  }
  if (entry.after === AFTER_ALL) {
    if (finished.size < entries.length - 1) return false
  } else {
    for (const scope of entry.after ?? []) {
      const target = entries.findIndex(other => other.scope === scope)
      if (target !== -1 && !finished.has(target)) return false
    }
  }
  return locksOf(entry).every(lock => !heldLocks.has(lock))
}

function formatOutput(entry, record, result, processEnvironment) {
  const out = `${result?.stdout ?? ''}${result?.stderr ?? ''}`
  const grouped = Boolean(processEnvironment.GITHUB_ACTIONS)
  const title = `${record.status}: ${entry.scope} (${(record.durationMs / 1000).toFixed(1)} s)`
  if (!out && !grouped) return `${title}\n`
  const body = out.endsWith('\n') || out === '' ? out : `${out}\n`
  return grouped ? `::group::${title}\n${body}::endgroup::\n` : `=== ${title}\n${body}`
}

/**
 * Run the resolved steps up to `concurrency` at a time, honouring what each step declares it
 * shares (see the comment above AFTER_ALL). The first failure stops new steps and cancels the
 * running ones. Each step's output is printed whole when the step ends. Records come back in graph
 * order. `runCommand` may return its result or a promise of it.
 */
export async function runVerification({
  scopes,
  packageScripts,
  root = repositoryRoot,
  dryRun = false,
  platform = process.platform,
  runCommand = runNpmScript,
  clock = defaultClock,
  processEnvironment = process.env,
  concurrency = verificationConcurrency(processEnvironment),
  graphOverride = null,
  write = text => process.stdout.write(text),
  } = {}) {
  const scripts = packageScripts ?? loadPackageScripts(root)
  const requestedEntries = resolveScopes(scopes, scripts)
  assertExecutionEnvironment(requestedEntries, { platform, dryRun })
  const entries = graphOverride ?? requestedEntries.flatMap(entry => own(GRAPHS, entry.graph ?? '') ? GRAPHS[entry.graph] : [entry])
  const recordsByIndex = new Map()
  const published = {}
  const testLedger = newTestLedger(root)

  if (dryRun) {
    const records = entries.map(entry => ({
      scope: entry.scope,
      command: formatCommand(entry),
      ...(entry.environmentClass ? { environmentClass: entry.environmentClass } : {}),
      status: 'dry-run',
      exitCode: null,
      durationMs: 0,
    }))
    return { scopes: entries.map(entry => entry.scope), records, stopped: false, exitCode: 0, wallMs: 0, concurrency }
  }

  const startedRun = clock()
  const abort = new AbortController()
  const state = { finished: new Set(), running: new Map(), heldLocks: new Set() }
  const waiting = new Set(entries.keys())
  let firstFailure = null

  const runStep = async (index) => {
    const entry = entries[index]
    const command = formatCommand(entry)
    const startedAt = clock()
    let result
    try {
      result = await runCommand(entry, { root, command, args: commandArguments(entry), processEnvironment: { ...processEnvironment, ...published }, testLedger, signal: abort.signal })
    } catch (error) {
      result = { status: null, error }
    }
    const durationMs = Math.max(0, Math.round(clock() - startedAt))
    const exitCode = normalizeExitCode(result)
    const cancelled = exitCode !== 0 && firstFailure !== null
    const record = {
      scope: entry.scope,
      command,
      ...(entry.environmentClass ? { environmentClass: entry.environmentClass } : {}),
      status: exitCode === 0 ? 'succeeded' : cancelled ? 'cancelled' : 'failed',
      exitCode,
      durationMs,
    }
    const detail = cancelled ? undefined : errorMessage(result)
    if (detail) record.error = detail
    if (result?.signal) record.signal = result.signal
    recordsByIndex.set(index, record)
    if (typeof result?.stdout === 'string') write(formatOutput(entry, record, result, processEnvironment))

    if (record.status === 'failed') {
      firstFailure = record
      abort.abort()
    } else if (exitCode === 0) {
      for (const [name, path] of Object.entries(entry.publishes ?? {})) published[name] = resolve(root, path)
      state.finished.add(index)
    }
    for (const lock of locksOf(entry)) state.heldLocks.delete(lock)
    state.running.delete(index)
  }

  while (true) {
    if (firstFailure === null) {
      for (const index of [...waiting]) {
        if (state.running.size >= concurrency) break
        if (!isReady(entries, index, state)) continue
        waiting.delete(index)
        for (const lock of locksOf(entries[index])) state.heldLocks.add(lock)
        state.running.set(index, runStep(index))
      }
    }
    if (state.running.size === 0) {
      if (waiting.size > 0 && firstFailure === null) throw new Error(`verification graph deadlock: ${[...waiting].map(index => entries[index].scope).join(', ')}`)
      break
    }
    await Promise.race(state.running.values())
  }

  const records = [...recordsByIndex.entries()].sort(([a], [b]) => a - b).map(([, record]) => record)
  return {
    scopes: entries.map(entry => entry.scope),
    records,
    stopped: Boolean(firstFailure),
    exitCode: firstFailure ? (Number.isInteger(firstFailure.exitCode) ? firstFailure.exitCode : 1) : 0,
    wallMs: Math.max(0, Math.round(clock() - startedRun)),
    concurrency,
  }
}

function helpText() {
  return [
    'Usage: node scripts/conexus-verify.mjs --scope <name[,name...]> [--dry-run] [--json]',
    '       node scripts/conexus-verify.mjs --list [--json]',
    '',
    'Aliases: preflight, repository, final. Other scopes must be explicit npm scripts in package.json.',
  ].join('\n')
}

export function renderStepSummary(records, wallMs = null) {
  const total = records.reduce((sum, record) => sum + record.durationMs, 0)
  const rows = [...records]
    .sort((a, b) => b.durationMs - a.durationMs)
    .map(record => {
      const share = total === 0 ? 0 : (record.durationMs / total) * 100
      return `| ${record.scope} | ${record.status} | ${(record.durationMs / 1000).toFixed(1)} | ${share.toFixed(1)}% |`
    })
  const timing = wallMs === null
    ? `${records.length} steps, ${(total / 1000).toFixed(1)} s in total, slowest first.`
    : `${records.length} steps, ${(wallMs / 1000).toFixed(1)} s wall time, ${(total / 1000).toFixed(1)} s of step time added up (${total === 0 ? '0.0' : (total / Math.max(wallMs, 1)).toFixed(1)}x), slowest first.`
  return [
    '### Verification step timings',
    '',
    timing,
    '',
    '| Step | Status | Seconds | Share |',
    '| --- | --- | ---: | ---: |',
    ...rows,
    '',
  ].join('\n')
}

function writeStepSummary(result, env = process.env) {
  if (!env.GITHUB_STEP_SUMMARY || result.records.length === 0) return
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${renderStepSummary(result.records, result.wallMs)}\n`)
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  for (const record of result.records) {
    if (record.status === 'skipped') {
      console.log(`skipped: ${record.command} (${record.reason})`)
      continue
    }
    const exitCode = record.exitCode === null ? 'n/a' : String(record.exitCode)
    console.log(`${record.status}: ${record.command} (exit=${exitCode}, durationMs=${record.durationMs})`)
  }
  if (!result.records.some(record => record.status === 'dry-run')) {
    console.log(`wall time ${(result.wallMs / 1000).toFixed(1)} s, up to ${result.concurrency} steps at once`)
  }
  if (result.stopped) console.error('verification stopped after the first failed command')
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArguments(argv)
    if (options.help) {
      console.log(helpText())
      return 0
    }

    const packageScripts = loadPackageScripts()
    if (options.list) {
      const available = listScopes(packageScripts)
      if (options.json) process.stdout.write(`${JSON.stringify(available)}\n`)
      else {
        console.log('Aliases:')
        for (const alias of available.aliases) {
          const suffix = alias.npmArgs.length ? ` -- ${alias.npmArgs.join(' ')}` : ''
          console.log(`  ${alias.scope} -> ${alias.npmScript}${suffix}`)
        }
        console.log('npm scripts:')
        for (const script of available.scripts) console.log(`  ${script}`)
      }
      return 0
    }

    const result = await runVerification({
      scopes: options.scopes,
      packageScripts,
      dryRun: options.dryRun,
    })
    printResult(result, options.json)
    writeStepSummary(result)
    return result.exitCode
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (argv.includes('--json')) process.stdout.write(`${JSON.stringify({ error: message })}\n`)
    else console.error(message)
    return error instanceof VerificationCliError ? error.exitCode : 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptFile)) {
  process.exitCode = await main()
}
