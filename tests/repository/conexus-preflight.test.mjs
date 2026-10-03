import assert from 'node:assert/strict'
import { test } from 'node:test'

import { checkToolchain } from '../../scripts/conexus-preflight.mjs'

const pins = { node: '24.20.0', npm: '12.0.2' }
const good = { node: '24.20.0', npm: '12.0.2', platform: 'linux', execPath: '/home/a/.nvm/bin/node', pins }

test('the pinned Linux toolchain has no problems', () => {
  assert.deepEqual(checkToolchain(good), [])
})

test('each mismatch is named', () => {
  assert.deepEqual(checkToolchain({ ...good, node: '22.1.0', npm: '10.0.0' }), [
    'Node is 22.1.0, .nvmrc pins 24.20.0',
    'npm is 10.0.0, package.json engines.npm pins 12.0.2',
  ])
  assert.deepEqual(checkToolchain({ ...good, platform: 'win32', execPath: '/mnt/c/node.exe' }), [
    'Linux Node is required, this one is win32',
    'Node runs from a Windows path: /mnt/c/node.exe',
  ])
})
