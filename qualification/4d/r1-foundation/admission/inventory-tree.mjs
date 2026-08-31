import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('usage: node inventory-tree.mjs <node_modules>')

const records = []
const visit = path => {
  const stat = lstatSync(path)
  const name = relative(root, path).replaceAll('\\', '/')
  if (stat.isSymbolicLink()) {
    records.push({ path: name, type: 'symlink', target: readlinkSync(path) })
    return
  }
  if (stat.isDirectory()) {
    for (const child of readdirSync(path).sort()) visit(resolve(path, child))
    return
  }
  if (stat.isFile()) {
    records.push({
      path: name,
      type: 'file',
      mode: stat.mode & 0o777,
      sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    })
  }
}

visit(root)
const canonical = JSON.stringify(records)
process.stdout.write(`${JSON.stringify({
  kind: 'conexus.r1f.installed-tree-inventory/v1',
  recordCount: records.length,
  treeSha256: createHash('sha256').update(canonical).digest('hex'),
}, null, 2)}\n`)
