import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const receiptRelative = 'docs/evidence/4f/4f-r1-project-opus-composed-proof-receipt.json'
const receiptPath = resolve(repositoryRoot, receiptRelative)
const scriptRelative = 'scripts/record-r1-project-opus-composed-proof-receipt.mjs'
const postgresImage = 'postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f'
const testRelative = 'tests/implementation/r1-s6-composed-journey.test.mjs'
const testArgs = ['--test', '--test-concurrency=1', testRelative]
const subjectPaths = Object.freeze([
  'apps/hub/src/project/anthropic-oauth-provider.ts',
  'apps/hub/src/project/module.ts',
  testRelative,
])
const maxOutputBytes = 8 * 1024 * 1024

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (message) => { throw new Error(`OPUS_COMPOSED_RECEIPT_${message}`) }

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: maxOutputBytes,
    windowsHide: true,
    ...options,
  })
  if (result.error) throw result.error
  return result
}

const requiredSummaryValue = (output, label) => {
  const match = output.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'm'))
  if (!match) fail(`MISSING_${label.toUpperCase()}_SUMMARY`)
  return Number(match[1])
}

export function parseTestSummary(output) {
  const result = {
    tests: requiredSummaryValue(output, 'tests'),
    pass: requiredSummaryValue(output, 'pass'),
    fail: requiredSummaryValue(output, 'fail'),
    cancelled: requiredSummaryValue(output, 'cancelled'),
    skipped: requiredSummaryValue(output, 'skipped'),
  }
  const duration = output.match(/^ℹ duration_ms ([0-9.]+)$/m)
  const name = output.match(/^✔ (.+?) \([0-9.]+ms\)$/m)
  if (!duration || !name) fail('INCOMPLETE_TEST_SUMMARY')
  result.durationMs = Number(duration[1])
  result.name = name[1]
  if (result.tests !== 1 || result.pass !== 1 || result.fail !== 0 || result.cancelled !== 0 || result.skipped !== 0) {
    fail('TEST_RESULT_NOT_EXACT_1_OF_1_PASS')
  }
  return result
}

const exactToolchain = () => {
  if (process.platform !== 'linux' || !readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft')) {
    fail('WSL_UBUNTU_REQUIRED')
  }
  const osRelease = readFileSync('/etc/os-release', 'utf8')
  if (!/^ID=ubuntu$/m.test(osRelease)) fail('WSL_UBUNTU_REQUIRED')
  const node = process.version.slice(1)
  const npmResult = run('npm', ['--version'])
  const npm = npmResult.stdout.trim()
  if (node !== '24.20.0' || npm !== '12.0.2') fail(`TOOLCHAIN_MISMATCH_${node}_${npm}`)
  return { os: 'WSL Ubuntu', node, npm }
}

const subjectHashes = () => Object.fromEntries(subjectPaths.map((path) => [
  path,
  sha256(readFileSync(resolve(repositoryRoot, path))),
]))

const waitForPostgres = async (containerName) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = run('docker', ['exec', containerName, 'pg_isready', '-U', 'postgres', '-d', 'conexus_test'])
    if (ready.status === 0) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  fail('POSTGRES_NOT_READY')
}

const inspectOwnedContainer = (containerName) => {
  const result = run('docker', ['inspect', containerName, '--format', '{{json .}}'])
  if (result.status !== 0) fail('POSTGRES_INSPECT_FAILED')
  const inspected = JSON.parse(result.stdout)
  if (inspected.Config?.Image !== postgresImage) fail('POSTGRES_IMAGE_IDENTITY_MISMATCH')
  if (!Object.hasOwn(inspected.HostConfig?.Tmpfs ?? {}, '/var/lib/postgresql/data')) {
    fail('POSTGRES_TMPFS_REQUIRED')
  }
  const binding = inspected.NetworkSettings?.Ports?.['5432/tcp']
  if (!Array.isArray(binding) || binding.length !== 1 || binding[0].HostIp !== '127.0.0.1') {
    fail('POSTGRES_LOOPBACK_BINDING_REQUIRED')
  }
  return binding[0].HostPort
}

export async function publishReceipt() {
  const environment = exactToolchain()
  const containerName = `conexus-opus-composed-proof-${randomUUID()}`
  const password = `proof-${randomUUID()}`
  const temporaryReceipt = `${receiptPath}.tmp-${process.pid}-${randomUUID()}`
  let started = false
  try {
    const image = run('docker', ['image', 'inspect', postgresImage])
    if (image.status !== 0) fail('EXACT_POSTGRES_IMAGE_NOT_LOCAL')
    const start = run('docker', [
      'run', '--detach', '--rm', '--pull=never',
      '--name', containerName,
      '--label', 'io.conexus.proof=r1-project-opus-composed',
      '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=256m',
      '--publish', '127.0.0.1::5432',
      '--env', `POSTGRES_PASSWORD=${password}`,
      '--env', 'POSTGRES_DB=conexus_test',
      postgresImage,
    ])
    if (start.status !== 0) fail(`POSTGRES_START_FAILED_${start.stderr.trim()}`)
    started = true
    await waitForPostgres(containerName)
    const port = inspectOwnedContainer(containerName)

    const startedAt = Date.now()
    const test = run(process.execPath, testArgs, {
      env: {
        ...process.env,
        CONEXUS_TEST_DB_HOST: '127.0.0.1',
        CONEXUS_TEST_DB_PORT: port,
        CONEXUS_TEST_DB_NAME: 'conexus_test',
        CONEXUS_TEST_DB_USER: 'postgres',
        CONEXUS_TEST_DB_PASSWORD: password,
      },
    })
    process.stdout.write(test.stdout)
    process.stderr.write(test.stderr)
    if (test.status !== 0) fail(`TEST_EXIT_${test.status ?? 'UNKNOWN'}`)
    const result = parseTestSummary(test.stdout)
    const receipt = {
      schemaVersion: 2,
      subject: 'R1 Project cognition Opus successor production-composed journey',
      status: 'PASS',
      recordedAt: new Date().toISOString(),
      producer: {
        script: scriptRelative,
        scriptSha256: sha256(readFileSync(resolve(repositoryRoot, scriptRelative))),
        invocation: `node ${scriptRelative} --publish`,
        elapsedMs: Date.now() - startedAt,
        testOutputSha256: sha256(test.stdout),
      },
      environment,
      postgres: {
        image: 'postgres:17.10-bookworm',
        digest: postgresImage.split('@')[1],
        executionReference: postgresImage,
        pullPolicy: 'never',
        storage: 'ephemeral tmpfs',
        network: 'loopback ephemeral port',
      },
      command: `${process.execPath} ${testArgs.join(' ')}`,
      subjectHashes: subjectHashes(),
      result,
      providerCall: false,
      credentialDisclosed: false,
    }
    writeFileSync(temporaryReceipt, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 })
    renameSync(temporaryReceipt, receiptPath)
    process.stdout.write(`receipt = ${receiptRelative}\nreceiptSha256 = ${sha256(readFileSync(receiptPath))}\n`)
    return receipt
  } finally {
    rmSync(temporaryReceipt, { force: true })
    if (started) run('docker', ['rm', '--force', containerName])
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || argv[0] !== '--publish') fail('EXPLICIT_PUBLISH_REQUIRED')
  await publishReceipt()
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
