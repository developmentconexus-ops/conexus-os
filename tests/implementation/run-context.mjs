import { hubModuleUrl } from './hub-build.mjs'

export const { bindRunContext, readRunContext } = await import(hubModuleUrl('builder/run-context.js'))

// A run's context as the Hub binds it: the three ids are contract UUIDs, never a readable label.
export const RUN_CONTEXT = Object.freeze({
  builderRunId: '66666666-6666-4666-8666-666666666601',
  accountId: '22222222-2222-4222-8222-222222222222',
  conversationId: '44444444-4444-4444-8444-444444444444',
})
