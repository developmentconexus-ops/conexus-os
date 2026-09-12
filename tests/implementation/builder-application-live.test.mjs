import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import test from 'node:test'
import { chromium } from '@playwright/test'
import { Sandbox, NotFoundError } from 'e2b'
import { readBuilderE2BApiKey } from '../../scripts/rb-builder-e2b-template.mjs'

const live = process.env.CONEXUS_APPLICATION_COMPILER_LIVE === 'true'

test('production compiler builds a browser app and rejects unresolved imports in real E2B', {
  skip: live ? false : 'requires exact live compiler grant and CONEXUS_APPLICATION_COMPILER_LIVE=true',
  timeout: 10 * 60_000,
}, async t => {
  const root = resolve(import.meta.dirname, '../..')
  const cache = resolve(root, 'node_modules/.cache')
  mkdirSync(cache, { recursive: true })
  const compiledRoot = mkdtempSync(resolve(cache, 'application-compiler-live-'))
  const evidenceRoot = mkdtempSync(resolve(tmpdir(), 'conexus-application-adapter-live-'))
  const compiled = spawnSync(process.execPath, [
    resolve(root, 'node_modules/typescript/bin/tsc'), '--project', resolve(root, 'apps/hub/tsconfig.json'),
    '--noEmit', 'false', '--outDir', compiledRoot,
  ], { cwd: root, encoding: 'utf8' })
  assert.equal(compiled.status, 0, compiled.stdout || compiled.stderr)
  const { createE2BApplicationCompiler } = await import(pathToFileURL(resolve(compiledRoot, 'builder/application-artifact-runtime.js')).href)
  const apiKey = readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE)
  const sandboxIds = []
  t.after(() => t.diagnostic(JSON.stringify({ evidenceRoot, sandboxIds })))
  const compiler = createE2BApplicationCompiler({ apiKey, onSandboxCreated: sandboxId => {
    sandboxIds.push(sandboxId)
    writeFileSync(resolve(evidenceRoot, 'resources.json'), JSON.stringify({ sandboxIds }), { mode: 0o600 })
  } })
  const input = {
    projectId: randomUUID(), changeId: randomUUID(), sourceRevision: 'a'.repeat(40),
    files: [
      { path: 'index.html', content: '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><link rel="icon" href="data:,"><title>Compiler adapter</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>' },
      { path: 'src/main.tsx', content: `import * as React from 'react'
import { createRoot } from 'react-dom/client'
function App() {
  const [count, setCount] = React.useState(0)
  return <main><h1>Conexus compiler adapter</h1><output>{count}</output><button onClick={() => setCount(n => n + 1)}>Adicionar</button><button onClick={() => setCount(0)}>Limpar</button></main>
}
createRoot(document.getElementById('root')!).render(<App />)
` },
    ],
  }
  const started = Date.now()
  const result = await compiler.compile(input)
  const compileMs = Date.now() - started
  assert.equal(result.projectId, input.projectId)
  assert.equal(result.changeId, input.changeId)
  assert.equal(result.sourceRevision, input.sourceRevision)
  assert.ok(result.files.some(file => file.path === 'index.html'))
  const files = new Map(result.files.map(file => [`/${file.path}`, file]))
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    const file = files.get(path === '/' ? '/index.html' : path)
    if (!file) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': file.mediaType, 'Cache-Control': 'no-store' })
    response.end(file.bytes)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  const errors = []
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle', timeout: 30_000 })
    assert.equal(await page.locator('output').innerText(), '0')
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
    assert.equal(await page.locator('output').innerText(), '2')
    await page.screenshot({ path: resolve(evidenceRoot, 'app.png') })
    await page.getByRole('button', { name: 'Limpar', exact: true }).click()
    assert.equal(await page.locator('output').innerText(), '0')
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
  const failedAt = Date.now()
  await assert.rejects(compiler.compile({ ...input, changeId: randomUUID(), files: [
    input.files[0], { path: 'src/main.tsx', content: 'import "package-that-is-not-installed-in-conexus"' },
  ] }), /APPLICATION_COMPILATION_FAILED/)
  assert.equal(sandboxIds.length, 2)
  for (const sandboxId of sandboxIds) {
    await assert.rejects(Sandbox.getInfo(sandboxId, { apiKey }), error => error instanceof NotFoundError)
  }
  const receipt = {
    proofClass: 'production compiler module with controlled source; not Builder authentication or Git custody',
    templateRef: result.templateRef, recipeSha256: result.recipeSha256, sandboxIds,
    compileMs, rejectedBuildMs: Date.now() - failedAt, browser: { initial: 0, afterAdd: 2, afterClear: 0, errors },
    allSandboxesNotFoundAfterCleanup: true,
    files: result.files.map(({ path, mediaType, bytes, sha256 }) => ({ path, mediaType, byteLength: bytes.byteLength, sha256 })),
  }
  writeFileSync(resolve(evidenceRoot, 'receipt.json'), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 })
  t.diagnostic(JSON.stringify({ evidenceRoot, ...receipt }))
})
