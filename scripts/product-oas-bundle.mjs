import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')

export function bundledProductOas() {
  if (process.env.CONEXUS_PRODUCT_OAS_BUNDLE) return JSON.parse(readFileSync(process.env.CONEXUS_PRODUCT_OAS_BUNDLE, 'utf8'))
  const directory = mkdtempSync(resolve(tmpdir(), 'conexus-product-oas-'))
  try {
    const output = resolve(directory, 'bundle.json')
    const cli = resolve(repositoryRoot, 'node_modules/@redocly/cli/bin/cli.js')
    const bundled = spawnSync(process.execPath, [cli, 'bundle', 'contracts/api/product/openapi.yaml', '--output', output, '--ext', 'json'], { cwd: repositoryRoot, encoding: 'utf8' })
    if (bundled.status !== 0) throw new Error(`the Product OAS did not bundle:\n${bundled.stderr}${bundled.stdout}`)
    return JSON.parse(readFileSync(output, 'utf8'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
