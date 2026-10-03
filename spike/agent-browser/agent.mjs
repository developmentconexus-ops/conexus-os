import { writeFileSync } from 'node:fs'
import { Agent } from '@mastra/core/agent'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { Memory } from '@mastra/memory'
import { LibSQLStore } from '@mastra/libsql'
import { AuthStorage } from '@mastra/code-sdk/auth/storage'
import { opencodeClaudeMaxProvider } from '@mastra/code-sdk/providers/claude-max'
import { withSandbox, log } from './lib.mjs'
import { bootSandboxBrowser } from './setup.mjs'

const short = (v, n = 500) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…[' + s.length + ']' : s }
const authStorage = new AuthStorage(process.env.HOME + '/.local/share/mastracode/auth.json')
const model = opencodeClaudeMaxProvider('claude-haiku-4-5', { authStorage })

await withSandbox(300_000, async (e2b) => {
  const { browser, tunnel } = await bootSandboxBrowser(e2b)
  try {
    const problems = createTool({
      id: 'conexus_browser_problems',
      description: 'Console messages and uncaught page errors the app produced so far.',
      inputSchema: z.object({}),
      execute: async (_i, { agent }) => {
        const m = await browser.getManagerForThread(agent?.threadId)
        return { console: m.getConsoleMessages().slice(-20), pageErrors: m.getPageErrors().slice(-20) }
      },
    })
    const agent = new Agent({
      id: 'spike-browser-agent', name: 'spike',
      instructions: 'You test a small web app by driving a browser with your tools. Be brief. Use browser_snapshot with interactiveOnly false to read page text.',
      model, browser, memory: new Memory({ storage: new LibSQLStore({ id: 'spike', url: 'file:' + new URL('./out/spike-memory.db', import.meta.url).pathname }) }), tools: { conexus_browser_problems: problems },
    })
    const prompt = 'Open http://127.0.0.1:4173/ . Click "Add item" twice. Read the page and tell me the exact "Items:" text it shows. Then click "Break it" and tell me what error conexus_browser_problems reports. Finally take one screenshot.'
    const result = await agent.generate(prompt, { maxSteps: 14, memory: { thread: 'spike-thread-' + Date.now(), resource: 'spike' } })
    const calls = []
    for (const s of result.steps) for (const c of s.toolCalls ?? []) calls.push(c.payload?.toolName ?? c.toolName)
    log('P5 TOOL CALLS:', calls.join(' > '))
    for (const s of result.steps) for (const r of s.toolResults ?? []) { const p = r.payload ?? r; log('P5 RESULT', p.toolName, short(p.result, 300)) }
    log('P5 FINAL TEXT:', short(result.text, 1500))
    log('P5 usage', JSON.stringify(result.usage))
  } finally { try { await browser.close?.() } catch {}; tunnel.close() }
})
