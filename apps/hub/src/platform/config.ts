export type HubConfig = Readonly<{
  origin: string
  port: number
  bootstrapSubject: string
  database: Readonly<{
    host: string
    port: number
    database: string
    user: string
    passwordFile: string
    workspace: Readonly<{
      commandPasswordFile: string
      readPasswordFile: string
    }> | undefined
  }>
  project: Readonly<{
    commandPasswordFile: string
    readPasswordFile: string
    baselineReadPasswordFile: string
    baselineCommandPasswordFile: string
    inceptionCommandPasswordFile: string
    storageRoot: string
    gitImportCatalogFile: string
    externalFileSlotsFile: string
    modelCatalogFile: string
    sourceOwnershipManifestFile: string
  }> | undefined
  oidc: Readonly<{ issuer: string; clientId: string; clientSecretFile: string; allowInsecureForTest: boolean }>
}>

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name]
  if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  return value
}

const port = (value: string, name: string): number => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error(`INVALID_CONFIG_${name}`)
  return parsed
}

const workspaceDatabase = (environment: NodeJS.ProcessEnv): HubConfig['database']['workspace'] => {
  const commandPasswordFile = environment.CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE
  const readPasswordFile = environment.CONEXUS_DB_S2_READ_PASSWORD_FILE
  if (commandPasswordFile && readPasswordFile) return { commandPasswordFile, readPasswordFile }
  if (commandPasswordFile || readPasswordFile || environment.NODE_ENV !== 'test') {
    if (!commandPasswordFile) throw new Error('MISSING_CONFIG_CONEXUS_DB_WS01_COMMAND_PASSWORD_FILE')
    throw new Error('MISSING_CONFIG_CONEXUS_DB_S2_READ_PASSWORD_FILE')
  }
  return undefined
}

const projectRuntime = (environment: NodeJS.ProcessEnv): HubConfig['project'] => {
  const values = {
    commandPasswordFile: environment.CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE,
    readPasswordFile: environment.CONEXUS_DB_S3_READ_PASSWORD_FILE,
    baselineReadPasswordFile: environment.CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE,
    baselineCommandPasswordFile: environment.CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE,
    inceptionCommandPasswordFile: environment.CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE,
    storageRoot: environment.CONEXUS_PROJECT_STORAGE_ROOT,
    gitImportCatalogFile: environment.CONEXUS_GIT_IMPORT_CATALOG_FILE,
    externalFileSlotsFile: environment.CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE,
    modelCatalogFile: environment.CONEXUS_PROJECT_MODEL_CATALOG_FILE,
    sourceOwnershipManifestFile: environment.CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE,
  }
  if (Object.values(values).every(Boolean)) return values as HubConfig['project']
  if (Object.values(values).some(Boolean)) {
    for (const [name, value] of Object.entries({
      CONEXUS_DB_PRJ03_COMMAND_PASSWORD_FILE: values.commandPasswordFile,
      CONEXUS_DB_S3_READ_PASSWORD_FILE: values.readPasswordFile,
      CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE: values.baselineReadPasswordFile,
      CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE: values.baselineCommandPasswordFile,
      CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE: values.inceptionCommandPasswordFile,
      CONEXUS_PROJECT_STORAGE_ROOT: values.storageRoot,
      CONEXUS_GIT_IMPORT_CATALOG_FILE: values.gitImportCatalogFile,
      CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE: values.externalFileSlotsFile,
      CONEXUS_PROJECT_MODEL_CATALOG_FILE: values.modelCatalogFile,
      CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: values.sourceOwnershipManifestFile,
    })) if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  }
  return undefined
}

export const readHubConfig = (environment: NodeJS.ProcessEnv = process.env): HubConfig => ({
  origin: required(environment, 'CONEXUS_ORIGIN'),
  port: port(environment.CONEXUS_PORT ?? '3000', 'CONEXUS_PORT'),
  bootstrapSubject: required(environment, 'CONEXUS_BOOTSTRAP_SUBJECT'),
  database: {
    host: required(environment, 'CONEXUS_DB_HOST'),
    port: port(required(environment, 'CONEXUS_DB_PORT'), 'CONEXUS_DB_PORT'),
    database: required(environment, 'CONEXUS_DB_NAME'),
    user: required(environment, 'CONEXUS_DB_USER'),
    passwordFile: required(environment, 'CONEXUS_DB_PASSWORD_FILE'),
    workspace: workspaceDatabase(environment),
  },
  project: projectRuntime(environment),
  oidc: {
    issuer: required(environment, 'CONEXUS_OIDC_ISSUER'),
    clientId: required(environment, 'CONEXUS_OIDC_CLIENT_ID'),
    clientSecretFile: required(environment, 'CONEXUS_OIDC_CLIENT_SECRET_FILE'),
    allowInsecureForTest: environment.NODE_ENV === 'test' && environment.CONEXUS_TEST_ALLOW_INSECURE_OIDC === 'true',
  },
})
