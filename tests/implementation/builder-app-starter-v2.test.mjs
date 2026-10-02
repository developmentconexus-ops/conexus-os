import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { ensureCompilerRoot } from './compiler-root.mjs'
import { hubModuleUrl } from './hub-build.mjs'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const compilerRoot = await ensureCompilerRoot()
const { typescriptProjects } = await import(join(compilerRoot, 'tsconfig.mjs'))
const { fixedApplicationStarterFiles, APPLICATION_SHAPE_FILES } = await import(hubModuleUrl('builder/application-starter.js'))
const { previewContentSecurityPolicy } = await import(hubModuleUrl('platform/application-csp.js'))

const DEMO_ROUTE = `import { useState } from 'react'
import { Bar, BarChart, XAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'

const config = { total: { label: 'Total', color: 'var(--chart-1)' } } satisfies ChartConfig
const rows = [{ region: 'Sul', total: 1200 }, { region: 'Norte', total: 800 }, { region: 'Leste', total: 950 }]

export function Demo() {
  const [day, setDay] = useState<Date | undefined>(new Date(2026, 8, 28))
  return (
    <div className="grid gap-4">
      <Dialog>
        <DialogTrigger render={<Button>Abrir dialogo</Button>} />
        <DialogContent>
          <DialogTitle>Novo lancamento</DialogTitle>
          <DialogDescription>Preencha os campos.</DialogDescription>
        </DialogContent>
      </Dialog>
      <Sheet>
        <SheetTrigger render={<Button variant="outline">Abrir painel</Button>} />
        <SheetContent><SheetTitle>Painel lateral</SheetTitle></SheetContent>
      </Sheet>
      <Select defaultValue="sul">
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="sul">Sul</SelectItem><SelectItem value="norte">Norte</SelectItem></SelectContent>
      </Select>
      <Button onClick={() => toast.add({ title: 'Salvo', description: 'Lancamento salvo.' })}>Salvar</Button>
      <ChartContainer config={config} className="h-64">
        <BarChart data={rows}><XAxis dataKey="region" /><Bar dataKey="total" fill="var(--color-total)" /></BarChart>
      </ChartContainer>
      <Calendar mode="single" selected={day} onSelect={setDay} />
    </div>
  )
}
`

const DEMO_ROUTER = `import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { Demo } from '@/routes/demo'
import { Home } from '@/routes/home'

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home }),
  createRoute({ getParentRoute: () => rootRoute, path: '/demo', component: Demo }),
])
export const router = createRouter({ routeTree })
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
`

const materialize = (extra = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'conexus-starter-v2-'))
  const files = [...fixedApplicationStarterFiles(repositoryRoot), ...APPLICATION_SHAPE_FILES]
  for (const { path, content } of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  for (const [path, content] of Object.entries(extra)) writeFileSync(join(root, path), content)
  symlinkSync(join(compilerRoot, 'node_modules'), join(root, 'app/node_modules'))
  return root
}

const typecheck = (root) => {
  const config = join(root, 'tsconfig.app.json')
  writeFileSync(config, JSON.stringify(typescriptProjects({ compilerRoot, root }).app))
  const result = spawnSync(process.execPath, [join(compilerRoot, 'node_modules/typescript/bin/tsc'), '-p', config, '--pretty', 'false'], { encoding: 'utf8', cwd: root })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const build = (root) => {
  const result = spawnSync(process.execPath, [
    join(compilerRoot, 'node_modules/vite/bin/vite.js'), 'build', '--config', join(compilerRoot, 'vite.config.mjs'),
    '--configLoader', 'native', '--outDir', join(root, 'dist'), '--emptyOutDir',
  ], { encoding: 'utf8', env: { ...process.env, CONEXUS_COMPILE_ROOT: join(root, 'app') } })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const jsGzipBytes = (dist) => readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.js'))
  .reduce((sum, path) => sum + gzipSync(readFileSync(join(dist, path))).length, 0)

const MEDIA = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

// The Prévia's own policy and deep link fallback, over the build output.
const servePrevia = async (dist) => {
  const policy = previewContentSecurityPolicy('http://127.0.0.1')
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname)
    let file = path === '/' ? 'index.html' : path.slice(1)
    try {
      if (!statSync(join(dist, file)).isFile()) throw new Error('missing')
    } catch {
      if (extname(file) !== '') return void response.writeHead(404).end()
      file = 'index.html'
    }
    response.writeHead(200, { 'content-type': MEDIA[extname(file)] ?? 'application/octet-stream', 'content-security-policy': policy })
    response.end(readFileSync(join(dist, file)))
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

const openPage = async (browser, origin, path) => {
  const page = await browser.newPage()
  const problems = []
  await page.addInitScript(() => {
    window.__violations = []
    document.addEventListener('securitypolicyviolation', (event) => window.__violations.push(`${event.violatedDirective}: ${event.blockedURI}`))
  })
  // Chromium warns about the Previa's sandbox directive on any page it loads as a top level document.
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) && !message.text().startsWith('An iframe which has both allow-scripts')) problems.push(`console.${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`))
  await page.goto(`${origin}${path}`)
  return { page, problems, violations: () => page.evaluate(() => window.__violations) }
}

test('the starter typechecks, builds, and shows its empty state with no CSP violation under the Previa policy', async () => {
  const root = materialize()
  try {
    assert.deepEqual(typecheck(root), { status: 0, output: '' })
    const built = build(root)
    assert.equal(built.status, 0, built.output)
    const bytes = jsGzipBytes(join(root, 'dist'))
    assert.equal(bytes > 100_000 && bytes < 220_000, true, `starter JavaScript is ${bytes} bytes gzip`)
    const previa = await servePrevia(join(root, 'dist'))
    const browser = await chromium.launch()
    try {
      const { page, problems, violations } = await openPage(browser, previa.origin, '/')
      await page.getByText('Este app ainda está vazio').waitFor()
      assert.deepEqual(problems, [])
      assert.deepEqual(await violations(), [])
    } finally {
      await browser.close()
      previa.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a dialog, sheet, select, toast, chart and calendar built from the starter components raise no CSP violation', async () => {
  const root = materialize({ 'app/src/routes/demo.tsx': DEMO_ROUTE, 'app/src/router.tsx': DEMO_ROUTER })
  try {
    assert.deepEqual(typecheck(root), { status: 0, output: '' })
    const built = build(root)
    assert.equal(built.status, 0, built.output)
    const previa = await servePrevia(join(root, 'dist'))
    const browser = await chromium.launch()
    try {
      const { page, problems, violations } = await openPage(browser, previa.origin, '/demo')
      await page.getByRole('button', { name: 'Abrir dialogo' }).click()
      await page.getByRole('dialog').getByText('Novo lancamento').waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Abrir painel' }).click()
      await page.getByRole('dialog').getByText('Painel lateral').waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('combobox').click()
      await page.getByRole('option', { name: 'Norte' }).click()
      await page.getByRole('button', { name: 'Salvar' }).click()
      await page.getByText('Lancamento salvo.').waitFor()
      assert.equal(await page.locator('.recharts-bar-rectangle').count(), 3)
      assert.equal(await page.getByRole('grid').count() > 0, true)
      assert.equal(await page.locator('[data-slot="chart"]').evaluate((element) => element.style.getPropertyValue('--color-total')), 'var(--chart-1)')
      assert.deepEqual(problems, [])
      assert.deepEqual(await violations(), [])
    } finally {
      await browser.close()
      previa.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const ZOD_ROUTE = `import { z } from 'zod'

const lancamento = z.object({ produto: z.string().min(1), quantidade: z.number().int().positive() })

export function Demo() {
  const parsed = lancamento.safeParse({ produto: 'Parafuso', quantidade: 3 })
  return <p>{parsed.success ? 'Lancamento valido' : 'Lancamento invalido'}</p>
}
`

test('an app that builds a zod schema raises no CSP violation under the Previa policy', async () => {
  const root = materialize({ 'app/src/routes/demo.tsx': ZOD_ROUTE, 'app/src/router.tsx': DEMO_ROUTER })
  try {
    assert.deepEqual(typecheck(root), { status: 0, output: '' })
    const built = build(root)
    assert.equal(built.status, 0, built.output)
    const previa = await servePrevia(join(root, 'dist'))
    const browser = await chromium.launch()
    try {
      const { page, problems, violations } = await openPage(browser, previa.origin, '/demo')
      await page.getByText('Lancamento valido').waitFor()
      assert.deepEqual(problems, [])
      assert.deepEqual(await violations(), [])
    } finally {
      await browser.close()
      previa.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the harness reports an inline style element, so a clean run above means something', async () => {
  const leak = `import { Home } from '@/routes/home'
export function Demo() {
  return <><style dangerouslySetInnerHTML={{ __html: '.leak { color: red }' }} /><Home /></>
}
`
  const root = materialize({ 'app/src/routes/demo.tsx': leak, 'app/src/router.tsx': DEMO_ROUTER })
  try {
    assert.equal(build(root).status, 0)
    const previa = await servePrevia(join(root, 'dist'))
    const browser = await chromium.launch()
    try {
      const { page, violations } = await openPage(browser, previa.origin, '/demo')
      await page.getByText('Este app ainda está vazio').waitFor()
      assert.deepEqual(await violations(), ["style-src-elem: inline"])
    } finally {
      await browser.close()
      previa.close()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the starter components take every color from a token', () => {
  const ui = join(repositoryRoot, 'apps/hub/starter-template/files/app/src')
  const raw = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\b(?:bg|text|border|fill|stroke|ring|from|to|via)-(?:black|white|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d+)\b/
  const found = []
  for (const path of readdirSync(ui, { recursive: true, encoding: 'utf8' })) {
    if (!/\.(tsx?|css)$/.test(path) || path === 'styles.css') continue
    // Recharts draws its default grid and dot strokes as #ccc and #fff; these selectors restyle them.
    const source = readFileSync(join(ui, path), 'utf8').replaceAll("[stroke='#ccc']", '').replaceAll("[stroke='#fff']", '')
    if (raw.test(source)) found.push(path)
  }
  assert.deepEqual(found, [])
  assert.equal(readFileSync(join(ui, 'styles.css'), 'utf8').includes('--chart-5:'), true)
})

test('no starter file writes an inline style element', () => {
  const ui = join(repositoryRoot, 'apps/hub/starter-template/files/app')
  const found = readdirSync(ui, { recursive: true, encoding: 'utf8' })
    .filter((path) => /\.(tsx?|html)$/.test(path) && /<style|dangerouslySetInnerHTML|\sstyle="/.test(readFileSync(join(ui, path), 'utf8')))
  assert.deepEqual(found, [])
})
