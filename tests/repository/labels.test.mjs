import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { LABELS_FILE, parseLabels, planLabels } from '../../scripts/labels.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const declared = parseLabels(readFileSync(LABELS_FILE, 'utf8'))

test('labels.yml declares the lean set and the labels the Factory adds', () => {
  assert.deepEqual(declared.map(label => label.name), [
    'lane:fast', 'lane:shaped', 'lane:qualification', 'needs:aprovo', 'needs:operator', 'type:bug', 'type:change',
    'status: needs triage', 'status: auto-triaged', 'status: needs approval', 'status: pending-close',
    'status:auto-approved', 'status:changes-requested',
    'effort:low', 'effort:medium', 'effort:high', 'impact:low', 'impact:medium', 'impact:high',
    'needs-triage',
  ])
})

test('the plan creates missing labels, updates drifted ones and leaves undeclared ones alone', () => {
  const wanted = [
    { name: 'lane:fast', color: '0e8a16', description: 'fast' },
    { name: 'type:bug', color: 'd73a4a', description: 'bug' },
    { name: 'needs:operator', color: 'fbca04', description: 'operator' },
  ]
  const current = [
    { name: 'Lane:Fast', color: '0E8A16', description: 'fast' },
    { name: 'needs:operator', color: 'FBCA04', description: 'operator' },
    { name: 'bug', color: 'd73a4a', description: 'GitHub default' },
  ]
  assert.deepEqual(planLabels(wanted, current), {
    actions: [
      { kind: 'update', from: 'Lane:Fast', label: wanted[0] },
      { kind: 'create', label: wanted[1] },
    ],
    unchanged: 1,
    unmanaged: ['bug'],
  })
})

test('a label file with a bad color is refused', () => {
  assert.throws(() => parseLabels('- name: "x"\n  color: "#fff"\n  description: "d"\n'),
    { message: 'label x: color must be six lowercase hex digits' })
})

// A stand-in for `gh` that keeps labels in a JSON file, so the script runs exactly as the operator runs it.
const fakeGh = context => {
  const dir = mkdtempSync(resolve(tmpdir(), 'conexus-labels-'))
  context.after(() => rmSync(dir, { recursive: true, force: true }))
  const state = resolve(dir, 'labels.json')
  const log = resolve(dir, 'calls.log')
  writeFileSync(state, JSON.stringify([{ name: 'bug', color: 'd73a4a', description: 'GitHub default' }]))
  writeFileSync(log, '')
  writeFileSync(resolve(dir, 'gh'), `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(${JSON.stringify(log)}, args.slice(0, 2).join(' ') + '\\n')
const labels = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const fields = () => ({ name: flag('--name') ?? args[2], color: flag('--color'), description: flag('--description') })
if (args[1] === 'list') process.stdout.write(JSON.stringify(labels))
if (args[1] === 'create') labels.push(fields())
if (args[1] === 'edit') Object.assign(labels.find(label => label.name === args[2]), fields())
fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify(labels))
`)
  chmodSync(resolve(dir, 'gh'), 0o755)
  const run = (...args) => spawnSync(process.execPath, [resolve(root, 'scripts/labels.mjs'), ...args],
    { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } })
  return { run, calls: () => readFileSync(log, 'utf8').trim().split('\n') }
}

test('a dry run only reads, --apply converges, and a second run has nothing to do', context => {
  const gh = fakeGh(context)

  const dry = gh.run()
  assert.equal(dry.status, 0, dry.stderr)
  assert.deepEqual(gh.calls(), ['label list'])
  assert.match(dry.stdout, /^20 to create, 0 to update, 0 unchanged\.$/m)
  assert.match(dry.stdout, /^Not managed by labels\.yml, left alone: bug$/m)
  assert.match(dry.stdout, /^Dry run\. Run with --apply to write these changes to GitHub\.$/m)

  const applied = gh.run('--apply')
  assert.equal(applied.status, 0, applied.stderr)
  assert.equal(gh.calls().filter(call => call === 'label create').length, 20)
  assert.match(applied.stdout, /^Labels converged: a second run has nothing to do\.$/m)

  const again = gh.run()
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /^0 to create, 0 to update, 20 unchanged\.$/m)
})
