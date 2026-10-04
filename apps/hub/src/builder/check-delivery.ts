import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Failure } from '../platform/failure.js'
import { commandEvidence } from './application-starter.js'

/** The check the Hub sends to each VM: one file, identified by its sha256. */
export type CheckBundle = Readonly<{ sha256: string; bytes: Uint8Array }>

const BUNDLE_PATH = join(import.meta.dirname, '..', 'app-check', 'main.mjs')

/**
 * Reads the bundle `scripts/build-app-check.mjs` left beside the compiled Hub, once, when the Hub
 * starts. A Hub built without it cannot check anything, so it refuses to start.
 */
export const loadCheckBundle = (): CheckBundle => {
  let bytes: Buffer
  try {
    bytes = readFileSync(BUNDLE_PATH)
  } catch (cause) {
    throw new Failure('CONFIG_MISSING', { cause, details: { name: 'app-check/main.mjs' } })
  }
  return Object.freeze({ sha256: createHash('sha256').update(bytes).digest('hex'), bytes: new Uint8Array(bytes) })
}

const CHECK_ROOT = '/opt/conexus/check'

/** Where this bundle runs from: a directory named by its own hash, which no other bundle shares. */
export const checkEntryPath = (sha256: string): string => `${CHECK_ROOT}/${sha256}/main.mjs`

type RootVm = Readonly<{
  asRoot(script: string): Promise<Readonly<{ exitCode: number; stderr: string }>>
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
}>

const hashOf = (path: string): string => `"$(sha256sum '${path}' 2>/dev/null | cut -d' ' -f1)"`

/**
 * Puts the bundle in the VM, once per bundle. The directory is written beside its place, checked,
 * and renamed into it, so no check ever sees a half written bundle, and a rename that loses to
 * another install of the same bytes counts as installed. A directory is never written twice, so a
 * check already running finishes on its own bytes. Root writes it, the agent's user can only read it.
 */
export const installCheck = async (vm: RootVm, bundle: CheckBundle): Promise<void> => {
  const entry = checkEntryPath(bundle.sha256)
  if ((await vm.asRoot(`[ ${hashOf(entry)} = '${bundle.sha256}' ]`)).exitCode === 0) return
  const staging = `${CHECK_ROOT}/.tmp-${randomUUID()}`
  await vm.writeRootFile(`${staging}/main.mjs`, bundle.bytes)
  const placed = await vm.asRoot([
    `if [ ${hashOf(`${staging}/main.mjs`)} != '${bundle.sha256}' ]; then rm -rf '${staging}'; exit 1; fi`,
    `chmod 444 '${staging}/main.mjs' && chmod 755 '${staging}'`,
    `if mv -T '${staging}' '${CHECK_ROOT}/${bundle.sha256}' 2>/dev/null; then exit 0; fi`,
    `if [ ${hashOf(entry)} = '${bundle.sha256}' ]; then rm -rf '${staging}'; exit 0; fi`,
    `rm -rf '${staging}'; exit 1`,
  ].join('\n'))
  if (placed.exitCode !== 0) throw new Failure('BUILDER_CHECK_INSTALL_REFUSED', { cause: { stderr: commandEvidence(placed.stderr) } })
}
