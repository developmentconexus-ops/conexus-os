import { hubModuleUrl } from './hub-build.mjs'

const { createOpenAICodexRoute } = await import(hubModuleUrl('builder/openai-codex/route.js'))

/** The model a run gets for `openai/<name>` on a ChatGPT row holding `tokens`, through the route the Hub serves it by. */
export const codexModel = (name, tokens, { current = async () => tokens } = {}) =>
  createOpenAICodexRoute({ hold: () => current })
    .take({ modelAccountId: 'row-1', kind: 'oauth', secret: JSON.stringify({ type: 'oauth', ...tokens }) })
    .model(name)
