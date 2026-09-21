import { parseArgs } from 'node:util'
import { createPostgresPool } from './platform/postgres.js'
import { readSecretFile } from './platform/secrets.js'

process.env.MASTRA_TELEMETRY_DISABLED = '1'
const { createFactoryPool, createFactoryStorage } = await import('./builder/factory.js')
const { createGithubApp } = await import('./builder/factory-github.js')
const { connectFactoryInstallation, openFactoryRecords, provisionFactoryProject } = await import('./builder/factory-provisioning.js')

const USAGE = 'usage: factory-cli connect | factory-cli provision --project <conexusProjectId> --name <repositoryName>'

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  return value
}

const main = async (): Promise<void> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { project: { type: 'string' }, name: { type: 'string' } },
  })
  const command = positionals[0]
  if (positionals.length !== 1 || (command !== 'connect' && command !== 'provision')) throw new Error(USAGE)
  if (command === 'provision' && (!values.project || !values.name)) throw new Error(USAGE)

  const database = { host: required('CONEXUS_DB_HOST'), port: Number(required('CONEXUS_DB_PORT')), database: required('CONEXUS_DB_NAME') }
  const orgId = required('CONEXUS_FACTORY_ORG_ID')
  // The client secret is not needed to read the App, but a Hub that cannot read it cannot start
  // the Factory either, so connect refuses here rather than at the next boot.
  readSecretFile(required('CONEXUS_FACTORY_GITHUB_CLIENT_SECRET_FILE'))
  const github = createGithubApp({
    appId: required('CONEXUS_FACTORY_GITHUB_APP_ID'),
    privateKey: readSecretFile(required('CONEXUS_FACTORY_GITHUB_PRIVATE_KEY_FILE')),
  })
  const factoryPool = createFactoryPool(database, readSecretFile(required('CONEXUS_DB_FACTORY_PASSWORD_FILE')))
  const storage = createFactoryStorage(factoryPool)
  const write = (line: string): void => { process.stdout.write(`${line}\n`) }
  try {
    const records = await openFactoryRecords(storage)
    if (command === 'connect') {
      await connectFactoryInstallation({ github, records, orgId, write })
      return
    }
    const executorPool = createPostgresPool({ ...database, user: 'hub_builder_executor', password: readSecretFile(required('CONEXUS_DB_BUILDER_EXECUTOR_PASSWORD_FILE')) })
    try {
      const binding = await provisionFactoryProject({ github, records, executorPool, orgId, projectId: values.project as string, name: values.name as string })
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
