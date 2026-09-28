import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CommandResult } from '@mastra/core/workspace'

/**
 * The Conexus Git: one bare repository per Project on the Hub's own disk, `<root>/<projectId>.git`.
 * Its `main` is the admitted source and there is no other copy of it. Only the Hub writes here:
 * `main` is created once with the starter and then moves only by fast forward from a run's base.
 */
export type ConexusGit = ReturnType<typeof createConexusGit>

export type StarterFile = Readonly<{ path: string; content: string }>

/** One entry of `git ls-tree -r -t`, as the source view reads it. */
export type GitTreeEntry = Readonly<{ mode: string; type: string; path: string }>

/** One path of `git diff-tree --name-status -M`, with git's own status letter. */
export type GitChange = Readonly<{ status: string; path: string; previousPath: string | null }>

const OID = /^[0-9a-f]{40}$/
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAIN = 'refs/heads/main'
const NO_OBJECT = '0'.repeat(40)
const STARTER_MESSAGE = 'Start the Conexus application'
const BUILDER_IDENTITY = { name: 'Conexus Builder', email: 'builder@conexus.invalid' } as const
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

class GitCommandError extends Error {
  constructor(readonly exitCode: number, readonly stderr: string) {
    super('CONEXUS_GIT_FAILED', { cause: { exitCode, stderr: stderr.slice(0, 2_000) } })
  }
}

// No system or user configuration, no hooks and no prompt: what the Hub's git does depends only on
// the repository and the arguments it is given.
const gitEnvironment = (extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  ...extra,
})

const runGit = (args: readonly string[], options: Readonly<{ input?: Uint8Array | string; env?: Readonly<Record<string, string>> }> = {}): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.hooksPath=/dev/null', ...args], { env: gitEnvironment(options.env), stdio: ['pipe', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let size = 0
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_OUTPUT_BYTES) child.kill('SIGKILL')
      else stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 && size <= MAX_OUTPUT_BYTES) resolve(Buffer.concat(stdout))
      else reject(new GitCommandError(code ?? -1, Buffer.concat(stderr).toString('utf8')))
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(options.input ?? '')
  })

const text = async (output: Promise<Buffer>): Promise<string> => (await output).toString('utf8').trim()

/** Answers false instead of throwing when git's exit code is the answer, as for --is-ancestor. */
const succeeds = (output: Promise<Buffer>): Promise<boolean> => output.then(() => true, (error: unknown) => {
  if (error instanceof GitCommandError && error.exitCode === 1) return false
  throw error
})

const withTemporaryDirectory = async <T>(work: (directory: string) => Promise<T>): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), 'conexus-git-'))
  try {
    return await work(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const requireOid = (value: string, code: string): string => {
  if (!OID.test(value)) throw new Error(code)
  return value
}

export const createConexusGit = ({ root, starter }: Readonly<{ root: string; starter: readonly StarterFile[] }>) => {
  const repository = (projectId: string): string => {
    if (!PROJECT_ID.test(projectId)) throw new Error('CONEXUS_GIT_PROJECT_REFUSED')
    return join(root, `${projectId}.git`)
  }
  const git = (projectId: string, args: readonly string[], options?: Parameters<typeof runGit>[1]): Promise<Buffer> =>
    runGit(['--git-dir', repository(projectId), ...args], options)

  const readRef = async (projectId: string, ref: string): Promise<string | null> => {
    const value = await text(git(projectId, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])).catch((error: unknown) => {
      if (error instanceof GitCommandError && error.exitCode === 1) return ''
      throw error
    })
    return value ? requireOid(value, 'CONEXUS_GIT_REF_REFUSED') : null
  }

  const commitStarter = async (projectId: string): Promise<string> => withTemporaryDirectory(async (directory) => {
    const index = { GIT_INDEX_FILE: join(directory, 'index') }
    const entries: string[] = []
    for (const file of starter) {
      const blob = requireOid(await text(git(projectId, ['hash-object', '-w', '--stdin'], { input: file.content })), 'CONEXUS_GIT_STARTER_REFUSED')
      entries.push(`${file.path.endsWith('.sh') ? '100755' : '100644'} ${blob}\t${file.path}`)
    }
    await git(projectId, ['update-index', '--index-info'], { input: `${entries.join('\n')}\n`, env: index })
    const tree = requireOid(await text(git(projectId, ['write-tree'], { env: index })), 'CONEXUS_GIT_STARTER_REFUSED')
    return requireOid(await text(git(projectId, [
      '-c', `user.name=${BUILDER_IDENTITY.name}`, '-c', `user.email=${BUILDER_IDENTITY.email}`,
      'commit-tree', tree, '-m', STARTER_MESSAGE,
    ])), 'CONEXUS_GIT_STARTER_REFUSED')
  })

  const readMain = async (projectId: string): Promise<string> => {
    const main = await readRef(projectId, MAIN).catch(() => null)
    if (!main) throw new Error('CONEXUS_GIT_MAIN_MISSING')
    return main
  }

  return Object.freeze({
    /**
     * Converges on a repository whose `main` holds at least the starter: a missing repository is
     * created and an empty one gets the starter; one that already has `main` is left as it is.
     * Answers `main`.
     */
    ensureRepository: async (projectId: string): Promise<string> => {
      const path = repository(projectId)
      await mkdir(root, { recursive: true, mode: 0o700 })
      await runGit(['init', '--quiet', '--bare', '--template=', path])
      await git(projectId, ['symbolic-ref', 'HEAD', MAIN])
      const existing = await readRef(projectId, MAIN)
      if (existing) return existing
      const commit = await commitStarter(projectId)
      // Create-only: a concurrent ensure that got there first wins, and this one answers its main.
      await git(projectId, ['update-ref', MAIN, commit, NO_OBJECT]).catch(() => undefined)
      return readMain(projectId)
    },

    deleteRepository: async (projectId: string): Promise<void> => {
      await rm(repository(projectId), { recursive: true, force: true })
    },

    readMain,

    /** A bundle of `main` whose tip is `base`, for a run to fetch into its sandbox. */
    seedBundle: async (projectId: string, base: string): Promise<Buffer> => {
      const bundle = await git(projectId, ['bundle', 'create', '--quiet', '-', MAIN])
      const header = bundle.subarray(0, bundle.indexOf('\n\n')).toString('utf8').split('\n')
      const refs = header.filter((line) => /^[0-9a-f]{40} /.test(line))
      if (refs.length !== 1 || refs[0] !== `${base} ${MAIN}`) throw new Error('BUILDER_SOURCE_BASE_MOVED')
      return bundle
    },

    /**
     * Takes one run's candidate out of a bundle the sandbox made. Only the run's own ref is fetched,
     * every object is checked, and the candidate must be one commit whose only parent is the base.
     */
    acceptCandidate: async (projectId: string, { runId, base, bundle }: Readonly<{ runId: string; base: string; bundle: Uint8Array }>): Promise<string> => {
      if (!PROJECT_ID.test(runId) || !OID.test(base)) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      const ref = candidateRef(runId)
      await withTemporaryDirectory(async (directory) => {
        const file = join(directory, 'candidate.bundle')
        await writeFile(file, bundle, { mode: 0o600 })
        await git(projectId, [
          '-c', 'transfer.fsckObjects=true', '-c', 'fetch.fsckObjects=true',
          'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', file, `${ref}:${ref}`,
        ])
      }).catch((error: unknown) => {
        throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED', { cause: error instanceof GitCommandError ? error.cause : undefined })
      })
      const [candidate, ...parents] = (await text(git(projectId, ['rev-list', '--parents', '-n', '1', ref]))).split(' ')
      if (!candidate || !OID.test(candidate) || parents.length !== 1 || parents[0] !== base) {
        await git(projectId, ['update-ref', '-d', ref]).catch(() => undefined)
        throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      }
      return candidate
    },

    /**
     * The moment of admission: `main` moves from exactly `base` to `candidate`, a descendant of it,
     * under git's ref lock. A retry after `main` already moved to the candidate converges.
     */
    fastForwardMain: async (projectId: string, { base, candidate }: Readonly<{ base: string; candidate: string }>): Promise<void> => {
      if (!OID.test(base) || !OID.test(candidate) || base === candidate) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      if (!await succeeds(git(projectId, ['merge-base', '--is-ancestor', base, candidate]))) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      const moved = await git(projectId, ['update-ref', MAIN, candidate, base]).then(() => true, () => false)
      if (!moved && await readMain(projectId) !== candidate) throw new Error('BUILDER_SOURCE_BASE_MOVED')
    },

    /** Whether `main` holds this commit in its history, which is how a restart learns a run was admitted. */
    mainContains: async (projectId: string, revision: string): Promise<boolean> => {
      if (!await hasCommit(git, projectId, revision)) return false
      const main = await readMain(projectId)
      return succeeds(git(projectId, ['merge-base', '--is-ancestor', revision, main]))
    },

    /** Every entry of a commit's tree, directories included, or null when the commit is not here. */
    listTree: async (projectId: string, revision: string): Promise<readonly GitTreeEntry[] | null> => {
      if (!await hasCommit(git, projectId, revision)) return null
      const output = await git(projectId, ['ls-tree', '-r', '-t', '-z', '--full-tree', revision])
      return output.toString('utf8').split('\0').filter(Boolean).map((line) => {
        const tab = line.indexOf('\t')
        const [mode = '', type = ''] = line.slice(0, tab).split(' ')
        return { mode, type, path: line.slice(tab + 1) }
      })
    },

    /** One path's blob at a commit with its mode and size, or null when the commit or path is not there. */
    readBlob: async (projectId: string, revision: string, path: string, maxBytes: number): Promise<Readonly<{ mode: string; type: string; size: number; bytes: Buffer | null }> | null> => {
      if (!await hasCommit(git, projectId, revision)) return null
      const listed = (await git(projectId, ['ls-tree', '-l', '-z', '--full-tree', revision, '--', path])).toString('utf8').split('\0').filter(Boolean)
      const line = listed.find((entry) => entry.slice(entry.indexOf('\t') + 1) === path)
      if (!line) return null
      const [mode = '', type = '', oid = '', size = ''] = line.slice(0, line.indexOf('\t')).split(/ +/)
      const bytes = type === 'blob' && Number(size) <= maxBytes ? await git(projectId, ['cat-file', 'blob', oid]) : null
      return { mode, type, size: Number(size), bytes }
    },

    /** The paths that differ between two commits, renames found, or null when either is not here. */
    diff: async (projectId: string, base: string, result: string): Promise<readonly GitChange[] | null> => {
      if (!await hasCommit(git, projectId, base) || !await hasCommit(git, projectId, result)) return null
      const fields = (await git(projectId, ['diff-tree', '-r', '-z', '-M', '--no-commit-id', '--name-status', base, result])).toString('utf8').split('\0')
      const changes: GitChange[] = []
      for (let at = 0; at < fields.length && fields[at];) {
        const status = fields[at] as string
        const renamed = status.startsWith('R') || status.startsWith('C')
        const previousPath = renamed ? fields[at + 1] ?? '' : null
        const path = fields[renamed ? at + 2 : at + 1] ?? ''
        changes.push({ status, path, previousPath })
        at += renamed ? 3 : 2
      }
      return changes
    },

    /** `git ls-tree -r -l` of the given roots, the listing the application build admits. */
    listFilesLong: async (projectId: string, revision: string, roots: readonly string[]): Promise<string> =>
      (await git(projectId, ['ls-tree', '-r', '-l', revision, '--', ...roots])).toString('utf8'),

    /** A tar of the given paths at a commit, made from the checked repository, never from the sandbox. */
    archive: async (projectId: string, revision: string, paths: readonly string[]): Promise<Buffer> =>
      git(projectId, ['archive', '--format=tar', revision, '--', ...paths]),
  })
}

const hasCommit = (git: (projectId: string, args: readonly string[]) => Promise<Buffer>, projectId: string, revision: string): Promise<boolean> =>
  OID.test(revision) ? git(projectId, ['cat-file', '-e', `${revision}^{commit}`]).then(() => true, () => false) : Promise.resolve(false)

const candidateRef = (runId: string): string => `refs/conexus/runs/${runId}`

/** What a run's source steps need of its sandbox. Commands run in the checkout as the agent's user. */
export type RunSourceSandbox = Readonly<{
  direct(command: string, args: string[]): Promise<CommandResult>
  /** Writes a file only root can change and the agent's user can read. */
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  /** Reads a file with the agent user's own permissions. */
  readAgentFile(path: string): Promise<Uint8Array>
}>

const quoted = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`
const evidence = (value: string): string => value.slice(-2_000)

/**
 * Puts the run's base in the sandbox's checkout: the Hub bundles `main`, the sandbox fetches that
 * bundle, and the checkout is reset to exactly the base, discarding whatever an earlier run left.
 */
export const seedSandbox = async ({ git, projectId, base, sandbox, checkout, seedFile }: Readonly<{
  git: Pick<ConexusGit, 'seedBundle'>
  projectId: string
  base: string
  sandbox: RunSourceSandbox
  checkout: string
  seedFile: string
}>): Promise<void> => {
  await sandbox.writeRootFile(seedFile, await git.seedBundle(projectId, base))
  const seeded = await sandbox.direct('sh', ['-c', [
    'set -e',
    `mkdir -p ${quoted(checkout)}`,
    `cd ${quoted(checkout)}`,
    'test -d .git || git init --quiet',
    `git fetch --quiet --no-tags ${quoted(seedFile)} '+${MAIN}:refs/conexus/base'`,
    `git checkout --quiet --force -B main ${quoted(base)}`,
    'git clean -fdq',
    `test "$(git rev-parse HEAD)" = ${quoted(base)}`,
  ].join('\n')])
  if (seeded.exitCode !== 0) throw new Error('BUILDER_SOURCE_BASE_PIN_REFUSED', { cause: { exitCode: seeded.exitCode, stderr: evidence(seeded.stderr) } })
}

/**
 * The Hub's commit of everything the run changed: the whole checkout (ignored files, `.conexus/plans/`
 * and the `excluded` paths left out) as one commit whose only parent is the base, bundled in the
 * sandbox and accepted into the Conexus Git. Answers null when the checkout holds exactly the base.
 */
export const pullCandidate = async ({ git, projectId, runId, base, sandbox, checkout, excluded = [] }: Readonly<{
  git: Pick<ConexusGit, 'acceptCandidate'>
  projectId: string
  runId: string
  base: string
  sandbox: RunSourceSandbox
  checkout: string
  excluded?: readonly string[]
}>): Promise<string | null> => {
  const bundleFile = `${checkout}/.git/conexus-candidate.bundle`
  const ref = candidateRef(runId)
  const committed = await sandbox.direct('sh', ['-c', [
    'set -e',
    `cd ${quoted(checkout)}`,
    'export GIT_INDEX_FILE=.git/conexus-candidate-index',
    'rm -f "$GIT_INDEX_FILE"',
    `git read-tree ${quoted(base)}`,
    `git add --all -- . ${['.conexus/plans', ...excluded].map((path) => quoted(`:(exclude)${path}`)).join(' ')}`,
    'tree=$(git write-tree)',
    `if [ "$tree" = "$(git rev-parse ${quoted(`${base}^{tree}`)})" ]; then echo UNCHANGED; exit 0; fi`,
    `commit=$(git -c user.name=${quoted(BUILDER_IDENTITY.name)} -c user.email=${quoted(BUILDER_IDENTITY.email)} commit-tree "$tree" -p ${quoted(base)} -m 'Conexus Builder')`,
    `git update-ref ${quoted(ref)} "$commit"`,
    `rm -f ${quoted(bundleFile)}`,
    `git bundle create --quiet ${quoted(bundleFile)} ${quoted(ref)} ${quoted(`^${base}`)}`,
    'echo "$commit"',
  ].join('\n')])
  const reported = committed.stdout.trim().split('\n').pop() ?? ''
  if (committed.exitCode !== 0 || (reported !== 'UNCHANGED' && !OID.test(reported))) {
    throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED', { cause: { exitCode: committed.exitCode, stderr: evidence(committed.stderr) } })
  }
  if (reported === 'UNCHANGED') return null
  const candidate = await git.acceptCandidate(projectId, { runId, base, bundle: await sandbox.readAgentFile(bundleFile) })
  if (candidate !== reported) throw new Error('BUILDER_RESULT_MATERIALIZATION_REFUSED')
  return candidate
}
