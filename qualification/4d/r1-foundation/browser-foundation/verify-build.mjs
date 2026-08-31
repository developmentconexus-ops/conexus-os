import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('dist')
const files = []
const visit = path => {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const candidate = resolve(path, entry.name)
    if (entry.isDirectory()) visit(candidate)
    else files.push(candidate)
  }
}
visit(root)
const text = files.map(path => readFileSync(path).toString('utf8')).join('\n')
const secret = process.env.R1F_SERVER_SECRET
assert.ok(secret)
assert.equal(text.includes(secret), false, 'server secret leaked into browser bundle')
assert.equal(text.includes('project-a'), false, 'server grant identity leaked into browser bundle')
assert.equal(text.includes('workspace-a'), false, 'server Workspace authority leaked into browser bundle')
assert.ok(text.includes(process.env.VITE_PUBLIC_LABEL), 'explicit public build value missing')
assert.ok(files.some(path => /assets[/\\].+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(path)), 'hashed asset missing')
const manifest = JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8'))
assert.ok(Object.values(manifest).some(entry => entry.isEntry && /-[A-Za-z0-9_-]{8,}\.js$/.test(entry.file)))
process.stdout.write(`${JSON.stringify({ kind: 'conexus.r1f.browser-build/v1', files: files.length, secretLeak: false, authorityLeak: false, verdict: 'PASS' })}\n`)
