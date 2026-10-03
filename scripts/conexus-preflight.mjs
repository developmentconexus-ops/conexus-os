import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))

/** Compare the running Node and npm with the pins of this repository. Returns the problems found. */
export function checkToolchain({ node, npm, platform, execPath, pins }) {
  const problems = []
  if (platform !== 'linux') problems.push(`Linux Node is required, this one is ${platform}`)
  if (/^\/mnt\/|\.exe$/.test(execPath)) problems.push(`Node runs from a Windows path: ${execPath}`)
  if (node !== pins.node) problems.push(`Node is ${node}, .nvmrc pins ${pins.node}`)
  if (npm !== pins.npm) problems.push(`npm is ${npm}, package.json engines.npm pins ${pins.npm}`)
  return problems
}

export function main() {
  const pins = {
    node: readFileSync(resolve(repositoryRoot, '.nvmrc'), 'utf8').trim(),
    npm: JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')).engines.npm,
  }
  const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? ''
  const node = process.version.replace(/^v/, '')
  const problems = checkToolchain({ node, npm, platform: process.platform, execPath: process.execPath, pins })
  if (problems.length) {
    console.error(problems.map(problem => `preflight: ${problem}`).join('\n'))
    return 1
  }
  console.log(`Toolchain matches: node ${node}, npm ${npm}.`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
