// One process of a lock race: waits for the start file, takes the tool cache's lock for the key, and
// records whether anyone else was inside at the same time.
import { appendFileSync, closeSync, existsSync, openSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [cacheModule, directory, logFile, startFile] = process.argv.slice(2)
const { withToolCache } = await import(pathToFileURL(cacheModule).href)
while (!existsSync(startFile)) await new Promise((resolve) => setTimeout(resolve, 1))
await withToolCache(directory, async () => {
  const inside = join(directory, '..', 'inside')
  let fd
  try { fd = openSync(inside, 'wx') } catch { appendFileSync(logFile, `OVERLAP ${process.pid}\n`) }
  appendFileSync(logFile, `IN ${process.pid}\n`)
  await new Promise((resolve) => setTimeout(resolve, 30))
  if (fd !== undefined) { closeSync(fd); rmSync(inside, { force: true }) }
})
