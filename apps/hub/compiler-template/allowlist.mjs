import { lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

// The importable packages are the compiler manifest's own dependencies. `@types/*` entries type the
// runtime packages and are never a specifier an app writes.
export const allowedPackages = (compilerRoot) => Object.keys(JSON.parse(readFileSync(join(compilerRoot, 'package.json'), 'utf8')).dependencies)
  .filter((name) => !name.startsWith('@types/'))
  .sort()

/** The package a bare specifier names, or null for a relative, absolute or `@/` specifier. */
export const packageOf = (specifier) => {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/')) return null
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

// The install lands in FULL_MODULES. What an app resolves is `node_modules`, a folder of links to the
// allowed packages and their type packages only, so a package that is merely somebody's dependency
// is not there to import. Each link's real path is in FULL_MODULES, where the package finds its own
// dependencies.
export const FULL_MODULES = 'full_modules'

export const linkAllowedModules = (compilerRoot) => {
  const full = join(compilerRoot, FULL_MODULES)
  const view = join(compilerRoot, 'node_modules')
  const manifest = JSON.parse(readFileSync(join(compilerRoot, 'package.json'), 'utf8'))
  // @types/node types the handlers' `node:` imports (the server project reads it from FULL_MODULES);
  // linked into the app's view it would make `node:` importable from a screen.
  const links = Object.keys(manifest.dependencies).filter((name) => name !== '@types/node')
  for (const name of links.sort()) {
    const target = join(full, name)
    lstatSync(target)
    const link = join(view, name)
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(relative(dirname(link), target), link)
  }
  return readdirSync(view).sort()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== 'link' || !process.argv[3]) throw new Error('USAGE: node allowlist.mjs link <compiler root>')
  linkAllowedModules(process.argv[3])
}
