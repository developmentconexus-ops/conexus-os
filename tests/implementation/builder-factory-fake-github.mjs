import { createServer } from 'node:http'

// A GitHub REST double for the Hub's App client: just the routes the Factory path calls, with
// every request recorded so a test can assert what reached GitHub.
export const startFakeGithub = async ({ installations = [{ id: 163574754, account: { login: 'acme-org', type: 'Organization' } }] } = {}) => {
  const state = {
    installations,
    repositories: new Map(),
    refs: new Map(),
    requests: [],
    tokens: [],
    nextRepositoryId: 700001,
    // Runs inside an update, after any earlier read and before the ref moves: a concurrent writer.
    beforeRefUpdate: null,
    // child -> parent, the commit graph compare answers from.
    parents: new Map(),
    compareStatus: null,
    // A leased push applies, and its client then sees only a transport failure.
    pushResponseLost: false,
    // `${slug}@${commit}` -> Map(path -> { mode, content }), the files of a commit GitHub holds.
    commits: new Map(),
  }
  const descends = (sha, ancestor) => {
    for (let at = sha; at; at = state.parents.get(at)) if (at === ancestor) return true
    return false
  }
  const send = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(body === undefined ? '' : JSON.stringify(body))
  }
  const repositoryJson = (repository) => ({
    id: repository.id, name: repository.name, full_name: repository.fullName, owner: { login: repository.owner },
    default_branch: repository.defaultBranch, private: repository.private,
  })
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => { raw += chunk })
    request.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined
      const url = new URL(request.url, 'http://github.test')
      const path = decodeURIComponent(url.pathname)
      state.requests.push({ method: request.method, path, body, authorization: request.headers.authorization })
      const at = (method, pattern) => (request.method === method ? pattern.exec(path) : null)
      if (request.method === 'GET' && path === '/app') return send(response, 200, { client_id: 'Iv23-fake-client', slug: 'conexus-fake-app' })
      if (request.method === 'GET' && path === '/app/installations') return send(response, 200, state.installations)
      const tokenRequest = at('POST', /^\/app\/installations\/(\d+)\/access_tokens$/)
      if (tokenRequest) {
        const match = tokenRequest
        const token = `ghs_fake_${state.tokens.length + 1}`
        state.tokens.push({ token, installationId: Number(match[1]), repositoryIds: body?.repository_ids ?? null, permissions: body?.permissions ?? null })
        return send(response, 201, { token, expires_at: new Date(Date.now() + 3_600_000).toISOString(), permissions: body?.permissions ?? {}, repository_selection: body?.repository_ids ? 'selected' : 'all' })
      }
      const creation = at('POST', /^\/orgs\/([^/]+)\/repos$/)
      if (creation) {
        const match = creation
        const fullName = `${match[1]}/${body.name}`
        if (state.repositories.has(fullName)) return send(response, 422, { message: 'Repository creation failed.', errors: [{ message: 'name already exists on this account' }] })
        const repository = { id: state.nextRepositoryId++, name: body.name, fullName, owner: match[1], defaultBranch: 'main', private: body.private === true }
        state.repositories.set(fullName, repository)
        if (body.auto_init) state.refs.set(`${fullName}:main`, 'c'.repeat(40))
        return send(response, 201, repositoryJson(repository))
      }
      const repositoryRead = at('GET', /^\/repos\/([^/]+)\/([^/]+)$/)
      if (repositoryRead) {
        const repository = state.repositories.get(`${repositoryRead[1]}/${repositoryRead[2]}`)
        return repository ? send(response, 200, repositoryJson(repository)) : send(response, 404, { message: 'Not Found' })
      }
      const compare = at('GET', /^\/repos\/([^/]+)\/([^/]+)\/compare\/([0-9a-f]{40})\.\.\.(.+)$/)
      if (compare) {
        if (state.compareStatus) return send(response, state.compareStatus, { message: 'Server Error' })
        const head = state.refs.get(`${compare[1]}/${compare[2]}:${compare[4]}`)
        const base = compare[3]
        if (!head) return send(response, 404, { message: 'Not Found' })
        const status = head === base ? 'identical' : descends(head, base) ? 'ahead' : descends(base, head) ? 'behind' : 'diverged'
        return send(response, 200, { status })
      }
      const tree = at('GET', /^\/repos\/([^/]+)\/([^/]+)\/git\/trees\/([0-9a-f]{40})$/)
      if (tree) {
        const files = state.commits.get(`${tree[1]}/${tree[2]}@${tree[3]}`)
        if (!files || url.searchParams.get('recursive') !== '1') return send(response, 404, { message: 'Not Found' })
        const directories = new Set([...files.keys()].flatMap((file) => file.split('/').slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join('/'))))
        return send(response, 200, { sha: tree[3], truncated: false, tree: [
          ...[...directories].map((directory) => ({ path: directory, mode: '040000', type: 'tree', sha: 'e'.repeat(40) })),
          ...[...files].map(([file, { mode, content }]) => ({ path: file, mode, type: mode === '160000' ? 'commit' : 'blob', sha: 'f'.repeat(40), size: Buffer.byteLength(content) })),
        ] })
      }
      const contents = at('GET', /^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/)
      if (contents) {
        const file = state.commits.get(`${contents[1]}/${contents[2]}@${url.searchParams.get('ref')}`)?.get(contents[3])
        if (!file) return send(response, 404, { message: 'Not Found' })
        const bytes = Buffer.from(file.content)
        return send(response, 200, { type: file.mode === '120000' ? 'symlink' : 'file', path: contents[3], size: bytes.byteLength, encoding: 'base64', content: bytes.toString('base64') })
      }
      const match = /^\/repos\/([^/]+)\/([^/]+)\/git\/refs?\/heads\/(.+)$/.exec(path)
      if (match) {
        const key = `${match[1]}/${match[2]}:${match[3]}`
        if (request.method === 'GET') {
          const sha = state.refs.get(key)
          return sha ? send(response, 200, { ref: `refs/heads/${match[3]}`, object: { sha, type: 'commit' } }) : send(response, 404, { message: 'Not Found' })
        }
      }
      return send(response, 404, { message: `no fake route for ${request.method} ${path}` })
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    state,
    addRepository: ({ owner, name, private: isPrivate = true, head = 'd'.repeat(40) }) => {
      const repository = { id: state.nextRepositoryId++, name, fullName: `${owner}/${name}`, owner, defaultBranch: 'main', private: isPrivate }
      state.repositories.set(repository.fullName, repository)
      state.refs.set(`${repository.fullName}:main`, head)
      return repository
    },
    // Answers a root script that is one leased `git push --porcelain` the way git and receive-pack
    // would: the ref moves only while it still holds the lease's expected id. Undefined otherwise.
    leasedPush: (script) => {
      const push = /push --porcelain --force-with-lease='refs\/heads\/([^:']+):([0-9a-f]{40})' 'https:\/\/github\.com\/([^']+)\.git' '([0-9a-f]{40}):refs\/heads\/\1'$/.exec(script)
      if (!push) return undefined
      const [, branch, expected, slug, sha] = push
      const key = `${slug}:${branch}`
      state.beforeRefUpdate?.(key)
      const current = state.refs.get(key)
      const flag = current === sha ? '=' : current === expected ? ' ' : '!'
      if (flag === ' ') state.refs.set(key, sha)
      if (state.pushResponseLost) return { exitCode: 128, success: false, stdout: '', stderr: 'error: RPC failed; HTTP 502 curl 22 The requested URL returned error: 502\nfatal: the remote end hung up unexpectedly' }
      const summary = { '=': '[up to date]', ' ': `${expected.slice(0, 7)}..${sha.slice(0, 7)}`, '!': '[rejected] (stale info)' }[flag]
      return { exitCode: flag === '!' ? 1 : 0, success: flag !== '!', stdout: `To https://github.com/${slug}.git\n${flag}\t${sha}:refs/heads/${branch}\t${summary}\nDone\n`, stderr: '' }
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
