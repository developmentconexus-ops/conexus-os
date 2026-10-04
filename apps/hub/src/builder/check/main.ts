import { type Command, parseCommand, USAGE } from './command.js'
import { checkContextOf, type Host, placeOf } from './context.js'
import { runCheck, writeThumbnail } from './run.js'
import { bootWorker } from './steps/boot.js'
import { buildWorker } from './steps/build.js'
import { serverBundle } from './steps/server-bundle.js'

const finish = (line: string): void => { process.stdout.write(`${line}\n`, () => process.exit(0)) }
const fail = (message: string, code: number): never => {
  process.stderr.write(`${message}\n`)
  return process.exit(code)
}

const check = async (command: Extract<Command, { kind: 'CHECK' }>, host: Host): Promise<void> => {
  let run: Awaited<ReturnType<typeof runCheck>>
  try {
    run = await runCheck(checkContextOf(command, host))
  } catch (error) {
    return fail(`check setup failed: ${error instanceof Error ? error.message : String(error)}`, 3)
  }
  if (run.thumbnail && command.thumbnail) writeThumbnail(command.thumbnail, run.thumbnail)
  finish(JSON.stringify(run.report))
}

const server = async (command: Extract<Command, { kind: 'SERVER' }>, host: Host): Promise<void> => {
  const outcome = await serverBundle(placeOf(command, host))
  if (outcome.kind === 'failed') fail(`conexus server check: ${outcome.problems[0]?.message}`, 1)
  process.exit(0)
}

const worker = async (command: Extract<Command, { kind: 'WORKER' }>, host: Host): Promise<void> => {
  const place = placeOf(command, host)
  switch (command.worker) {
    case 'build': return finish(JSON.stringify(await buildWorker(place)))
    case 'server': return finish(JSON.stringify(await serverBundle(place)))
    case 'boot': return finish(JSON.stringify(await bootWorker(place)))
  }
}

const command = parseCommand(process.argv.slice(2)) ?? fail(USAGE, 2)
// biome-ignore lint/style/noProcessEnv: the process environment is read once, here, at the check's boundary.
const host: Host = { mainPath: process.argv[1] ?? '', uid: process.getuid?.() ?? -1, home: process.env.HOME, path: process.env.PATH }
switch (command.kind) {
  case 'CHECK': await check(command, host); break
  case 'SERVER': await server(command, host); break
  case 'WORKER': await worker(command, host); break
}
