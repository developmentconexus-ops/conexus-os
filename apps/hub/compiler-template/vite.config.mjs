import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { allowedPackages, packageOf } from './allowlist.mjs'

const compilerRoot = dirname(fileURLToPath(import.meta.url))
// The compiler sandbox writes the application to /workspace/app. The agent's sandbox already
// holds it inside its checkout, so that flow points this at the checkout instead of copying.
const root = process.env.CONEXUS_COMPILE_ROOT ?? '/workspace/app'
const allowed = new Set(allowedPackages(compilerRoot))

// An application imports its own files, `@/`, and the packages of the compiler manifest. A bare
// specifier for anything else is refused by name, whether or not it happens to resolve.
const allowlist = {
  name: 'conexus-import-allowlist',
  enforce: 'pre',
  resolveId(id, importer) {
    if (!importer || !resolve(importer).startsWith(root + sep)) return null
    if (id.startsWith('\0') || id.startsWith('/@') || id.startsWith('virtual:')) return null
    if (/^[a-z][a-z0-9+.-]*:/i.test(id)) throw new Error(`"${id}" is not an allowed import: an app runs in the browser and has no ${id.split(':')[0]}: modules`)
    const name = packageOf(id)
    if (name === null) {
      const file = isAbsolute(id) ? id : resolve(dirname(importer), id)
      if (file.startsWith(compilerRoot + sep)) throw new Error(`"${id}" reaches into the compiler's packages; import a package by its name`)
      return null
    }
    if (!allowed.has(name)) throw new Error(`"${id}" is not an allowed import: an app may import only ${[...allowed].join(', ')}, its own files and "@/"`)
    return null
  },
}

export default {
  root,
  base: '/',
  publicDir: false,
  cacheDir: '/workspace/.vite',
  envDir: compilerRoot,
  envPrefix: 'CONEXUS_PUBLIC_',
  plugins: [allowlist, react(), tailwindcss()],
  resolve: { alias: { '@': join(root, 'src') } },
  css: { postcss: { plugins: [] } },
  build: {
    outDir: '/workspace/dist',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
  },
}
