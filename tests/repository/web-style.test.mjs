import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const check = candidateRoot => spawnSync(process.execPath, [resolve(root, 'scripts/check-web-style.mjs'), candidateRoot], { encoding: 'utf8' })

const tree = (context, files) => {
  const target = mkdtempSync(resolve(tmpdir(), 'conexus-web-style-'))
  context.after(() => rmSync(target, { recursive: true, force: true }))
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(target, path)), { recursive: true })
    writeFileSync(resolve(target, path), contents)
  }
  return target
}

test('the repository tree passes', () => {
  const result = check(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Web style check passed \(files=\d+\)\.\n$/)
})

test('a raw hex color outside the token file fails with its location', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.css': '.a { width: 12px; }\n.b { color: #C0FFEE; }\n',
    'packages/brand/src/tokens.css': ':root { --cx-canvas: #F6F7F8; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.css:2: raw hex color #C0FFEE; use a var(--cx-*) token from packages/brand/src/tokens.css\n')
})

test('a var(--cx-*) the brand does not define fails with its location', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.css': '.a { color: var(--cx-text); }\n.b { color: var(--cx-texxt); }\n',
    'packages/brand/src/tokens.css': ':root { --cx-text: #121518; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.css:2: uses undefined token --cx-texxt; define it in packages/brand/src/tokens.css or where it is used\n')
})

test('a font outside the three brand faces fails, in CSS and in TSX', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.css': [
      '.ok { font: 600 .8125rem/1 var(--cx-font-body); font-family: "JetBrains Mono", ui-monospace, monospace; }',
      '.inherit { font: inherit; font-family: inherit; }',
      '.bad { font-family: Arial, sans-serif; }',
      '.shorthand { font: 600 1rem/1.2 "Inter", system-ui; }',
      '',
    ].join('\n'),
    'apps/keycloak-theme/src/page.tsx': "export const Page = () => <p style={{ fontFamily: 'Comic Sans MS', color: '#fff' }} />\n",
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, [
    'apps/keycloak-theme/src/page.tsx:1: raw hex color #fff; use a var(--cx-*) token from packages/brand/src/tokens.css',
    'apps/keycloak-theme/src/page.tsx:1: font family Comic Sans MS is not a brand font; use var(--cx-font-display|body|mono)',
    'apps/web/src/screen.css:3: font family Arial is not a brand font; use var(--cx-font-display|body|mono)',
    'apps/web/src/screen.css:3: font family sans-serif is not a brand font; use var(--cx-font-display|body|mono)',
    'apps/web/src/screen.css:4: font family "Inter" is not a brand font; use var(--cx-font-display|body|mono)',
    '',
  ].join('\n'))
})

test('a tree without the web app refuses to pass on zero files', context => {
  const result = check(tree(context, { 'README.md': '# empty\n' }))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^no files scanned: apps\/web\/src does not exist under /)
})

test('a Conexus class with no CSS rule fails with its location', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "export const Screen = () => <div className=\"cx-panel cx-panel--missing\" />\n",
    'apps/web/src/screen.css': '.cx-panel { padding: 1rem; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.tsx:1: class "cx-panel--missing" has no CSS rule under apps/web/src or packages/brand/src\n')
})

test('a Conexus class defined in every checked root passes', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "export const Screen = () => <div className=\"cx-panel cx-mark\" />\n",
    'apps/web/src/screen.css': '.cx-panel { padding: 1rem; }\n',
    'packages/brand/src/tokens.css': '.cx-mark { width: 1rem; }\n',
  }))
  assert.equal(result.status, 0, result.stderr)
})

test('mastra-theme.css must re-point every Mastra color variable to a brand token', context => {
  const names = [...[50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(step => `--brand-green-${step}`), '--accent1', '--positive1', '--notice-success', '--badge-green', '--color-emerald-400']
  const css = name => `${name}: var(--cx-brand);\n`
  const tree1 = tree(context, {
    'packages/brand/src/tokens.css': ':root { --cx-brand: #123456; }\n',
    'apps/web/src/mastra-theme.css': `:root {\n${names.filter(name => name !== '--accent1').map(css).join('')}  --accent1: green;\n}\n`,
  })
  const result = check(tree1)
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/mastra-theme.css:1: --accent1 is not re-pointed to a --cx-* token\n')
  const whole = check(tree(context, {
    'packages/brand/src/tokens.css': ':root { --cx-brand: #123456; }\n',
    'apps/web/src/mastra-theme.css': `:root {\n${names.map(css).join('')}}\n`,
  }))
  assert.equal(whole.status, 0, whole.stderr)
})

test('a class built from a template literal fails and says to use a literal class map', context => {
  const result = check(tree(context, {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this fixture's own source is a literal ${tone} for the script to parse, not a JS interpolation
    'apps/web/src/screen.tsx': "export const Screen = ({ tone }) => <div className={`cx-row cx-row-${tone}`} />\n",
    'apps/web/src/screen.css': '.cx-row { display: flex; }\n',
  }))
  assert.equal(result.status, 1)
  // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the script's own literal ${tone} error text
  assert.equal(result.stderr, 'apps/web/src/screen.tsx:1: class "cx-row-${tone}" is built dynamically; map each value to a literal class name\n')
})

test('a class map counts its classes as used and fails when one has no CSS rule', context => {
  const result = check(tree(context, {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: this fixture's own source is a literal ${SIDE_CLASS[side]} for the script to parse, not a JS interpolation
    'apps/web/src/screen.tsx': "const SIDE_CLASS = { add: 'cx-dt-add', del: 'cx-dt-del' } as const\nexport const Cell = ({ side }) => <td className={`cx-dt-n ${SIDE_CLASS[side]}`} />\n",
    'apps/web/src/screen.css': '.cx-dt-n { padding: 0; }\n.cx-dt-add { color: green; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.tsx:1: class "cx-dt-del" has no CSS rule under apps/web/src or packages/brand/src\n')
})

test('a class map keeps a defined rule from being reported as unused', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "const SIDE_CLASS = { add: 'cx-dt-add' } as const\nexport const Cell = ({ side }) => <td className={SIDE_CLASS[side]} />\n",
    'apps/web/src/screen.css': '.cx-dt-add { color: green; }\n',
  }))
  assert.equal(result.status, 0, result.stderr)
})

test('a class defined in CSS with no .tsx use fails and names the rule', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': "export const Screen = () => <div className=\"cx-panel\" />\n",
    'apps/web/src/screen.css': '.cx-panel { padding: 1rem; }\n.cx-panel-unused { padding: 0; }\n',
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.css:2: class "cx-panel-unused" is defined in CSS but no TSX under apps/web/src or packages/brand/src uses it\n')
})

test('a native title hint fails on an element and on a dotted component, and names the Tooltip to use', context => {
  const result = check(tree(context, {
    'apps/web/src/chip.tsx': [
      'export const Chip = () => <button type="button" aria-label="Modo" title="Modo: Planejar" />',
      'export const Menu = () => <DropdownMenu.Trigger title="Modo" aria-label="Modo" />',
      '',
    ].join('\n'),
  }))
  const hint = "native title hint; use the design system Tooltip (import { Tooltip, TooltipContent, TooltipTrigger } from '@mastra/playground-ui/components/Tooltip') and keep the aria-label on an icon-only control"
  assert.equal(result.status, 1)
  assert.equal(result.stderr, `apps/web/src/chip.tsx:1: <button title=...>: ${hint}\napps/web/src/chip.tsx:2: <DropdownMenu.Trigger title=...>: ${hint}\n`)
})

test('a title prop that renders a heading, and an iframe title, pass', context => {
  const result = check(tree(context, {
    'apps/web/src/screen.tsx': [
      'export const Screen = () => <PageHeader title="Minha conta" />',
      'export const Frame = () => <iframe title="Prévia do aplicativo" src="about:blank" />',
      '',
    ].join('\n'),
  }))
  assert.equal(result.status, 0, result.stderr)
})

test('the CSRF cookie is read only by app/http.ts; a hand reader elsewhere fails, a generated client passes', context => {
  const reader = "const csrf = () => document.cookie.split('; ').find((item) => item.startsWith('__Host-conexus_csrf='))\n"
  const result = check(tree(context, {
    'apps/web/src/app/http.ts': reader,
    'apps/web/src/generated/iam-client.ts': reader,
    'apps/web/src/features/builder/api.ts': `export const a = 1\n${reader}`,
  }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/features/builder/api.ts:2: reads the CSRF cookie by hand; call hubFetch from apps/web/src/app/http.ts\n')
})

const screen = (classes, extra = {}) => ({
  'apps/web/src/styles.css': '@tailwind utilities;\n@theme { --color-brand: red; --breakpoint-2xl: 96rem; }\n',
  'apps/web/src/local.css': '.local { margin: 0; }\n',
  'node_modules/@mastra/playground-ui/dist/Slot.css': '.composer-slot { margin: 0; }\n.hover\\:vendor-util:hover { margin: 0; }\n',
  'apps/web/src/screen.tsx': `export const Screen = () => <div className="${classes}" />\n`,
  ...extra,
})

test('a class that is not a Conexus one passes when this app CSS, the Mastra package or the Tailwind build defines it', context => {
  const result = check(tree(context, screen('local composer-slot hover:vendor-util text-brand flex')))
  assert.equal(result.status, 0, result.stderr)
})

test('a class with no rule anywhere fails with its location, a typo included', context => {
  const result = check(tree(context, screen('local text-nope')))
  assert.equal(result.status, 1)
  assert.equal(result.stderr, 'apps/web/src/screen.tsx:1: class "text-nope" has no rule: not in this app\'s CSS, in node_modules/@mastra/playground-ui/dist or from the Tailwind build; use a cx- class\n')
})

test('a string a className compares with is a value, not a class', context => {
  const result = check(tree(context, screen('local', {
    'apps/web/src/screen.tsx': "export const Screen = ({ tag }: { tag: string }) => <div className={tag === 'plus' ? 'local' : undefined} />\n",
  })))
  assert.equal(result.status, 0, result.stderr)
})

test('a class that is only the start of a defined class fails, whichever file defines the longer one', context => {
  const result = check(tree(context, screen('shell-fram', {
    'apps/web/src/styles.css': '@tailwind utilities;\n.shell-frame { margin: 0; }\n',
    'apps/web/src/local.css': '.local { margin: 0; }\n',
  })))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^apps\/web\/src\/screen\.tsx:1: class "shell-fram" has no rule/)
})

test('a Tailwind utility whose escaped selector starts with a digit passes, and an unknown utility fails', context => {
  assert.equal(check(tree(context, screen('2xl:flex flex'))).status, 0)
  const result = check(tree(context, screen('2xl:flux')))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /class "2xl:flux" has no rule/)
})

const withClassName = (expression) => screen('local', { 'apps/web/src/screen.tsx': `export const Screen = ({ x, kind, state }: Props) => <div className={${expression}} />\n` })

test('values inside a condition, a call or an array are not classes', context => {
  assert.equal(check(tree(context, withClassName("isOpen('open-now') ? 'local' : undefined"))).status, 0)
  assert.equal(check(tree(context, withClassName("['open', kind].includes(state) ? 'local' : ''"))).status, 0)
})

test('an unknown class in a branch of a ternary fails, and a known one passes', context => {
  assert.equal(check(tree(context, withClassName("x ? 'local' : 'text-brand'"))).status, 0)
  const result = check(tree(context, withClassName("x ? 'local' : 'text-nope'")))
  assert.equal(result.status, 1)
  assert.match(result.stderr, /class "text-nope" has no rule/)
})

test('a class named only inside :nth-child(... of .class) counts as defined', context => {
  const result = check(tree(context, screen('local picked', {
    'apps/web/src/local.css': '.local { margin: 0; }\nli:nth-child(2n of .picked) { margin: 0; }\n',
  })))
  assert.equal(result.status, 0, result.stderr)
})
