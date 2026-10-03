import { listMine, log } from './lib.mjs'
const all = await listMine()
log('ALL SANDBOXES IN ACCOUNT (any state):', all.length, JSON.stringify(all.map((s) => ({ id: s.sandboxId, state: s.state, template: s.templateId, meta: Object.keys(s.metadata ?? {}) }))))
