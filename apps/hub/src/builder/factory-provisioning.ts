import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { FactoryProjectsStorage } from '@mastra/factory'
import { getAuthProviderId } from '@mastra/factory/routes/provider-credentials'
import type { ModelCredentialsStorage } from '@mastra/factory/storage/domains/credentials/base'
import { MemorySettingsStorage } from '@mastra/factory/storage/domains/memory-settings/base'
import { SourceControlStorage } from '@mastra/factory/storage/domains/source-control/base'
import type { PgFactoryStorage } from '@mastra/pg'
import { FACTORY_INTEGRATION_ID, FACTORY_OPERATOR_ID } from './factory.js'
import type { GithubApp } from './factory-github.js'
import { encodeKey, GOOGLE_AI_PRO_PROVIDER, type GoogleAiProKey, isAuthFileName, parseKey, seedGoogleAiProMemory } from './google-ai-pro/credential.js'

export type FactoryRecords = Readonly<{
  sourceControl: ReturnType<SourceControlStorage['forIntegration']>
  projects: FactoryProjectsStorage
  memorySettings: MemorySettingsStorage
}>

const domainOf = <T extends Readonly<{ name: string }>>(storage: PgFactoryStorage, domain: T): Readonly<{ domain: T; fresh: boolean }> =>
  storage.hasDomain(domain.name)
    ? { domain: storage.getDomain(domain.name) as unknown as T, fresh: false }
    : { domain: storage.registerDomain(domain as never) as unknown as T, fresh: true }

// The same storage API the Factory uses at runtime. A one-shot command registers it without
// prepare(), so it never loads Mastra Code; the Hub reads the domains its prepared Factory holds.
export const openFactoryRecords = async (storage: PgFactoryStorage): Promise<FactoryRecords> => {
  const opened = [
    domainOf(storage, new SourceControlStorage()),
    domainOf(storage, new FactoryProjectsStorage()),
    domainOf(storage, new MemorySettingsStorage()),
  ] as const
  const [{ domain: sourceControl }, { domain: projects }, { domain: memorySettings }] = opened
  if (opened.some(({ fresh }) => fresh)) await storage.init()
  return Object.freeze({ sourceControl: sourceControl.forIntegration(FACTORY_INTEGRATION_ID), projects, memorySettings })
}

export const FACTORY_MEMORY_MODEL_ID = /^[\w.-]+\/[\w.:-]+$/
const MODEL_ID = FACTORY_MEMORY_MODEL_ID

export const setFactoryMemoryModel = async ({ records, orgId, modelId, write }: Readonly<{
  records: Pick<FactoryRecords, 'memorySettings'>
  orgId: string
  modelId: string
  write(line: string): void
}>): Promise<void> => {
  if (!MODEL_ID.test(modelId)) throw new Error('FACTORY_MEMORY_MODEL_REFUSED')
  await records.memorySettings.patch({ orgId, userId: FACTORY_OPERATOR_ID, patch: { observerModelId: modelId, reflectorModelId: modelId } })
  write(`FACTORY_MEMORY_MODEL=${modelId}`)
}

const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,63}$/
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type HostCredential = Readonly<{ type: 'oauth'; access: string; refresh: string; expires: number }> | Readonly<{ type: 'api_key'; key: string }>

const hostCredential = (entry: unknown): HostCredential | null => {
  if (typeof entry !== 'object' || entry === null) return null
  const value = entry as Readonly<Record<string, unknown>>
  if (value.type === 'oauth' && typeof value.access === 'string' && typeof value.refresh === 'string' && typeof value.expires === 'number') return value as HostCredential
  if (value.type === 'api_key' && typeof value.key === 'string' && value.key.trim()) return value as HostCredential
  return null
}

/**
 * Copies one provider's login from a Mastra Code auth.json into the Factory's credentials domain,
 * as the installation's shared row or one person's row. Rerunning replaces that row. Only the
 * provider and the row are printed, never the credential.
 */
export const importHostCredential = async ({ credentials, orgId, provider, accountId, authFile, write }: Readonly<{
  credentials: Pick<ModelCredentialsStorage, 'setCredential'>
  orgId: string
  provider: string
  // null is the installation's shared row.
  accountId: string | null
  authFile: string
  write(line: string): void
}>): Promise<void> => {
  if (!PROVIDER.test(provider)) throw new Error('FACTORY_HOST_CREDENTIAL_PROVIDER_REFUSED')
  if (accountId !== null && !ACCOUNT_ID.test(accountId)) throw new Error('FACTORY_HOST_CREDENTIAL_ACCOUNT_REFUSED')
  let entries: Readonly<Record<string, unknown>>
  try {
    entries = JSON.parse(await readFile(authFile, 'utf8'))
  } catch {
    throw new Error('FACTORY_HOST_AUTH_FILE_UNREADABLE')
  }
  // The Factory keys a row by the auth provider id, which for OpenAI is openai-codex.
  const storedAs = getAuthProviderId(provider)
  const credential = hostCredential(entries[provider] ?? entries[storedAs])
  if (!credential) throw new Error(`FACTORY_HOST_CREDENTIAL_MISSING:${provider}`)
  await credentials.setCredential(accountId === null ? { orgId } : { orgId, userId: accountId }, storedAs, credential)
  write(`FACTORY_HOST_CREDENTIAL_IMPORTED=${storedAs}:${credential.type}:${accountId ?? 'shared'}`)
}

/**
 * Stores a CLIProxyAPI Antigravity auth file as a Google AI Pro credential, the row the Settings
 * sign-in writes, for when nobody can sign in through a browser. A person's row also gets the
 * sign-in's memory seed. Rerunning replaces the row. The credential is never printed.
 */
export const importGoogleAiProLogin = async ({ credentials, memorySettings, orgId, accountId, authFile, write }: Readonly<{
  credentials: Pick<ModelCredentialsStorage, 'setCredential'>
  memorySettings: Pick<MemorySettingsStorage, 'ensureReady' | 'patch'>
  orgId: string
  // null is the installation's shared row.
  accountId: string | null
  authFile: string
  write(line: string): void
}>): Promise<void> => {
  if (accountId !== null && !ACCOUNT_ID.test(accountId)) throw new Error('GOOGLE_AI_PRO_LOGIN_ACCOUNT_REFUSED')
  const fileName = basename(authFile)
  if (!isAuthFileName(fileName)) throw new Error('GOOGLE_AI_PRO_LOGIN_FILE_REFUSED')
  let key: GoogleAiProKey | null
  try {
    key = parseKey(encodeKey({ fileName, bytes: new Uint8Array(await readFile(authFile)) }))
  } catch {
    key = null
  }
  if (!key) throw new Error('GOOGLE_AI_PRO_LOGIN_UNREADABLE')
  await credentials.setCredential(accountId === null ? { orgId } : { orgId, userId: accountId }, GOOGLE_AI_PRO_PROVIDER, { type: 'api_key', key })
  if (accountId !== null) await seedGoogleAiProMemory(memorySettings, { orgId, userId: accountId })
  write(`GOOGLE_AI_PRO_LOGIN_IMPORTED=${GOOGLE_AI_PRO_PROVIDER}:api_key:${accountId ?? 'shared'}`)
}

const ORGANIZATION_REQUIRED = 'FACTORY_INSTALLATION_ORGANIZATION_REQUIRED: GitHub does not let an App create repositories in a personal account. Install the App on a GitHub organization (a free organization allows private repositories) and connect again.'

export const connectFactoryInstallation = async ({ github, records, orgId, write }: Readonly<{
  github: GithubApp
  records: FactoryRecords
  orgId: string
  write(line: string): void
}>): Promise<void> => {
  const app = await github.readApp()
  write(`CONEXUS_FACTORY_GITHUB_CLIENT_ID=${app.clientId}`)
  write(`CONEXUS_FACTORY_GITHUB_APP_SLUG=${app.slug}`)
  const installations = await github.listInstallations()
  if (installations.length === 0) throw new Error('FACTORY_INSTALLATION_MISSING: install the App on one GitHub organization, then connect again.')
  if (installations.length > 1) throw new Error('FACTORY_INSTALLATION_AMBIGUOUS: the App is installed on more than one account. Keep one organization installation, then connect again.')
  const [installation] = installations as [typeof installations[number]]
  if (installation.accountType === 'User') throw new Error(ORGANIZATION_REQUIRED)
  const externalId = String(installation.id)
  const { installations: recorded, repositories } = records.sourceControl
  // GitHub lists every live installation of the App, so any other recorded one is gone. Its rows
  // move to the live one, which keeps every id a binding names; only the same account can own them.
  const gone = await Promise.all((await recorded.list({ orgId })).filter((row) => row.externalId !== externalId)
    .map(async (old) => ({ old, held: await repositories.list({ orgId, installationId: old.id }) })))
  const foreign = gone.find(({ old, held }) => held.length > 0 && old.accountName !== installation.accountLogin)
  if (foreign) {
    throw new Error(`FACTORY_INSTALLATION_ACCOUNT_CHANGED: repositories of ${foreign.old.accountName} are recorded under an installation that is gone. Install the App on ${foreign.old.accountName} again.`)
  }
  const existing = await recorded.findByExternalId({ orgId, externalId })
  const live = existing && existing.accountName === installation.accountLogin && existing.accountType === installation.accountType
    ? existing
    : await recorded.upsert({
      orgId,
      connectedByUserId: FACTORY_OPERATOR_ID,
      externalId,
      accountName: installation.accountLogin,
      accountType: installation.accountType,
    })
  // The Factory's own reinstall move. It needs the old installation, so the rows move before it goes.
  // When the live installation already holds the same repository, the move answers that other row
  // and leaves this one behind, still named by its Project's binding, so connect stops there.
  for (const { old, held } of gone) {
    for (const repository of held) {
      const moved = await repositories.migrateInstallation({ orgId, id: repository.id, newInstallationId: live.id })
      if (moved.id !== repository.id) throw new Error(`FACTORY_INSTALLATION_REPOSITORY_CONFLICT: ${repository.slug} is already recorded under the new installation.`)
    }
    await recorded.delete({ orgId, id: old.id })
  }
  write(`FACTORY_INSTALLATION=${externalId} ACCOUNT=${installation.accountLogin} TYPE=${installation.accountType}`)
}
