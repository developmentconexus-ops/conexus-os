import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FULL_MODULES } from './allowlist.mjs'

const SHARED = {
  strict: true,
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  noEmit: true,
  skipLibCheck: true,
  isolatedModules: true,
  resolveJsonModule: true,
  forceConsistentCasingInFileNames: true,
}

/**
 * The two TypeScript projects of one checkout, as tsconfig objects. `app` is the screens: browser
 * only, with `@/` for the app's `src`. `server` is the handlers under `conexus/`: Node built-ins
 * and no DOM. They are two programs because one program cannot give `node:` to handlers and refuse
 * it to screens. Paths in the result are absolute, so the object can be written anywhere.
 */
export const typescriptProjects = ({ compilerRoot, root }) => ({
  app: {
    compilerOptions: {
      ...SHARED,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      jsx: 'react-jsx',
      types: ['vite/client'],
      typeRoots: [join(compilerRoot, 'node_modules'), join(compilerRoot, 'node_modules', '@types')],
      paths: { '@/*': [join(root, 'app', 'src', '*')] },
    },
    include: [join(root, 'app')],
  },
  server: {
    compilerOptions: {
      ...SHARED,
      lib: ['ES2022'],
      types: ['node'],
      typeRoots: [join(compilerRoot, FULL_MODULES, '@types')],
      allowImportingTsExtensions: true,
    },
    include: [join(root, 'conexus')],
  },
})

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [compilerRoot, root] = process.argv.slice(2)
  if (!compilerRoot || !root) throw new Error('USAGE: node tsconfig.mjs <compiler root> <checkout root>')
  process.stdout.write(`${JSON.stringify(typescriptProjects({ compilerRoot, root }), null, 2)}\n`)
}
