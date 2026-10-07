import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function checkHubBuild(directory, sha) {
  if (!directory || !/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('Hub artifact requires its directory and exact source SHA')
  if (readFileSync(resolve(directory, 'source-sha'), 'utf8').trim() !== sha) throw new Error('Hub artifact belongs to another commit')
  for (const file of ['server.js', 'app-check/main.mjs', '../public/index.html']) {
    const entry = statSync(resolve(directory, file))
    if (!entry.isFile() || entry.size === 0) throw new Error(`Hub artifact is missing compiled content: ${file}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkHubBuild(process.env.CONEXUS_HUB_BUILD, process.env.TARGET_SHA)
}
