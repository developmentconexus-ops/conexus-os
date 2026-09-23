import { spawnSync } from 'node:child_process'
import { createPrivateKey, X509Certificate } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

// Confines Project roles on a Postgres cluster that runs in a container: a Project role may log in
// only over TLS, only to the application database, and only with the application runner's client
// certificate. Every other path, including a password the role set for itself, is rejected. An
// installation step run through the container's local superuser: it writes the server TLS files and
// the pg_hba and pg_ident blocks in the data directory, then reloads.
//
// Two host directories hold the TLS material. The authority directory keeps the CA key and the
// server key, which only this step reads. The relay directory holds exactly what the application
// runner reads: the CA certificate, the relay's client certificate and its key. Whoever holds the CA
// key can mint a relay certificate or impersonate the cluster, so it never sits where the runner
// reads. Both are issued once and reused, so reruns converge without rotating anything; a partial
// set is refused rather than silently reissued.

// The names apps/hub/src/app-runner/data-plane.ts gives Project roles. Matched by name, not by a
// group: pg_hba counts the provisioner's ADMIN membership in a group as membership, which would
// confine the provisioner too.
export const PROJECT_ROLE_PATTERN = '/^app_[0-9a-f]{32}_preview_(rt|mig)$'
export const RELAY_CERTIFICATE_NAME = 'conexus-app-relay'
const IDENT_MAP = 'conexus_app_relay'
const BEGIN = '# conexus-application-roles begin'
const END = '# conexus-application-roles end'
const SERVER_TLS_DIR = 'conexus-tls'

const fail = (code, detail) => {
  throw new Error(detail ? `${code}: ${detail}` : code)
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.status !== 0) fail('CONFINE_COMMAND_FAILED', `${command} ${args.slice(0, 4).join(' ')}: ${(result.stderr || result.stdout || '').trim().slice(0, 400)}`)
  return result.stdout
}

const openssl = (args, cwd) => run('openssl', args, { cwd })

export const AUTHORITY_FILES = ['ca.pem', 'ca-key.pem', 'server.pem', 'server-key.pem']
export const RELAY_FILES = ['ca.pem', 'relay.pem', 'relay-key.pem']

/**
 * Issues the CA, server and relay certificates unless they are already there: the CA key and the
 * server key into `authorityDir`, what the runner reads into `relayDir`.
 */
export const ensureTlsMaterial = ({ authorityDir, relayDir }, serverNames = ['IP:127.0.0.1', 'DNS:localhost']) => {
  if (resolve(authorityDir) === resolve(relayDir)) fail('CONFINE_TLS_DIRECTORIES_SHARED')
  for (const directory of [authorityDir, relayDir]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    chmodSync(directory, 0o700)
  }
  const present = [...AUTHORITY_FILES.map((file) => join(authorityDir, file)), ...RELAY_FILES.map((file) => join(relayDir, file))].filter((path) => existsSync(path))
  if (present.length === AUTHORITY_FILES.length + RELAY_FILES.length) return { authorityDir, relayDir }
  if (present.length > 0) fail('CONFINE_TLS_INCOMPLETE', `present: ${present.join(', ')}`)
  const directory = authorityDir
  const days = '3650'
  openssl(['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', days,
    '-subj', '/CN=conexus-application-cluster-ca', '-keyout', 'ca-key.pem', '-out', 'ca.pem',
    '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign'], directory)
  const issue = (name, subject, extensions) => {
    openssl(['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-subj', `/CN=${subject}`,
      '-keyout', `${name}-key.pem`, '-out', `${name}.csr`], directory)
    writeFileSync(join(directory, `${name}.ext`), extensions)
    openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.pem', '-CAkey', 'ca-key.pem', '-CAcreateserial', '-days', days,
      '-out', `${name}.pem`, '-extfile', `${name}.ext`], directory)
    for (const scratch of [`${name}.csr`, `${name}.ext`]) rmSync(join(directory, scratch))
  }
  issue('server', 'conexus-application-cluster', `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=${serverNames.join(',')}\n`)
  issue('relay', RELAY_CERTIFICATE_NAME, 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=clientAuth\n')
  rmSync(join(directory, 'ca.srl'), { force: true })
  for (const file of ['relay.pem', 'relay-key.pem']) renameSync(join(directory, file), join(relayDir, file))
  copyFileSync(join(directory, 'ca.pem'), join(relayDir, 'ca.pem'))
  for (const file of AUTHORITY_FILES) chmodSync(join(authorityDir, file), 0o600)
  for (const file of RELAY_FILES) chmodSync(join(relayDir, file), 0o600)
  return { authorityDir, relayDir }
}

const DATABASE_FIELD = /^(?:[a-z_][a-z0-9_]{0,62}|\/[^\s,"#]+)$/

/** The pg_hba block: certificate login to the application database, nothing else, for every Project role. */
export const hbaBlock = (database) => {
  if (!DATABASE_FIELD.test(database)) fail('CONFINE_DATABASE_REFUSED', database)
  return [
    BEGIN,
    `hostssl ${database} ${PROJECT_ROLE_PATTERN} all cert map=${IDENT_MAP}`,
    `host all ${PROJECT_ROLE_PATTERN} all reject`,
    `local all ${PROJECT_ROLE_PATTERN} reject`,
    END,
  ].join('\n')
}

export const identBlock = () => [BEGIN, `${IDENT_MAP} ${RELAY_CERTIFICATE_NAME} ${PROJECT_ROLE_PATTERN}`, END].join('\n')

// Replaces the marked block, or places it: first in pg_hba, so no earlier line can admit a Project role;
// anywhere in pg_ident, where order does not decide.
export const withBlock = (text, block, placement) => {
  const start = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  const rest = start >= 0 && end > start ? `${text.slice(0, start)}${text.slice(end + END.length).replace(/^\n/, '')}` : text
  return placement === 'first' ? `${block}\n${rest}` : `${rest.replace(/\n*$/, '\n')}${block}\n`
}

const inContainer = (container) => {
  const exec = (args, input) => run('docker', ['exec', ...(input === undefined ? [] : ['-i']), '-u', 'postgres', container, ...args], input === undefined ? {} : { input })
  const sql = (statement) => exec(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-Atqc', statement]).trim()
  const write = (path, content) => exec(['sh', '-c', 'umask 077 && cat > "$1"', 'sh', path], content)
  return { exec, sql, write }
}

// libpq's refusals that come only after a TLS session is up: the handshake itself succeeded.
const AUTHENTICATION_AFTER_TLS = /no password supplied|password authentication failed|pg_hba\.conf/

/**
 * Refuses server material Postgres could not load: a key that is not the certificate's, or a
 * certificate the CA did not sign. Postgres would start with neither.
 */
export const assertServerMaterial = (authorityDir) => {
  const read = (file) => readFileSync(join(authorityDir, file), 'utf8')
  const server = new X509Certificate(read('server.pem'))
  if (!server.checkPrivateKey(createPrivateKey(read('server-key.pem')))) fail('CONFINE_TLS_MATERIAL_REFUSED', 'server-key.pem is not the key of server.pem')
  if (!server.verify(new X509Certificate(read('ca.pem')).publicKey)) fail('CONFINE_TLS_MATERIAL_REFUSED', 'server.pem is not signed by ca.pem')
}

export const confineApplicationCluster = ({ container, authorityDir, tlsDir, database }) => {
  const tls = ensureTlsMaterial({ authorityDir, relayDir: tlsDir }).authorityDir
  assertServerMaterial(tls)
  const { exec, sql, write } = inContainer(container)
  const dataDirectory = sql('SHOW data_directory')
  const hbaFile = sql('SHOW hba_file')
  const identFile = sql('SHOW ident_file')
  const changed = []

  exec(['mkdir', '-p', '-m', '700', join(dataDirectory, SERVER_TLS_DIR)])
  for (const file of ['ca.pem', 'server.pem', 'server-key.pem']) {
    const target = join(dataDirectory, SERVER_TLS_DIR, file)
    const wanted = readFileSync(join(tls, file), 'utf8')
    const present = spawnSync('docker', ['exec', '-u', 'postgres', container, 'cat', target], { encoding: 'utf8' })
    if (present.status === 0 && present.stdout === wanted) continue
    write(target, wanted)
    changed.push(file)
  }

  const settings = { ssl: 'on', ssl_cert_file: `${SERVER_TLS_DIR}/server.pem`, ssl_key_file: `${SERVER_TLS_DIR}/server-key.pem`, ssl_ca_file: `${SERVER_TLS_DIR}/ca.pem` }
  for (const [name, value] of Object.entries(settings)) {
    if (sql(`SHOW ${name}`) === value) continue
    sql(`ALTER SYSTEM SET ${name} = '${value}'`)
    changed.push(name)
  }
  // TLS loads first: until it does, Postgres reports every hostssl line as one that cannot match.
  // A reload survives TLS that fails to load, but a restart does not, so settings that did not load
  // are taken back out of postgresql.auto.conf before this step gives up. SHOW ssl cannot tell: it
  // reports the setting, which stays on when the reload could not load the certificate. A session
  // that completes a TLS handshake verified against the CA can.
  const caInCluster = join(dataDirectory, SERVER_TLS_DIR, 'ca.pem')
  const tlsServed = () => {
    const probe = spawnSync('docker', ['exec', '-u', 'postgres', '-e', 'PGPASSFILE=/nonexistent', container, 'psql', '-X', '-w', '-Atc', 'SELECT 1',
      `host=127.0.0.1 dbname=postgres user=postgres sslmode=verify-full sslrootcert=${caInCluster} connect_timeout=5`], { encoding: 'utf8' })
    return probe.status === 0 || AUTHENTICATION_AFTER_TLS.test(probe.stderr)
  }
  const reload = () => {
    sql('SELECT pg_reload_conf()')
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (tlsServed()) return
      spawnSync('sleep', ['0.2'])
    }
    for (const name of Object.keys(settings)) sql(`ALTER SYSTEM RESET ${name}`)
    sql('SELECT pg_reload_conf()')
    fail('CONFINE_TLS_NOT_LOADED', 'the ssl settings were reset; check the server log for the certificate error')
  }
  reload()

  const hbaBefore = exec(['cat', hbaFile])
  const identBefore = exec(['cat', identFile])
  const hbaAfter = withBlock(hbaBefore, hbaBlock(database), 'first')
  const identAfter = withBlock(identBefore, identBlock(), 'last')
  if (hbaAfter !== hbaBefore) { write(hbaFile, hbaAfter); changed.push('pg_hba') }
  if (identAfter !== identBefore) { write(identFile, identAfter); changed.push('pg_ident') }

  // Postgres parses the files as they are on disk; a block it cannot load is put back before reload.
  const errors = sql("SELECT coalesce(string_agg(error, '; '), '') FROM (SELECT error FROM pg_hba_file_rules WHERE error IS NOT NULL UNION ALL SELECT error FROM pg_ident_file_mappings WHERE error IS NOT NULL) e")
  if (errors) {
    write(hbaFile, hbaBefore)
    write(identFile, identBefore)
    fail('CONFINE_RULES_REFUSED', errors)
  }
  reload()
  return { verdict: changed.length === 0 ? 'CURRENT' : 'CONFINED', container, database, authorityDir, tlsDir, changed }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const { values } = parseArgs({ options: { container: { type: 'string' }, 'authority-dir': { type: 'string' }, 'tls-dir': { type: 'string' }, database: { type: 'string' } } })
  if (!values.container || !values['authority-dir'] || !values['tls-dir'] || !values.database) fail('USAGE', '--container <name> --authority-dir <dir> --tls-dir <runner dir> --database <name|/regex>')
  process.stdout.write(`${JSON.stringify(confineApplicationCluster({ container: values.container, authorityDir: resolve(values['authority-dir']), tlsDir: resolve(values['tls-dir']), database: values.database }), null, 2)}\n`)
}
