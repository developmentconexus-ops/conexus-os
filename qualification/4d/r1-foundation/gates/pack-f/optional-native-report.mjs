import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [lockPath, nodeModules] = process.argv.slice(2)
if (!lockPath || !nodeModules) throw new Error('usage: node optional-native-report.mjs <lock> <node_modules>')
const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
const records = []
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || !entry.optional) continue
  const installed = existsSync(resolve(nodeModules, path.slice('node_modules/'.length), 'package.json'))
  records.push({
    path,
    version: entry.version,
    os: entry.os ?? [],
    cpu: entry.cpu ?? [],
    installedOnLinuxX64: installed,
  })
}
records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
const absent = records.filter(record => !record.installedOnLinuxX64)
process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.optional-native-delta/v1',
  optionalLocked: records.length,
  absentOnLinuxX64: absent.length,
  windowsCandidates: records.filter(record => record.os.includes('win32')).map(record => record.path),
  darwinCandidates: records.filter(record => record.os.includes('darwin')).map(record => record.path),
  linuxInstalled: records.filter(record => record.installedOnLinuxX64).map(record => record.path),
  records,
  authority: 'NON_AUTHORITATIVE_DEVELOPER_HOST_DELTA',
}, null, 2)}\n`)
