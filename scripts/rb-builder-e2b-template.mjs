import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { E2B, Template } from 'e2b'

export const BUILDER_TEMPLATE_NAME = 'conexus-rb-builder-first'
export const BUILDER_TEMPLATE_NODE_VERSION = '24.20.0'
export const BUILDER_TEMPLATE_BASE_IMAGE = 'node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e'
export const BUILDER_TEMPLATE_CPU_COUNT = 2
export const BUILDER_TEMPLATE_MEMORY_MB = 2_048

export const createBuilderTemplate = (Template) => Template()
  .fromImage(BUILDER_TEMPLATE_BASE_IMAGE)
  .setUser('root')
  .runCmd([
    'apt-get update',
    'DEBIAN_FRONTEND=noninteractive DEBCONF_NOWARNINGS=yes apt-get install -y --no-install-recommends ca-certificates git',
    'rm -rf /var/lib/apt/lists/*',
  ].join(' && '))
  .makeDir('/workspace', { mode: 0o700 })
  .setWorkdir('/workspace')
  .setReadyCmd([
    `test "$(node --version)" = "v${BUILDER_TEMPLATE_NODE_VERSION}"`,
    'git --version',
    'test "$(pwd)" = "/workspace"',
  ].join(' && '))

export const inspectBuilderTemplate = async (Template) => {
  const template = createBuilderTemplate(Template)
  const recipe = await Template.toJSON(template, true)
  const recipeSha256 = createHash('sha256').update(recipe).digest('hex')
  return Object.freeze({
    template,
    recipe,
    recipeSha256,
    buildName: `${BUILDER_TEMPLATE_NAME}:recipe-${recipeSha256.slice(0, 16)}`,
  })
}

export const readBuilderE2BApiKey = (path) => {
  if (!path) throw new Error('MISSING_CONFIG_CONEXUS_BUILDER_E2B_API_KEY_FILE')
  let file
  try {
    file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(file)
    const currentUid = process.getuid?.()
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 ||
      (currentUid !== undefined && stat.uid !== currentUid) || stat.size < 1 || stat.size > 16 * 1_024) {
      throw new Error('BUILDER_E2B_API_KEY_FILE_REFUSED')
    }
    const value = readFileSync(file, 'utf8').trim()
    if (!value) throw new Error('BUILDER_E2B_API_KEY_FILE_REFUSED')
    return value
  } catch (error) {
    if (error instanceof Error && error.message === 'BUILDER_E2B_API_KEY_FILE_REFUSED') throw error
    throw new Error('BUILDER_E2B_API_KEY_FILE_REFUSED')
  } finally {
    if (file !== undefined) closeSync(file)
  }
}

export const checkBuilderTemplate = async () => {
  const inspected = await inspectBuilderTemplate(Template)
  const parsed = JSON.parse(inspected.recipe)
  if (parsed.fromImage !== BUILDER_TEMPLATE_BASE_IMAGE || parsed.readyCmd.includes('E2B_API_KEY') ||
    parsed.steps.some((step) => JSON.stringify(step).includes('COPY')) ||
    !parsed.steps.some((step) => step.type === 'USER' && step.args[0] === 'root')) {
    throw new Error('BUILDER_E2B_TEMPLATE_RECIPE_REFUSED')
  }
  return inspected
}

export const buildBuilderTemplate = async (environment = process.env, E2BClient = E2B) => {
  const apiKey = readBuilderE2BApiKey(environment.CONEXUS_BUILDER_E2B_API_KEY_FILE)
  const client = new E2BClient({ apiKey })
  const inspected = await inspectBuilderTemplate(client.Template)
  const built = await client.Template.build(inspected.template, inspected.buildName, {
    cpuCount: BUILDER_TEMPLATE_CPU_COUNT,
    memoryMB: BUILDER_TEMPLATE_MEMORY_MB,
  })
  if (!built.templateId || !built.buildId) throw new Error('BUILDER_E2B_TEMPLATE_BUILD_IDENTITY_REFUSED')
  const immutableTag = `build-${built.buildId}`
  await client.Template.assignTags(inspected.buildName, immutableTag)
  return Object.freeze({
    recipeSha256: inspected.recipeSha256,
    buildName: inspected.buildName,
    templateId: built.templateId,
    buildId: built.buildId,
    runtimeTemplateRef: `${built.templateId}:${immutableTag}`,
  })
}

const main = async () => {
  const command = process.argv[2] ?? '--check'
  if (!['--check', '--build'].includes(command) || process.argv.length > 3) {
    throw new Error('USAGE: node scripts/rb-builder-e2b-template.mjs [--check|--build]')
  }
  if (command === '--build' && process.env.CONEXUS_RB_E2B_TEMPLATE_BUILD !== 'true') {
    throw new Error('BUILDER_E2B_TEMPLATE_BUILD_AUTHORIZATION_REQUIRED')
  }
  const result = command === '--build' ? await buildBuilderTemplate() : await checkBuilderTemplate()
  const disclosure = command === '--build'
    ? result
    : { recipeSha256: result.recipeSha256, buildName: result.buildName }
  process.stdout.write(`${JSON.stringify(disclosure, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'BUILDER_E2B_TEMPLATE_FAILED'}\n`)
    process.exitCode = 1
  })
}
