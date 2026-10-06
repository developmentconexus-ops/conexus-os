import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { CommandResult } from '@mastra/core/workspace'
import { SourceRevision, type ExecutionId } from '@conexus/contract'
import { Failure, type FailureCode } from '../platform/failure.js'
import { logLine } from '../platform/logger.js'
import type { ConversationId, ProjectId } from '@conexus/contract'

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

/**
 * One snapshot of a checkout, as the Hub accepts it into a ref it owns: one commit whose only parent
 * is `parent`. A run's candidate is `refs/conexus/runs/<runId>` on the run's base; a conversation's
 * mirror is `refs/conexus/conversations/<conversationId>` on the turn's start.
 */
export type Snapshot = Readonly<{ ref: string; parent: SourceRevision }>

/**
 * Where a conversation's turn starts (spec 0002 amendment, B2). `main` is the `main` the turn brings
 * in, and `start` is the commit the checkout holds when the agent starts, the parent of every
 * snapshot of the turn: `main` itself, the mirror head when it already holds `main`, or a Hub-made
 * merge of the two that the mirror then points at. `mirror` is the mirror's head after that,
 * `previous` its head as the last turn left it, and `conflicted` names the paths the merge left with
 * conflict markers for the agent to resolve.
 */
export type TurnStart = Readonly<{ conversationId: ConversationId; main: SourceRevision; start: SourceRevision; mirror: SourceRevision | null; previous: SourceRevision | null; conflicted: readonly string[] }>

/** How a turn's checkout came to hold its start (spec 0002 amendment, B3). */
export type CheckoutStart = 'RESUMED' | 'SEEDED' | 'RESEEDED'

const OID = /^[0-9a-f]{40}$/
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PROJECT_ID = new RegExp(`^${UUID_PATTERN}$`)
const SNAPSHOT_REF = new RegExp(`^refs/conexus/(runs|conversations)/${UUID_PATTERN}$`)
const MAIN = 'refs/heads/main'
/** Longer than any git command the Hub runs, so a lock this old belongs to a process that died. */
const STALE_LOCK_MS = 5 * 60_000
const NO_OBJECT = '0'.repeat(40)
const STARTER_MESSAGE = 'Start the Conexus application'
const BUILDER_IDENTITY = { name: 'Conexus Builder', email: 'builder@conexus.invalid' } as const
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
/** The largest result bundle the Hub takes from a sandbox, measured in the sandbox and again while it streams. */
const MAX_RESULT_BUNDLE_BYTES = 64 * 1024 * 1024
/** The largest file a result may hold: 12 MiB, the same bound as the build-output total in `application-artifact-runtime.ts`. */
const MAX_RESULT_FILE_BYTES = 12 * 1024 * 1024
/** The most files a result may hold: 256, the file count `application-artifact-runtime.ts` allows in a build output; the starter holds 41. */
const MAX_RESULT_FILES = 256

class GitCommandError extends Failure {
  constructor(readonly exitCode: number, readonly stderr: string) {
    super('CONEXUS_GIT_FAILED', { cause: { exitCode, stderr: stderr.slice(0, 2_000) } })
  }
}

// No system or user configuration, no hooks and no prompt: what the Hub's git does depends only on
// the repository and the arguments it is given.
const gitEnvironment = (extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv => ({
  // biome-ignore lint/style/noProcessEnv: debt: owning wave
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_ATTR_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  ...extra,
})

type GitOptions = Readonly<{ input?: Uint8Array | string; env?: Readonly<Record<string, string>>; answers?: readonly number[] }>
type GitRun = Readonly<{ code: number; stdout: Buffer }>

// `answers` names the exit codes besides 0 that can be an answer rather than a failure, as 1 is for a
// merge with conflicts. Git exits with the same code for "no" and for "I could not read", and only
// the answer leaves stderr empty, so a code in `answers` counts as one only with an empty stderr.
const execGit = (args: readonly string[], options: GitOptions = {}): Promise<GitRun> =>
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
      const errors = Buffer.concat(stderr).toString('utf8')
      const answered = code === 0 || (options.answers?.includes(code ?? -1) === true && errors === '')
      if (answered && size <= MAX_OUTPUT_BYTES) resolve({ code: code ?? 0, stdout: Buffer.concat(stdout) })
      else reject(new GitCommandError(code ?? -1, errors))
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(options.input ?? '')
  })

const runGit = async (args: readonly string[], options: GitOptions = {}): Promise<Buffer> => (await execGit(args, options)).stdout

const text = async (output: Promise<Buffer>): Promise<string> => (await output).toString('utf8').trim()


const withTemporaryDirectory = async <T>(work: (directory: string) => Promise<T>): Promise<T> => {
  const directory = await mkdtemp(join(tmpdir(), 'conexus-git-'))
  try {
    return await work(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

// Counts the bytes through and fails the stream the moment they pass `limit`, so a file that grew
// after the sandbox reported its size still cannot reach the Hub's disk.
const limitBytes = (limit: number): Transform => {
  let seen = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.byteLength
      done(seen > limit ? new Failure('BUILDER_RESULT_BUNDLE_TOO_LARGE') : null, chunk)
    },
  })
}

const requireOid = (value: string, code: FailureCode): string => {
  if (!OID.test(value)) throw new Failure(code)
  return value
}

const requireCommit = (value: string, code: FailureCode): SourceRevision => SourceRevision.parse(requireOid(value, code))

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: debt: owning wave
export const createConexusGit = ({ root, starter }: Readonly<{ root: string; starter: readonly StarterFile[] }>) => {
  const repository = (projectId: ProjectId): string => {
    if (!PROJECT_ID.test(projectId)) throw new Failure('CONEXUS_GIT_PROJECT_REFUSED')
    return join(root, `${projectId}.git`)
  }
  const git = (projectId: ProjectId, args: readonly string[], options?: Parameters<typeof runGit>[1]): Promise<Buffer> =>
    runGit(['--git-dir', repository(projectId), ...args], options)

  // The query's output, or null for git's answer "no" (exit 1 with an empty stderr); any other outcome is a failure.
  const ask = async (projectId: ProjectId, args: readonly string[]): Promise<Buffer | null> => {
    const run = await execGit(['--git-dir', repository(projectId), ...args], { answers: [1] })
    return run.code === 0 ? run.stdout : null
  }
  const succeeds = async (projectId: ProjectId, args: readonly string[]): Promise<boolean> => await ask(projectId, args) !== null
  const hasCommit = (projectId: ProjectId, revision: SourceRevision): Promise<boolean> => succeeds(projectId, ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`])

  const readRef = async (projectId: ProjectId, ref: string): Promise<SourceRevision | null> => {
    const found = await ask(projectId, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return found === null ? null : requireCommit(found.toString('utf8').trim(), 'CONEXUS_GIT_REF_REFUSED')
  }

  const commitStarter = async (projectId: ProjectId): Promise<SourceRevision> => withTemporaryDirectory(async (directory) => {
    const index = { GIT_INDEX_FILE: join(directory, 'index') }
    const entries: string[] = []
    for (const file of starter) {
      const blob = requireOid(await text(git(projectId, ['hash-object', '-w', '--stdin'], { input: file.content })), 'CONEXUS_GIT_STARTER_REFUSED')
      entries.push(`${file.path.endsWith('.sh') ? '100755' : '100644'} ${blob}\t${file.path}`)
    }
    await git(projectId, ['update-index', '--index-info'], { input: `${entries.join('\n')}\n`, env: index })
    const tree = requireOid(await text(git(projectId, ['write-tree'], { env: index })), 'CONEXUS_GIT_STARTER_REFUSED')
    return requireCommit(await text(git(projectId, [
      '-c', `user.name=${BUILDER_IDENTITY.name}`, '-c', `user.email=${BUILDER_IDENTITY.email}`,
      'commit-tree', tree, '-m', STARTER_MESSAGE,
    ])), 'CONEXUS_GIT_STARTER_REFUSED')
  })

  // A compare and swap from `expected` (null: the ref must not exist), or a plain move when omitted.
  const moveRef = async (projectId: ProjectId, ref: string, next: SourceRevision, expected?: SourceRevision | null): Promise<void> => {
    if (!OID.test(next)) throw new Failure('CONEXUS_GIT_REF_REFUSED')
    const from = expected === undefined ? [] : [expected ?? NO_OBJECT]
    // A failed update is read back: the ref at `next` converged, still at `expected` the update itself failed
    // (a stale lock, the disk) and is that failure, and anywhere else it moved.
    await git(projectId, ['update-ref', ref, next, ...from]).catch(async (error: unknown) => {
      const now = await readRef(projectId, ref)
      if (now === next) return
      if (expected === undefined || now === expected) throw error
      throw new Failure('CONEXUS_GIT_REF_MOVED', { cause: error instanceof GitCommandError ? error.cause : undefined })
    })
  }

  // What a crashed process leaves: a ref lock older than any command can run, and staging refs, which never outlive a process.
  const reconcileOpen = async (projectId: ProjectId): Promise<void> => {
    const refs = join(repository(projectId), 'refs')
    for (const entry of await readdir(refs, { recursive: true })) {
      if (!entry.endsWith('.lock')) continue
      const lock = join(refs, entry)
      if (Date.now() - (await stat(lock)).mtimeMs < STALE_LOCK_MS) continue
      await rm(lock, { force: true })
      logLine('CONEXUS_GIT_STALE_LOCK_REMOVED', { 'git.ref': entry }, 'warn')
    }
    const staging = (await text(git(projectId, ['for-each-ref', '--format=%(refname)', 'refs/conexus/staging/']))).split('\n').filter(Boolean)
    for (const ref of staging) await git(projectId, ['update-ref', '-d', ref])
  }

  const readMain = async (projectId: ProjectId): Promise<SourceRevision> => {
    const main = await readRef(projectId, MAIN)
    if (!main) throw new Failure('CONEXUS_GIT_MAIN_MISSING')
    return main
  }

  return Object.freeze({
    /**
     * Converges on a repository whose `main` holds at least the starter: a missing repository is
     * created and an empty one gets the starter; one that already has `main` is left as it is.
     * Answers `main`.
     */
    ensureRepository: async (projectId: ProjectId): Promise<SourceRevision> => {
      const path = repository(projectId)
      await mkdir(root, { recursive: true, mode: 0o700 })
      await runGit(['init', '--quiet', '--bare', '--template=', path])
      await git(projectId, ['symbolic-ref', 'HEAD', MAIN])
      await reconcileOpen(projectId)
      const existing = await readRef(projectId, MAIN)
      if (existing) return existing
      const commit = await commitStarter(projectId)
      // Create-only: a concurrent ensure that got there first wins, and this one answers its main.
      await git(projectId, ['update-ref', MAIN, commit, NO_OBJECT]).catch(async (error: unknown) => {
        if (!await readRef(projectId, MAIN)) throw error
      })
      return readMain(projectId)
    },

    deleteRepository: async (projectId: ProjectId): Promise<void> => {
      await rm(repository(projectId), { recursive: true, force: true })
    },

    readMain,

    /**
     * Brings `main` into the conversation's mirror at the start of a turn. A mirror that already
     * holds `main` is the start as it is; one `main` already holds is left for the turn's first
     * snapshot to replace. Otherwise the Hub merges the two here and the mirror moves to the merge,
     * conflicts and their markers included: the agent resolves them as ordinary work.
     */
    startTurn: async (projectId: ProjectId, conversationId: ConversationId, main: SourceRevision): Promise<TurnStart> => {
      const ref = mirrorRef(conversationId)
      const mirror = await readRef(projectId, ref)
      const isAncestor = (ancestor: SourceRevision, descendant: SourceRevision): Promise<boolean> => succeeds(projectId, ['merge-base', '--is-ancestor', ancestor, descendant])
      if (!mirror || await isAncestor(mirror, main)) return { conversationId, main, start: main, mirror, previous: mirror, conflicted: [] }
      if (await isAncestor(main, mirror)) return { conversationId, main, start: mirror, mirror, previous: mirror, conflicted: [] }
      const [tree = '', ...conflicted] = (await git(projectId, ['merge-tree', '--write-tree', '--name-only', '-z', '--no-messages', mirror, main], { answers: [1] }))
        .toString('utf8').split('\0').filter(Boolean)
      const merge = requireCommit(await text(git(projectId, [
        '-c', `user.name=${BUILDER_IDENTITY.name}`, '-c', `user.email=${BUILDER_IDENTITY.email}`,
        'commit-tree', requireOid(tree, 'CONEXUS_GIT_MERGE_REFUSED'), '-p', mirror, '-p', main, '-m', 'Bring main into the conversation',
      ])), 'CONEXUS_GIT_MERGE_REFUSED')
      await moveRef(projectId, ref, merge, mirror)
      return { conversationId, main, start: merge, mirror: merge, previous: mirror, conflicted }
    },

    /**
     * A bundle of `main` at the turn's `main` and, when the turn starts elsewhere, of the
     * conversation's mirror at its start, for a run to fetch into its sandbox. It carries no other ref.
     */
    seedBundle: async (projectId: ProjectId, { conversationId, main, start }: TurnStart): Promise<Buffer> => {
      const refs = start === main ? [`${main} ${MAIN}`] : [`${main} ${MAIN}`, `${start} ${mirrorRef(conversationId)}`]
      const bundle = await git(projectId, ['bundle', 'create', '--quiet', '-', ...refs.map((line) => line.slice(41))])
      const header = bundle.subarray(0, bundle.indexOf('\n\n')).toString('utf8').split('\n')
      const carried = header.filter((line) => /^[0-9a-f]{40} /.test(line)).sort()
      if (carried.join('\n') !== [...refs].sort().join('\n')) throw new Failure('BUILDER_SOURCE_BASE_MOVED')
      return bundle
    },

    /**
     * Takes one snapshot out of a bundle the sandbox made. Only the snapshot's own ref is fetched,
     * into a staging ref, every object is checked, and the commit must have `parent` as its only
     * parent. Then the snapshot's ref moves to it under git's ref lock: from `expected` when given
     * (null creates it), or unconditionally when omitted, as for a run's own candidate ref.
     */
    acceptSnapshot: async (projectId: ProjectId, { ref, parent, bundle, expected }: Snapshot & Readonly<{ bundle: Uint8Array | ReadableStream<Uint8Array>; expected?: SourceRevision | null }>): Promise<SourceRevision> => {
      if (!SNAPSHOT_REF.test(ref) || !OID.test(parent) || (expected && !OID.test(expected))) throw new Failure('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      const staging = `refs/conexus/staging/${randomUUID()}`
      try {
        await withTemporaryDirectory(async (directory) => {
          const file = join(directory, 'snapshot.bundle')
          if (bundle instanceof Uint8Array) await writeFile(file, bundle, { mode: 0o600 })
          else {
            await pipeline(Readable.from(bundle), limitBytes(MAX_RESULT_BUNDLE_BYTES), createWriteStream(file, { mode: 0o600 }))
          }
          await git(projectId, [
            '-c', 'transfer.fsckObjects=true', '-c', 'fetch.fsckObjects=true',
            'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', file, `+${ref}:${staging}`,
          ])
        })
        const [commitText, ...parents] = (await text(git(projectId, ['rev-list', '--parents', '-n', '1', staging]))).split(' ')
        const commit = SourceRevision.safeParse(commitText)
        if (!commit.success || parents.length !== 1 || parents[0] !== parent) throw new Failure('BUILDER_RESULT_MATERIALIZATION_REFUSED')
        const tree = (await git(projectId, ['ls-tree', '-r', '-l', '-z', staging])).toString('utf8').split('\0').filter(Boolean)
        const sizes = tree.map((entry) => /^\d+ blob [0-9a-f]{40} +(\d+)\t/.exec(entry)?.[1]).map(Number)
        if (tree.length > MAX_RESULT_FILES || sizes.some((size) => size > MAX_RESULT_FILE_BYTES)) throw new Failure('BUILDER_RESULT_CONTENT_TOO_LARGE')
        await moveRef(projectId, ref, commit.data, expected)
        return commit.data
      } finally {
        await git(projectId, ['update-ref', '-d', staging])
      }
    },

    /** The head of a conversation's mirror, or null when it has none yet. */
    readMirror: (projectId: ProjectId, conversationId: ConversationId): Promise<SourceRevision | null> => readRef(projectId, mirrorRef(conversationId)),

    /** Moves a conversation's mirror from exactly `expected` (null: it has none) to `next`, under git's ref lock. */
    moveMirror: (projectId: ProjectId, conversationId: ConversationId, { expected, next }: Readonly<{ expected: SourceRevision | null; next: SourceRevision }>): Promise<void> =>
      moveRef(projectId, mirrorRef(conversationId), next, expected),

    /**
     * The moment of admission: `main` moves from exactly `base` to `candidate`, a descendant of it,
     * under git's ref lock. A retry after `main` already moved to the candidate converges.
     */
    fastForwardMain: async (projectId: ProjectId, { base, candidate }: Readonly<{ base: SourceRevision; candidate: SourceRevision }>): Promise<void> => {
      if (!OID.test(base) || !OID.test(candidate) || base === candidate) throw new Failure('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      if (!await succeeds(projectId, ['merge-base', '--is-ancestor', base, candidate])) throw new Failure('BUILDER_RESULT_MATERIALIZATION_REFUSED')
      await moveRef(projectId, MAIN, candidate, base).catch((error: unknown) => {
        throw error instanceof Failure && error.id === 'CONEXUS_GIT_REF_MOVED' ? new Failure('BUILDER_SOURCE_BASE_MOVED') : error
      })
    },

    /** Whether this commit is the starter: the root commit `ensureRepository` made, which no saved version precedes. */
    isStarter: async (projectId: ProjectId, revision: SourceRevision): Promise<boolean> =>
      await hasCommit(projectId, revision) && (await text(git(projectId, ['rev-list', '--parents', '-n', '1', revision]))).split(' ').length === 1,

    /** Whether `main` holds this commit in its history, which is how a restart learns a run was admitted. */
    mainContains: async (projectId: ProjectId, revision: SourceRevision): Promise<boolean> => {
      if (!await hasCommit(projectId, revision)) return false
      const main = await readMain(projectId)
      return succeeds(projectId, ['merge-base', '--is-ancestor', revision, main])
    },

    /** Every entry of a commit's tree, directories included, or null when the commit is not here. */
    listTree: async (projectId: ProjectId, revision: SourceRevision): Promise<readonly GitTreeEntry[] | null> => {
      if (!await hasCommit(projectId, revision)) return null
      const output = await git(projectId, ['ls-tree', '-r', '-t', '-z', '--full-tree', revision])
      return output.toString('utf8').split('\0').filter(Boolean).map((line) => {
        const tab = line.indexOf('\t')
        const [mode = '', type = ''] = line.slice(0, tab).split(' ')
        return { mode, type, path: line.slice(tab + 1) }
      })
    },

    /** One path's blob at a commit with its mode and size, or null when the commit or path is not there. */
    readBlob: async (projectId: ProjectId, revision: SourceRevision, path: string, maxBytes: number): Promise<Readonly<{ mode: string; type: string; size: number; bytes: Buffer | null }> | null> => {
      if (!await hasCommit(projectId, revision)) return null
      const listed = (await git(projectId, ['ls-tree', '-l', '-z', '--full-tree', revision, '--', path])).toString('utf8').split('\0').filter(Boolean)
      const line = listed.find((entry) => entry.slice(entry.indexOf('\t') + 1) === path)
      if (!line) return null
      const [mode = '', type = '', oid = '', size = ''] = line.slice(0, line.indexOf('\t')).split(/ +/)
      const bytes = type === 'blob' && Number(size) <= maxBytes ? await git(projectId, ['cat-file', 'blob', oid]) : null
      return { mode, type, size: Number(size), bytes }
    },

    /** The paths that differ between two commits, renames found, or null when either is not here. */
    diff: async (projectId: ProjectId, base: SourceRevision, result: SourceRevision): Promise<readonly GitChange[] | null> => {
      if (!await hasCommit(projectId, base) || !await hasCommit(projectId, result)) return null
      const fields = (await git(projectId, ['diff-tree', '-r', '-z', '-M', '--no-commit-id', '--name-status', base, result])).toString('utf8').split('\0')
      const changes: GitChange[] = []
      for (let at = 0, status = fields[at]; status; status = fields[at]) {
        const renamed = status.startsWith('R') || status.startsWith('C')
        const previousPath = renamed ? fields[at + 1] ?? '' : null
        const path = fields[renamed ? at + 2 : at + 1] ?? ''
        changes.push({ status, path, previousPath })
        at += renamed ? 3 : 2
      }
      return changes
    },

    /** `git ls-tree -r -l` of the given roots, the listing the application build admits. */
    listFilesLong: async (projectId: ProjectId, revision: SourceRevision, roots: readonly string[]): Promise<string> =>
      (await git(projectId, ['ls-tree', '-r', '-l', revision, '--', ...roots])).toString('utf8'),

    /** A tar of the given paths at a commit, made from the checked repository, never from the sandbox. */
    archive: async (projectId: ProjectId, revision: SourceRevision, paths: readonly string[]): Promise<Buffer> =>
      git(projectId, ['archive', '--format=tar', revision, '--', ...paths]),
  })
}

const uuidRef = (prefix: string, id: string): string => {
  if (!PROJECT_ID.test(id)) throw new Failure('CONEXUS_GIT_REF_REFUSED')
  return `${prefix}/${id}`
}

/** A run's candidate: one commit on the run's base. */
export const candidateSnapshot = (runId: ExecutionId, base: SourceRevision): Snapshot => ({ ref: uuidRef('refs/conexus/runs', runId), parent: base })

const mirrorRef = (conversationId: ConversationId): string => uuidRef('refs/conexus/conversations', conversationId)

/** A conversation's mirror of its checkout: one commit on the turn's start. */
export const mirrorSnapshot = (conversationId: ConversationId, turnStart: SourceRevision): Snapshot => ({ ref: mirrorRef(conversationId), parent: turnStart })

/** What a run's source steps need of its sandbox. Commands run in the checkout as the agent's user. */
export type RunSourceSandbox = Readonly<{
  direct(command: string, args: string[]): Promise<CommandResult>
  /** Writes a file only root can change and the agent's user can read. */
  writeRootFile(path: string, bytes: Uint8Array): Promise<void>
  /** Reads a file with the agent user's own permissions. */
  readAgentFile(path: string): Promise<Uint8Array>
  /** The same read as a stream, for a file the Hub must not hold in memory. */
  readAgentFileStream(path: string): Promise<ReadableStream<Uint8Array>>
}>

export const quoted = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`
const evidence = (value: string): string => value.slice(-2_000)

type SeedInput = Readonly<{
  git: Pick<ConexusGit, 'seedBundle'>
  projectId: ProjectId
  turn: TurnStart
  sandbox: RunSourceSandbox
  checkout: string
  seedFile: string
}>

const fetchSeed = async ({ git, projectId, turn, sandbox, seedFile }: SeedInput): Promise<string> => {
  await sandbox.writeRootFile(seedFile, await git.seedBundle(projectId, turn))
  const fetched = [`'+${MAIN}:refs/conexus/base'`, ...(turn.start === turn.main ? [] : [quoted(`+${mirrorRef(turn.conversationId)}:refs/conexus/start`)])]
  return `git fetch --quiet --no-tags ${quoted(seedFile)} ${fetched.join(' ')}`
}

/**
 * Puts the turn's start in the sandbox's checkout: the Hub bundles `main` and, when the turn starts
 * from the conversation's mirror, the mirror too; the sandbox fetches that bundle, and the checkout
 * is reset to exactly the start.
 */
const seedSandbox = async (input: SeedInput): Promise<void> => {
  const fetch = await fetchSeed(input)
  const seeded = await input.sandbox.direct('sh', ['-c', [
    'set -e',
    `mkdir -p ${quoted(input.checkout)}`,
    `cd ${quoted(input.checkout)}`,
    'test -d .git || git init --quiet',
    fetch,
    `git checkout --quiet --force -B main ${quoted(input.turn.start)}`,
    'git clean -fdq',
    `test "$(git rev-parse HEAD)" = ${quoted(input.turn.start)}`,
  ].join('\n')])
  if (seeded.exitCode !== 0) throw new Failure('BUILDER_SOURCE_BASE_PIN_REFUSED', { cause: { exitCode: seeded.exitCode, stderr: evidence(seeded.stderr) } })
}

/**
 * Brings the turn's start into the conversation's checkout (spec 0002 amendment, B3). A VM that kept
 * the checkout of the turn that made the mirror's previous head (it holds that commit) takes the
 * start in place: the Hub's bundle only when it lacks the start, a mixed reset to that head, whose
 * tree the files are, then a checkout that git refuses rather than overwrite a local change. Every
 * file the VM holds stays. A new VM is seeded, and one git refused is seeded again from the start.
 */
export const startCheckout = async (input: SeedInput): Promise<CheckoutStart> => {
  const { turn, sandbox, checkout } = input
  const held = await sandbox.direct('sh', ['-c', [
    `cd ${quoted(checkout)} 2>/dev/null || { echo SEED; exit 0; }`,
    `previous=$(git rev-parse --verify --quiet ${quoted(`${turn.previous ?? 'HEAD'}^{commit}`)}) || { echo SEED; exit 0; }`,
    `if git cat-file -e ${quoted(`${turn.start}^{commit}`)} 2>/dev/null; then echo "HELD $previous"; else echo "FETCH $previous"; fi`,
  ].join('\n')])
  const [state = 'SEED', previous = ''] = held.stdout.trim().split('\n').pop()?.split(' ') ?? []
  if (held.exitCode !== 0 || state === 'SEED' || !OID.test(previous)) {
    await seedSandbox(input)
    return 'SEEDED'
  }
  const resumed = await sandbox.direct('sh', ['-c', [
    'set -e',
    `cd ${quoted(checkout)}`,
    ...(state === 'FETCH' ? [await fetchSeed(input)] : []),
    `git reset --quiet ${quoted(previous)}`,
    `git checkout --quiet -B main ${quoted(turn.start)}`,
    `test "$(git rev-parse HEAD)" = ${quoted(turn.start)}`,
  ].join('\n')])
  if (resumed.exitCode === 0) return 'RESUMED'
  await seedSandbox(input)
  return 'RESEEDED'
}

/**
 * The Hub's commit of the checkout: the whole tree (ignored files and the `excluded` paths, such as
 * a methodology's uncommitted plan folder, left out) as one commit on the snapshot's parent, bundled in the sandbox and
 * accepted into the Conexus Git under the snapshot's ref. Answers null when the tree equals
 * `unchangedFrom`'s, and `sameAs` when the tree equals that earlier snapshot's. Each `scratch` has its own index and bundle file in the checkout, so a mirror
 * and a candidate never remove each other's.
 */
export const pullSnapshot = async ({ git, projectId, snapshot, expected, unchangedFrom = snapshot.parent, sameAs, scratch, sandbox, checkout, excluded = [] }: Readonly<{
  git: Pick<ConexusGit, 'acceptSnapshot'>
  projectId: ProjectId
  snapshot: Snapshot
  /** Passed to `acceptSnapshot`: the ref's head this snapshot replaces. */
  expected?: SourceRevision | null
  unchangedFrom?: SourceRevision
  /** An earlier snapshot of this ref, answered again when the tree has not changed since it. */
  sameAs?: SourceRevision
  scratch: 'candidate' | 'mirror'
  sandbox: RunSourceSandbox
  checkout: string
  excluded?: readonly string[]
}>): Promise<SourceRevision | null> => {
  const bundleFile = `${checkout}/.git/conexus-${scratch}.bundle`
  const { ref, parent } = snapshot
  const committed = await sandbox.direct('sh', ['-c', [
    'set -e',
    `cd ${quoted(checkout)}`,
    `export GIT_INDEX_FILE=.git/conexus-${scratch}-index`,
    'rm -f "$GIT_INDEX_FILE"',
    `git read-tree ${quoted(parent)}`,
    `git add --all -- . ${excluded.map((path) => quoted(`:(exclude)${path}`)).join(' ')}`,
    'tree=$(git write-tree)',
    `if [ "$tree" = "$(git rev-parse ${quoted(`${unchangedFrom}^{tree}`)})" ]; then echo UNCHANGED; exit 0; fi`,
    ...(sameAs ? [`if [ "$tree" = "$(git rev-parse ${quoted(`${sameAs}^{tree}`)})" ]; then echo SAME; exit 0; fi`] : []),
    `commit=$(git -c user.name=${quoted(BUILDER_IDENTITY.name)} -c user.email=${quoted(BUILDER_IDENTITY.email)} commit-tree "$tree" -p ${quoted(parent)} -m 'Conexus Builder')`,
    `git update-ref ${quoted(ref)} "$commit"`,
    `rm -f ${quoted(bundleFile)}`,
    `git bundle create --quiet ${quoted(bundleFile)} ${quoted(ref)} ${quoted(`^${parent}`)}`,
    `echo "size=$(stat -c %s ${quoted(bundleFile)})"`,
    'echo "$commit"',
  ].join('\n')])
  const lines = committed.stdout.trim().split('\n')
  const reported = lines.pop() ?? ''
  if (committed.exitCode !== 0 || (reported !== 'UNCHANGED' && reported !== 'SAME' && !OID.test(reported))) {
    throw new Failure('CONEXUS_GIT_FAILED', { cause: { exitCode: committed.exitCode, stderr: evidence(committed.stderr) } })
  }
  if (reported === 'UNCHANGED') return null
  if (reported === 'SAME' && sameAs) return sameAs
  const size = Number(/^size=(\d+)$/.exec(lines.pop() ?? '')?.[1])
  if (!Number.isSafeInteger(size)) throw new Failure('BUILDER_RESULT_MATERIALIZATION_REFUSED')
  if (size > MAX_RESULT_BUNDLE_BYTES) throw new Failure('BUILDER_RESULT_BUNDLE_TOO_LARGE')
  const accepted = await git.acceptSnapshot(projectId, { ...snapshot, bundle: await sandbox.readAgentFileStream(bundleFile), ...(expected === undefined ? {} : { expected }) })
  if (accepted !== reported) throw new Failure('BUILDER_RESULT_MATERIALIZATION_REFUSED')
  return SourceRevision.parse(accepted)
}
