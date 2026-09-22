import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createPostgresPool } from './platform/postgres.js'
import { readSecretFile } from './platform/secrets.js'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { createFactoryPool, createFactorySecretKeyEncryption, createFactoryStorage } = await import('./builder/factory.js')
const { ModelCredentialsStorage } = await import('@mastra/factory/storage/domains/credentials/base')
const { createGithubApp } = await import('./builder/factory-github.js')
const { MemorySettingsStorage } = await import('@mastra/factory/storage/domains/memory-settings/base')
const { connectFactoryInstallation, importGoogleAiProLogin, importHostCredential, openFactoryRecords, provisionFactoryProject, setFactoryMemoryModel } = await import('./builder/factory-provisioning.js')

const USAGE = 'usage: factory-cli connect | factory-cli memory --model <provider/model> | factory-cli provision --project <conexusProjectId> --name <projectName> | factory-cli import-host-credential --provider <id> (--shared | --account-id <accountId>) [--auth-file <path>] | factory-cli import-google-ai-pro-login --auth-file <antigravity-*.json> (--shared | --account-id <accountId>)'
const COMMANDS = new Set(['connect', 'memory', 'provision', 'import-host-credential', 'import-google-ai-pro-login'])

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  return value
}

const main = async (): Promise<void> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' }, name: { type: 'string' }, model: { type: 'string' },
      provider: { type: 'string' }, shared: { type: 'boolean' }, 'account-id': { type: 'string' }, 'auth-file': { type: 'string' },
    },
  })
  const command = positionals[0]
  if (positionals.length !== 1 || !command || !COMMANDS.has(command)) throw new Error(USAGE)
  if (command === 'provision' && (!values.project || !values.name)) throw new Error(USAGE)
  if (command === 'memory' && !values.model) throw new Error(USAGE)
  if (command === 'import-host-credential' && (!values.provider || Boolean(values.shared) === Boolean(values['account-id']))) throw new Error(USAGE)
  if (command === 'import-google-ai-pro-login' && (!values['auth-file'] || Boolean(values.shared) === Boolean(values['account-id']))) throw new Error(USAGE)

  const database = { host: required('CONEXUS_DB_HOST'), port: Number(required('CONEXUS_DB_PORT')), database: required('CONEXUS_DB_NAME') }
  const orgId = required('CONEXUS_FACTORY_ORG_ID')
  const factoryPool = createFactoryPool(database, readSecretFile(required('CONEXUS_DB_FACTORY_PASSWORD_FILE')))
  const storage = createFactoryStorage(factoryPool)
  const write = (line: string): void => { process.stdout.write(`${line}\n`) }
  try {
    if (command === 'import-host-credential') {
      // Written through the Factory's own domain with the Hub's key, as the Hub's routes write it.
      const credentials = storage.registerDomain(new ModelCredentialsStorage(createFactorySecretKeyEncryption(readSecretFile(required('CONEXUS_FACTORY_SECRET_KEY_FILE')))))
      await storage.init()
      await importHostCredential({
        credentials, orgId, write,
        provider: values.provider as string,
        accountId: values.shared ? null : values['account-id'] as string,
        authFile: values['auth-file'] ?? join(homedir(), '.local/share/mastracode/auth.json'),
      })
      return
    }
    if (command === 'import-google-ai-pro-login') {
      const credentials = storage.registerDomain(new ModelCredentialsStorage(createFactorySecretKeyEncryption(readSecretFile(required('CONEXUS_FACTORY_SECRET_KEY_FILE')))))
      const memorySettings = storage.registerDomain(new MemorySettingsStorage())
      await storage.init()
      await importGoogleAiProLogin({
        credentials, memorySettings, orgId, write,
        accountId: values.shared ? null : values['account-id'] as string,
        authFile: values['auth-file'] as string,
      })
      return
    }
    const records = await openFactoryRecords(storage)
    if (command === 'memory') {
      await setFactoryMemoryModel({ records, orgId, modelId: values.model as string, write })
      return
    }
    // The client secret is not needed to read the App, but a Hub that cannot read it cannot start
    // the Factory either, so connect refuses here rather than at the next boot.
    readSecretFile(required('CONEXUS_FACTORY_GITHUB_CLIENT_SECRET_FILE'))
    const github = createGithubApp({
      appId: required('CONEXUS_FACTORY_GITHUB_APP_ID'),
      privateKey: readSecretFile(required('CONEXUS_FACTORY_GITHUB_PRIVATE_KEY_FILE')),
    })
    if (command === 'connect') {
      await connectFactoryInstallation({ github, records, orgId, write })
      return
    }
    const executorPool = createPostgresPool({ ...database, user: 'hub_builder_executor', password: readSecretFile(required('CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE')) })
    try {
      const binding = await provisionFactoryProject({ github, records, executorPool, orgId, projectId: values.project as string, projectName: values.name as string })
      write(JSON.stringify(binding, null, 2))
    } finally {
      await executorPool.end()
    }
  } finally {
    await storage.close().catch(() => undefined)
    await factoryPool.end().catch(() => undefined)
  }
}

try {
  await main()
} catch (error) {
  // Errors here are named codes, GitHub statuses or database messages. None carries a secret.
  process.stderr.write(`${error instanceof Error ? error.message : 'FACTORY_CLI_FAILED'}\n`)
  process.exitCode = 1
}
