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
  brain: Readonly<{
    readPasswordFile: string
  }> | undefined
  connections: Readonly<{
    passwordFile: string
    credentialRoot: string
    credentialKeyFile: string
    credentialKeyGeneration: string
  }> | undefined
  projectBindings: Readonly<{
    passwordFile: string
    storageRoot: string
    /** Manifest-only source ownership remains available for BRN-14 context. */
    sourceOwnershipManifestFile?: string
    brain?: Readonly<{
      attesterPasswordFile: string
      keyConformanceSubjectPasswordFile: string
      sourceOwnershipManifestFile: string
      registrationCatalogFile: string
    }>
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
  // R2 binding settlement can reuse an existing Project source root without
  // enabling the independently configured R1 creation/cognition capability.
  if (environment.CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE &&
    !Object.entries(values).some(([name, value]) =>
      !['storageRoot', 'sourceOwnershipManifestFile'].includes(name) && Boolean(value))) return undefined
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

const brainRuntime = (environment: NodeJS.ProcessEnv): HubConfig['brain'] => {
  const readPasswordFile = environment.CONEXUS_DB_R2_BRAIN_READ_PASSWORD_FILE
  if (readPasswordFile) return { readPasswordFile }
  return undefined
}

const connectionsRuntime = (environment: NodeJS.ProcessEnv): HubConfig['connections'] => {
  const values = {
    passwordFile: environment.CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE,
    credentialRoot: environment.CONEXUS_CONNECTION_CREDENTIAL_ROOT,
    credentialKeyFile: environment.CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE,
    credentialKeyGeneration: environment.CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION,
  }
  if (Object.values(values).every(Boolean)) return values as HubConfig['connections']
  if (Object.values(values).some(Boolean)) {
    for (const [name, value] of Object.entries({
      CONEXUS_DB_R2_CONNECTIONS_PASSWORD_FILE: values.passwordFile,
      CONEXUS_CONNECTION_CREDENTIAL_ROOT: values.credentialRoot,
      CONEXUS_CONNECTION_CREDENTIAL_KEY_FILE: values.credentialKeyFile,
      CONEXUS_CONNECTION_CREDENTIAL_KEY_GENERATION: values.credentialKeyGeneration,
    })) if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  }
  return undefined
}

const projectBindingRuntime = (environment: NodeJS.ProcessEnv): HubConfig['projectBindings'] => {
  const passwordFile = environment.CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE
  const storageRoot = environment.CONEXUS_PROJECT_STORAGE_ROOT
  const legacyAttester = environment.CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE
  const legacySource = environment.CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE
  const newBrainInputsPresent = Boolean(
    environment.CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE ||
    environment.CONEXUS_R2_KEY_CONFORMANCE_REGISTRATION_CATALOG_FILE,
  )
  if (!passwordFile) {
    // Storage and source ownership are also valid R1 Project inputs; only
    // binding-exclusive inputs can opt into the R2 binding runtime.
    if (legacyAttester || newBrainInputsPresent) {
      if (legacyAttester && !environment.CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE) {
        throw new Error('MISSING_CONFIG_CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE')
      }
      throw new Error('MISSING_CONFIG_CONEXUS_DB_R2_PROJECT_BINDING_PASSWORD_FILE')
    }
    return undefined
  }
  if (!storageRoot) throw new Error('MISSING_CONFIG_CONEXUS_PROJECT_STORAGE_ROOT')

  const brainValues = {
    attesterPasswordFile: environment.CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE,
    keyConformanceSubjectPasswordFile: environment.CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE,
    sourceOwnershipManifestFile: environment.CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE,
    registrationCatalogFile: environment.CONEXUS_R2_KEY_CONFORMANCE_REGISTRATION_CATALOG_FILE,
  }
  if (legacyAttester && !newBrainInputsPresent) {
    throw new Error('MISSING_CONFIG_CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE')
  }
  if (!newBrainInputsPresent && legacySource) {
    return {
      passwordFile,
      storageRoot,
      sourceOwnershipManifestFile: legacySource,
    }
  }
  if (Object.values(brainValues).every(Boolean)) {
    return {
      passwordFile,
      storageRoot,
      brain: brainValues as NonNullable<NonNullable<HubConfig['projectBindings']>['brain']>,
    }
  }
  if (Object.values(brainValues).some(Boolean)) {
    for (const [name, value] of Object.entries({
      CONEXUS_DB_R2_BRAIN_ATTESTER_PASSWORD_FILE: brainValues.attesterPasswordFile,
      CONEXUS_DB_R2_KEY_CONFORMANCE_SUBJECT_PASSWORD_FILE: brainValues.keyConformanceSubjectPasswordFile,
      CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE: brainValues.sourceOwnershipManifestFile,
      CONEXUS_R2_KEY_CONFORMANCE_REGISTRATION_CATALOG_FILE: brainValues.registrationCatalogFile,
    })) if (!value) throw new Error(`MISSING_CONFIG_${name}`)
  }
  return { passwordFile, storageRoot }
}

export const readHubConfig = (environment: NodeJS.ProcessEnv = process.env): HubConfig => {
  const config: HubConfig = {
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
    brain: brainRuntime(environment),
    connections: connectionsRuntime(environment),
    projectBindings: projectBindingRuntime(environment),
    oidc: {
      issuer: required(environment, 'CONEXUS_OIDC_ISSUER'),
      clientId: required(environment, 'CONEXUS_OIDC_CLIENT_ID'),
      clientSecretFile: required(environment, 'CONEXUS_OIDC_CLIENT_SECRET_FILE'),
      allowInsecureForTest: environment.NODE_ENV === 'test' && environment.CONEXUS_TEST_ALLOW_INSECURE_OIDC === 'true',
    },
  }
  if (config.projectBindings?.brain && (!config.brain || !config.connections)) {
    throw new Error('PROJECT_BINDING_BRAIN_RUNTIME_UNAVAILABLE')
  }
  return config
}
