import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Regenerates the curated shadcn components of the app starter (spec 0003, Starter components).
// It needs the network: the shadcn CLI reads its registry from ui.shadcn.com. Run it only to move
// the pin; the committed files are what the starter ships.
export const SHADCN_CLI_VERSION = '4.21.0'
export const SHADCN_STYLE = 'base-nova'
export const STARTER_COMPONENTS = Object.freeze([
  'button', 'card', 'input', 'label', 'textarea', 'select', 'checkbox', 'switch', 'radio-group', 'field',
  'dialog', 'alert-dialog', 'sheet', 'dropdown-menu', 'popover', 'tooltip', 'tabs', 'table', 'badge',
  'skeleton', 'separator', 'empty', 'alert', 'spinner', 'pagination', 'breadcrumb', 'calendar', 'toast',
  'sidebar', 'chart',
])

const repositoryRoot = resolve(import.meta.dirname, '..')
const target = resolve(repositoryRoot, 'apps/hub/starter-template/files/app/src')

const HEADER = `/*
 * shadcn/ui (https://github.com/shadcn-ui/ui), MIT License, Copyright (c) 2023 shadcn.
 * Generated with shadcn ${SHADCN_CLI_VERSION}, style "${SHADCN_STYLE}". The license text is in LICENSE-shadcn-ui.txt.
 */
`

const replaceOnce = (source, from, to, file) => {
  if (!source.includes(from)) throw new Error(`STARTER_COMPONENT_PATCH_MISSED ${file}: ${from.slice(0, 60)}`)
  return source.replace(from, to)
}

// The registry imports `cn` as a package; the app has it in lib/utils.
const importLocalUtils = (source) => source.replaceAll('from "cn"', 'from "@/lib/utils"')

// The Prévia's style-src 'self' blocks an inline style element. The series colors become custom
// properties on the container's own style, which React sets through the CSSOM.
const makeChartCspSafe = (source, file) => {
  const start = source.indexOf('const ChartStyle = ')
  const end = source.indexOf('const ChartTooltip = ')
  if (start < 0 || end < 0) throw new Error(`STARTER_COMPONENT_PATCH_MISSED ${file}: ChartStyle`)
  let patched = `${source.slice(0, start)}// The color of each series, as custom properties for the container's own \`style\`. React sets them
// through the CSSOM, which the Prévia's \`style-src 'self'\` allows. shadcn's original wrote them in an
// inline style element, which it blocks.
const chartColors = (config: ChartConfig): React.CSSProperties =>
  Object.fromEntries(
    Object.entries(config).flatMap(([key, item]) => {
      const color = item.color ?? item.theme?.light
      return color ? [[\`--color-\${key}\`, color]] : []
    })
  )

${source.slice(end)}`
  patched = replaceOnce(patched, '  ChartStyle,\n', '', file)
  patched = replaceOnce(patched, '        <ChartStyle id={chartId} config={config} />\n', '', file)
  patched = replaceOnce(patched, '  initialDimension = INITIAL_DIMENSION,\n  ...props\n}', '  initialDimension = INITIAL_DIMENSION,\n  style,\n  ...props\n}', file)
  return replaceOnce(patched, '        {...props}\n      >\n        <RechartsPrimitive.ResponsiveContainer', '        style={{ ...chartColors(config), ...style }}\n        {...props}\n      >\n        <RechartsPrimitive.ResponsiveContainer', file)
}

const run = () => {
  const work = mkdtempSync(join(tmpdir(), 'conexus-shadcn-'))
  try {
    mkdirSync(join(work, 'src/lib'), { recursive: true })
    writeFileSync(join(work, 'package.json'), '{ "name": "shadcn-gen", "private": true, "type": "module" }\n')
    writeFileSync(join(work, 'tsconfig.json'), '{ "compilerOptions": { "jsx": "react-jsx", "paths": { "@/*": ["./src/*"] } } }\n')
    writeFileSync(join(work, 'src/styles.css'), '@import "tailwindcss";\n')
    writeFileSync(join(work, 'components.json'), `${JSON.stringify({
      $schema: 'https://ui.shadcn.com/schema.json',
      style: SHADCN_STYLE,
      rsc: false,
      tsx: true,
      tailwind: { config: '', css: 'src/styles.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
      iconLibrary: 'lucide',
      aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks' },
    }, null, 2)}\n`)
    const added = spawnSync('npx', ['--yes', `shadcn@${SHADCN_CLI_VERSION}`, 'add', ...STARTER_COMPONENTS, '--yes', '--cwd', work], { encoding: 'utf8' })
    if (added.status !== 0) throw new Error(`STARTER_COMPONENTS_CLI_FAILED\n${added.stdout}\n${added.stderr}`)

    for (const [directory, extension] of [['components/ui', '.tsx'], ['hooks', '.ts']]) {
      mkdirSync(join(target, directory), { recursive: true })
      for (const name of readdirSync(join(target, directory))) if (name.endsWith(extension)) rmSync(join(target, directory, name))
      for (const name of readdirSync(join(work, 'src', directory)).sort()) {
        if (!name.endsWith(extension)) continue
        // shadcn's overlays use the raw color `bg-black`; the starter takes every color from a token.
        let source = importLocalUtils(readFileSync(join(work, 'src', directory, name), 'utf8')).replaceAll('bg-black', 'bg-scrim')
        if (name === 'chart.tsx') source = makeChartCspSafe(source, name)
        writeFileSync(join(target, directory, name), `${HEADER}${source}`)
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) run()
