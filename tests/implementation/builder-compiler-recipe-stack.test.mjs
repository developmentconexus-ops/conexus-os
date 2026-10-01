import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { allowedPackages, packageOf } from '../../apps/hub/compiler-template/allowlist.mjs'
import { typescriptProjects } from '../../apps/hub/compiler-template/tsconfig.mjs'

const recipe = resolve(import.meta.dirname, '../../apps/hub/compiler-template')
const read = (name) => readFileSync(resolve(recipe, name), 'utf8')

test('the app stack pins exactly the packages of spec 0003, at exact versions', () => {
  assert.deepEqual(JSON.parse(read('package.json')).dependencies, {
    '@base-ui/react': '1.8.0',
    '@hookform/resolvers': '5.9.1',
    '@tailwindcss/vite': '4.3.3',
    '@tanstack/react-query': '5.102.8',
    '@tanstack/react-router': '1.170.32',
    '@tanstack/react-table': '9.2.4',
    '@types/node': '24.19.0',
    '@types/react': '19.2.18',
    '@types/react-dom': '19.2.5',
    '@vitejs/plugin-react': '6.1.1',
    'class-variance-authority': '0.7.1',
    clsx: '2.1.1',
    'date-fns': '4.4.0',
    'lucide-react': '1.47.0',
    react: '19.2.8',
    'react-day-picker': '9.14.0',
    'react-dom': '19.2.8',
    'react-hook-form': '7.89.0',
    recharts: '3.10.1',
    'tailwind-merge': '3.7.0',
    tailwindcss: '4.3.3',
    typescript: '6.0.2',
    vite: '8.2.2',
    zod: '4.6.5',
  })
})

test('the importable packages are the runtime packages, without type packages', () => {
  assert.deepEqual(allowedPackages(recipe), [
    '@base-ui/react', '@hookform/resolvers', '@tailwindcss/vite', '@tanstack/react-query', '@tanstack/react-router',
    '@tanstack/react-table', '@vitejs/plugin-react', 'class-variance-authority', 'clsx', 'date-fns', 'lucide-react',
    'react', 'react-day-picker', 'react-dom', 'react-hook-form', 'recharts', 'tailwind-merge', 'tailwindcss',
    'typescript', 'vite', 'zod',
  ])
  assert.deepEqual(
    ['react', 'react/jsx-runtime', 'react-dom/client', '@tanstack/react-query', '@base-ui/react/dialog', 'date-fns/locale', 'zod/mini', 'immer', 'node:fs', '@/lib/utils', './x', '/src/main.tsx'].map(packageOf),
    ['react', 'react', 'react-dom', '@tanstack/react-query', '@base-ui/react', 'date-fns', 'zod', 'immer', 'node:fs', null, null, null],
  )
})

test('the committed tsconfig files are the generated projects for the compile sandbox layout', () => {
  const projects = typescriptProjects({ compilerRoot: '/opt/conexus/compiler', root: '/workspace' })
  assert.deepEqual(JSON.parse(read('tsconfig.json')), projects.app)
  assert.deepEqual(JSON.parse(read('tsconfig.server.json')), projects.server)
  assert.deepEqual(projects.app.compilerOptions.paths, { '@/*': ['/workspace/app/src/*'] })
  assert.deepEqual(projects.app.compilerOptions.types, ['vite/client'])
  assert.deepEqual(projects.server.compilerOptions.types, ['node'])
})
