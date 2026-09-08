import assert from 'node:assert/strict'
import test from 'node:test'
import { Sandbox } from 'e2b'

import { readBuilderE2BApiKey } from '../../scripts/rb-builder-e2b-template.mjs'

const live = process.env.CONEXUS_RB_E2B_LIVE === 'true'
const httpsProbe = `node -e "const https=require('node:https');let done=false;const finish=x=>{if(done)return;done=true;console.log(x);process.exit(0)};const r=https.get({host:'1.1.1.1',servername:'one.one.one.one',path:'/',timeout:8000},res=>{res.resume();finish('REACHED_HTTP:'+res.statusCode)});r.on('timeout',()=>{r.destroy();finish('BLOCKED_TIMEOUT')});r.on('error',e=>finish('BLOCKED_ERROR:'+e.code));setTimeout(()=>{r.destroy();finish('BLOCKED_DEADLINE')},10000)"`

const createSandbox = (apiKey, templateRef, label, network) => Sandbox.create(templateRef, {
  apiKey,
  timeoutMs: 2 * 60_000,
  envs: {},
  metadata: { 'conexus-proof': `rb-builder-live-${label}` },
  lifecycle: { onTimeout: 'kill' },
  ...network,
})

test('RB exact E2B template enforces mechanics, empty guest credentials and real egress denial', { skip: live ? false : 'requires explicit CONEXUS_RB_E2B_LIVE=true authority and E2B configuration' }, async () => {
  const templateRef = process.env.CONEXUS_BUILDER_E2B_TEMPLATE_ID
  if (!templateRef || !/^[a-z0-9]+:build-[0-9a-f-]{36}$/.test(templateRef)) {
    throw new Error('CONEXUS_BUILDER_E2B_TEMPLATE_ID_REFUSED')
  }
  const apiKey = readBuilderE2BApiKey(process.env.CONEXUS_BUILDER_E2B_API_KEY_FILE)
  let blocked
  let allowed
  try {
    blocked = await createSandbox(apiKey, templateRef, 'blocked', {
      allowInternetAccess: false,
      network: { denyOut: ({ allTraffic }) => [allTraffic] },
    })
    const info = await Sandbox.getInfo(blocked.sandboxId, { apiKey })
    assert.equal(info.allowInternetAccess, false)
    assert.deepEqual(info.network?.denyOut, ['0.0.0.0/0'])

    const mechanics = await blocked.commands.run([
      'set -eu',
      'test "$(node --version)" = v24.20.0',
      'git --version',
      'test "$(pwd)" = /workspace',
      'printf governed > /workspace/probe',
      'test "$(cat /workspace/probe)" = governed',
    ].join('; '), { cwd: '/workspace', timeoutMs: 60_000, envs: {} })
    assert.equal(mechanics.exitCode, 0)
    assert.match(mechanics.stdout, /git version 2\.39\.5/)

    const environmentCensus = await blocked.commands.run("env | cut -d= -f1 | grep -E '^(ANTHROPIC|OPENAI|E2B|CONEXUS|DATABASE|PG|.*PASSWORD|.*SECRET|.*TOKEN|.*API_KEY)' | sort || true", {
      cwd: '/workspace', timeoutMs: 30_000, envs: {},
    })
    assert.deepEqual(environmentCensus.stdout.trim().split('\n'), [
      'E2B_EVENTS_ADDRESS',
      'E2B_SANDBOX',
      'E2B_SANDBOX_ID',
      'E2B_TEMPLATE_ID',
    ])

    const blockedProbe = await blocked.commands.run(httpsProbe, { cwd: '/workspace', timeoutMs: 30_000, envs: {} })
    assert.match(blockedProbe.stdout.trim(), /^BLOCKED_(ERROR|TIMEOUT|DEADLINE)/)

    allowed = await createSandbox(apiKey, templateRef, 'allowed-control', { allowInternetAccess: true })
    const allowedProbe = await allowed.commands.run(httpsProbe, { cwd: '/workspace', timeoutMs: 30_000, envs: {} })
    assert.match(allowedProbe.stdout.trim(), /^REACHED_HTTP:[1-5][0-9]{2}$/)
  } finally {
    await Promise.all([
      blocked?.kill().catch(() => undefined),
      allowed?.kill().catch(() => undefined),
    ])
  }
})
