import assert from 'node:assert/strict'
import test from 'node:test'
import { hubModuleUrl } from './hub-build.mjs'

const { classifyAppPath } = await import(hubModuleUrl('hosting/application-path.js'))

const DECLARED = new Set(['index.html', 'assets/app.js', 'LICENSE', 'conexus-server/manifest.json'])
const declared = (path) => DECLARED.has(path)
const classify = (pathname, method = 'GET', has = declared) => classifyAppPath(method, pathname, has)

const FILE = (path) => ({ kind: 'file', path })
const SHELL = { kind: 'app-shell' }
const NOT_FOUND = { kind: 'not-found' }

test('the root and a declared file are that file', () => {
  assert.deepEqual(classify('/'), FILE('index.html'))
  assert.deepEqual(classify('/index.html'), FILE('index.html'))
  assert.deepEqual(classify('/assets/app.js'), FILE('assets/app.js'))
  assert.deepEqual(classify('/LICENSE'), FILE('LICENSE'))
})

test('a path with no declared file and no dot in its last segment is the app shell', () => {
  assert.deepEqual(classify('/notas'), SHELL)
  assert.deepEqual(classify('/notas/42'), SHELL)
  assert.deepEqual(classify('/v1.2/notas'), SHELL)
  assert.deepEqual(classify('/assets'), SHELL)
})

test('a trailing slash is the same path', () => {
  assert.deepEqual(classify('/notas/'), SHELL)
  assert.deepEqual(classify('/assets/app.js/'), FILE('assets/app.js'))
  assert.deepEqual(classify('/x.js/'), NOT_FOUND)
})

test('a last segment with a dot and no declared file stays not found', () => {
  assert.deepEqual(classify('/x.js'), NOT_FOUND)
  assert.deepEqual(classify('/assets/missing.css'), NOT_FOUND)
  assert.deepEqual(classify('/notas.json'), NOT_FOUND)
  assert.deepEqual(classify('/.hidden'), NOT_FOUND)
})

test('the server tree and the platform prefix never fall back and never serve', () => {
  assert.deepEqual(classify('/conexus-server/manifest.json'), NOT_FOUND)
  assert.deepEqual(classify('/conexus-server/handlers/notas'), NOT_FOUND)
  assert.deepEqual(classify('/conexus-server/'), NOT_FOUND)
  assert.deepEqual(classify('/conexus-server'), NOT_FOUND)
  assert.deepEqual(classify('/__conexus/api/notas'), NOT_FOUND)
  assert.deepEqual(classify('/__conexus'), NOT_FOUND)
  assert.deepEqual(classify('/%5F%5Fconexus/api/notas'), NOT_FOUND)
  assert.deepEqual(classify('/conexus%2Dserver/manifest.json'), NOT_FOUND)
})

test('percent encoding is decoded before the decision', () => {
  assert.deepEqual(classify('/assets%2Fapp.js'), FILE('assets/app.js'))
  assert.deepEqual(classify('/notas%20fiscais'), SHELL)
  assert.deepEqual(classify('/relat%C3%B3rio'), SHELL)
  assert.deepEqual(classify('/x%2Ejs'), NOT_FOUND)
})

test('traversal, a null byte, a backslash, an empty segment and bad encoding are refused after decoding', () => {
  for (const pathname of ['/../etc/passwd', '/%2e%2e/secret', '/a/%2E%2E/b', '/a/./b', '/notas%00', '/a%5Cb', '/a//b', '//notas', '/%E0%A4%A', '/%']) {
    assert.deepEqual(classify(pathname), NOT_FOUND, pathname)
  }
})

test('GET and HEAD are classified alike and any other method is not found', () => {
  assert.deepEqual(classify('/notas', 'HEAD'), SHELL)
  assert.deepEqual(classify('/assets/app.js', 'HEAD'), FILE('assets/app.js'))
  assert.deepEqual(classify('/x.js', 'HEAD'), NOT_FOUND)
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.deepEqual(classify('/notas', method), NOT_FOUND, method)
})

test('a caller that cannot know the declared files asks once as if all were declared and once as if none were', () => {
  const every = () => true
  const none = () => false
  assert.deepEqual(classify('/notas', 'GET', every), FILE('notas'))
  assert.deepEqual(classify('/notas', 'GET', none), SHELL)
  assert.deepEqual(classify('/x.js', 'GET', every), FILE('x.js'))
  assert.deepEqual(classify('/x.js', 'GET', none), NOT_FOUND)
  assert.deepEqual(classify('/conexus-server/manifest.json', 'GET', every), NOT_FOUND)
})
