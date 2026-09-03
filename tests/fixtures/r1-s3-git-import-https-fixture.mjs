import { readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { extname, resolve, sep } from 'node:path'

const [repositoryRoot, certPath, keyPath, credentialPath, readyPath, logPath] = process.argv.slice(2)
if (!repositoryRoot || !certPath || !keyPath || !credentialPath || !readyPath || !logPath) {
  throw new Error('S3_P3_FIXTURE_ARGUMENT_REFUSED')
}
const credential = (await readFile(credentialPath, 'utf8')).replace(/\n$/, '').split('\n')
if (credential.length !== 2 || !credential[0] || !credential[1]) throw new Error('S3_P3_FIXTURE_CREDENTIAL_REFUSED')
const expectedAuthorization = `Basic ${Buffer.from(`${credential[0]}:${credential[1]}`).toString('base64')}`
const root = resolve(repositoryRoot)
const requests = []
const contentTypes = new Map([
  ['.pack', 'application/x-git-packed-objects'],
  ['.idx', 'application/x-git-packed-objects-toc'],
])

const server = createServer({ cert: await readFile(certPath), key: await readFile(keyPath) }, async (request, response) => {
  const url = new URL(request.url ?? '/', 'https://git.allowed.test')
  requests.push({ method: request.method, requestTarget: request.url ?? '/', authorizationPresent: Boolean(request.headers.authorization) })
  if (url.pathname.startsWith('/redirect/repo.git/')) {
    response.writeHead(302, { location: `https://git.allowed.test/forbidden${url.pathname}` })
    response.end()
    return
  }
  if (url.pathname.startsWith('/forbidden/')) {
    response.writeHead(500)
    response.end('redirect followed')
    return
  }
  if (!url.pathname.startsWith('/admitted/repo.git/')) {
    response.writeHead(404)
    response.end()
    return
  }
  if (request.headers.authorization !== expectedAuthorization) {
    response.writeHead(401, { 'www-authenticate': 'Basic realm="s3-p3"' })
    response.end()
    return
  }
  const relative = url.pathname.slice('/admitted/repo.git/'.length)
  const target = resolve(root, relative)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    response.writeHead(403)
    response.end()
    return
  }
  try {
    const targetStat = await stat(target)
    if (!targetStat.isFile()) throw new Error('not file')
    const body = await readFile(target)
    response.writeHead(200, {
      'content-length': body.length,
      'content-type': contentTypes.get(extname(target)) ?? 'application/octet-stream',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    response.writeHead(404)
    response.end()
  }
})

server.listen(8443, '0.0.0.0', async () => writeFile(readyPath, '{"ready":true}\n'))
async function stop() {
  await writeFile(logPath, `${JSON.stringify(requests, null, 2)}\n`)
  server.close(() => process.exit(0))
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
