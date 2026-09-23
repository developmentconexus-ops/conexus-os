// Proves the Q1 data-plane guards are load-bearing: removes one guard at a time, runs the suite that
// should catch it, restores the file, and reports whether the suite failed and which tests did.
// Needs the same CONEXUS_TEST_* environment as the suites. Every target file must be unmodified, so
// an interrupted run is recovered with `git checkout -- <file>`. Usage:
//
//   node tests/implementation/guard-mutations.mjs [label ...]
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repository = resolve(import.meta.dirname, '../..')
const DATA = 'application-data-postgres'
const SANDBOX = 'application-runner-sandbox'
const INSTALL = 'application-cluster-installation'
const RUN_CLUSTER = 'scripts/run-application-cluster.sh'
const PROVISION = 'scripts/provision-application-database.mjs'
const CONFINE = 'scripts/confine-application-cluster.mjs'
const DATA_PLANE = 'apps/hub/src/app-runner/data-plane.ts'
const RELAY = 'apps/hub/src/app-runner/pg-relay.ts'

// [label, file, pattern, replacement, suite]. The first two remove guards whose effect stays in the
// cluster once any provisioning has applied it (PUBLIC's CONNECT on `postgres`, the provisioner's
// membership), so each shows only on an Applications cluster nothing has provisioned yet: run each
// alone, by label, on a freshly created cluster.
const MUTATIONS = [
  ['no-public-connect-revoke', PROVISION, "    await closeDatabaseToPublic(installation, 'postgres')\n", '', DATA],
  ['no-reserved-connections-inherit', PROVISION, ' WITH INHERIT TRUE', '', DATA],
  ['no-language-revoke', PROVISION, /^ +for \(const \{ lanname \} of rows\)[^\n]*\n/m, '', DATA],
  ['no-tls-key-check', CONFINE, /^ +if \(!server\.checkPrivateKey[^\n]*\n/m, '', DATA],
  ['no-tls-reset', CONFINE, /^ +for \(const name of Object\.keys\(settings\)\) sql\(`ALTER SYSTEM RESET[^\n]*\n/m, '', INSTALL],
  ['no-storage-mountpoint-check', RUN_CLUSTER, /^ +mountpoint -q [^\n]*\n/m, '', INSTALL],
  ['no-storage-entrypoint-guard', RUN_CLUSTER, 'echo APPLICATION_CLUSTER_STORAGE_UNMOUNTED >&2; exit 1;', 'true;', INSTALL],
  ['no-storage-source-check', RUN_CLUSTER, ' && line=$(grep -F " /var/lib/conexus-apps-storage " /proc/self/mountinfo | tail -n1) && rest=${line#*" - "} && fstype=${rest%% *} && src=${rest#* } && src=${src%% *} && [ "$fstype" = ext4 ] && [ "$src" = "$CONEXUS_APP_CLUSTER_STORAGE_SOURCE" ]', '', INSTALL],
  ['no-valid-until', DATA_PLANE, "VALID UNTIL '-infinity'", "VALID UNTIL 'infinity'", DATA],
  ['no-ledger-rls', DATA_PLANE, 'ENABLE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY', DATA],
  ['runtime-gets-create', DATA_PLANE, /GRANT USAGE ON SCHEMA \$\{schema\} TO \$\{runtime\}/, (grant) => grant.replace('USAGE', 'USAGE, CREATE'), DATA],
  ['schemas-open-to-public', DATA_PLANE, /GRANT USAGE ON SCHEMA \$\{schema\} TO \$\{runtime\}`\)[\s\S]*?ON TABLES TO \$\{runtime\}/, (grants) => grants.replaceAll(/TO \$\{runtime\}/g, 'TO PUBLIC'), DATA],
  ['no-role-temp-file-limit', DATA_PLANE, ", ['temp_file_limit', RUNTIME_TEMP_FILE_LIMIT]", '', DATA],
  ['no-role-transaction-timeout', DATA_PLANE, "['transaction_timeout', '6s'], ", '', DATA],
  ['no-language-startup-check', 'apps/hub/src/app-runner/supervisor.ts', /^ +if \(usable\.length > 0\) throw[^\n]*\n/m, '', SANDBOX],
  ['no-runtime-privilege-restore', 'apps/hub/src/app-runner/supervisor.ts', '.finally(() => withProvisioner((client) => restoreRuntimePrivileges(client, allocation)))', '', SANDBOX],
  ['no-relay-dir-files-check', RELAY, /^ +if \(present\.join\(','\) !== RELAY_FILES[^\n]*\n/m, '', SANDBOX],
  ['no-relay-dir-mode-check', RELAY, /^ +if \(\(statSync\(directory\)\.mode[^\n]*\n/m, '', SANDBOX],
  ['no-unshare-net', 'apps/hub/src/app-runner/sandbox.ts', "'--unshare-net', ", '', SANDBOX],
  ['no-relay-cancel', RELAY, 'await Promise.all(keys.map(cancel))', 'void keys', SANDBOX],
  // Last: without the refusal, provisioning also closes the Hub test cluster's `postgres` to PUBLIC.
  ['no-hub-cluster-refusal', PROVISION, /^ +if \(hubRoles\.length > 0\) fail\([^\n]*\n/m, '', DATA],
]

// --check only reports whether each mutation still applies to the current source, and runs nothing.
const check = process.argv.includes('--check')
const only = process.argv.slice(2).filter((argument) => argument !== '--check')
const selected = MUTATIONS.filter(([label]) => only.length === 0 || only.includes(label))
for (const file of new Set(selected.map(([, target]) => target))) {
  if (spawnSync('git', ['diff', '--quiet', '--', file], { cwd: repository }).status !== 0) throw new Error(`GUARD_MUTATION_TARGET_MODIFIED: ${file}`)
}
for (const [label, file, pattern, replacement, suite] of selected) {
  const path = join(repository, file)
  const original = readFileSync(path, 'utf8')
  const mutated = original.replace(pattern, replacement)
  if (mutated === original) {
    process.stdout.write(`${label}\t${suite}\tMUTATION_DID_NOT_APPLY\n`)
    process.exitCode = 1
    continue
  }
  if (check) {
    process.stdout.write(`${label}\t${suite}\tAPPLIES\n`)
    continue
  }
  writeFileSync(path, mutated)
  let result
  try {
    result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `tests/implementation/${suite}.test.mjs`], { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } finally {
    writeFileSync(path, original)
  }
  const output = `${result.stdout}${result.stderr}`
  const failing = output.split('✖ failing tests:')[1] ?? ''
  const names = [...new Set([...failing.matchAll(/^✖ (.*?) \(\d/gm)].map((match) => match[1]))]
  const verdict = result.status === 0 ? 'PASSED_WITHOUT_GUARD' : 'FAILED_AS_REQUIRED'
  if (result.status === 0) process.exitCode = 1
  process.stdout.write(`${label}\t${suite}\t${verdict}\t${names.join(' | ')}\n`)
}
