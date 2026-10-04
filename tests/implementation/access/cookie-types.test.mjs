import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const repository = resolve(import.meta.dirname, '../../..')
const hubConfig = resolve(repository, 'apps/hub/tsconfig.json')
const probePath = resolve(repository, 'apps/hub/src/http/cookie-probe.ts')

const diagnosticsOf = (body) => {
  const { config } = ts.readConfigFile(hubConfig, ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, resolve(repository, 'apps/hub'))
  const source = `import type { FastifyReply } from 'fastify'\nimport { setCookie } from './cookies.js'\n${body}\n`
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile
  host.getSourceFile = (path, language, ...rest) => path === probePath
    ? ts.createSourceFile(path, source, language)
    : getSourceFile.call(host, path, language, ...rest)
  const fileExists = host.fileExists
  host.fileExists = (path) => path === probePath || fileExists.call(host, path)
  const program = ts.createProgram([probePath], { ...options, noEmit: true }, host)
  return ts.getPreEmitDiagnostics(program, program.getSourceFile(probePath))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
}

test('a row-lived cookie cannot be set without its seconds, by a literal key or by a union key', () => {
  assert.deepEqual(diagnosticsOf(`export const ok = (reply: FastifyReply) => [
  setCookie(reply, 'applicationSession', 'token', 60),
  setCookie(reply, 'previewSession', 'token', 60),
  setCookie(reply, 'hubSession', 'token'),
  setCookie(reply, 'applicationSignIn', 'token'),
]`), [])
  assert.equal(diagnosticsOf(`export const literal = (reply: FastifyReply) => setCookie(reply, 'applicationSession', 'token')`).length, 1)
  assert.equal(diagnosticsOf(`export const union = (reply: FastifyReply, key: 'applicationSession' | 'hubSession') => setCookie(reply, key, 'token')`).length, 1)
  assert.equal(diagnosticsOf(`export const extra = (reply: FastifyReply) => setCookie(reply, 'hubSession', 'token', 60)`).length, 1)
})
