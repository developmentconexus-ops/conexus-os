import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Guidance tuned against the eval cases must stay general: words from a case's answers in the
// prompt or a skill would teach the Builder the test, not the job (HQ study 31 and 61).
const ANSWER_KEY = [
  /provis[óo]rio/i, /resolvida/i, /aguardando (o )?fornecedor/i, /dia anterior/i, /conciliad/i,
  /movimenta[çc][ãa]o banc/i, /venda confirmada/i, /nota de venda/i, /vencimento antes de hoje/i,
  /valor em aberto/i, /sem juros/i, /todas as empresas/i, /somente o autor/i, /quem escreveu/i,
  /inadimpl/i, /juros/i, /multa/i,
]

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? files(path) : [path]
})

test('the Builder prompt and skills hold no words from the eval answer keys', () => {
  const guidance = ['apps/hub/src/builder/harness/prompt/builder.md', ...files('builder-skills')]
  const leaks = guidance.flatMap((path) => ANSWER_KEY.filter((word) => word.test(readFileSync(path, 'utf8'))).map((word) => `${path}: ${word}`))
  assert.deepEqual(leaks, [])
})
