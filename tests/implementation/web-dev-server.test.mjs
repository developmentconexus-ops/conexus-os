import assert from 'node:assert/strict'
import test from 'node:test'
import { launchWebBrowser, startWebServer } from './web-dev-server.mjs'

const failingListen = () => {
  const closed = []
  return {
    closed,
    createServer: async () => ({
      listen: async () => { throw new Error('listen failed') },
      close: async () => { closed.push('vite') },
    }),
  }
}

test('a Vite server whose listen rejects is still closed by the test that started it', async () => {
  const vite = failingListen()
  const cleanups = []
  await assert.rejects(startWebServer({ after: (cleanup) => cleanups.push(cleanup) }, {}, vite), /listen failed/)
  assert.equal(cleanups.length, 1)
  await cleanups[0]()
  assert.deepEqual(vite.closed, ['vite'])
})

test('a shared browser whose Vite server cannot listen closes the server and launches nothing', async () => {
  const vite = failingListen()
  const launched = []
  await assert.rejects(launchWebBrowser({}, { ...vite, launch: async () => { launched.push('chromium') } }), /listen failed/)
  assert.deepEqual(vite.closed, ['vite'])
  assert.deepEqual(launched, [])
})

test('a shared browser whose Chromium cannot launch closes the Vite server that already listens', async () => {
  const closed = []
  const deps = {
    createServer: async () => ({ listen: async () => {}, httpServer: { address: () => ({ port: 1 }) }, close: async () => { closed.push('vite') } }),
    launch: async () => { throw new Error('launch failed') },
  }
  await assert.rejects(launchWebBrowser({}, deps), /launch failed/)
  assert.deepEqual(closed, ['vite'])
})
