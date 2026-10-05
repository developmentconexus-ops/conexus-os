
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const PROJECT = '33333333-3333-4333-8333-333333333333'
const WORKSPACE = '44444444-4444-4444-8444-444444444444'
const OTHER = '55555555-5555-4555-8555-555555555555'
const CONVERSATION = '77777777-7777-4777-8777-777777777777'
const LOGIN = '88888888-8888-4888-8888-888888888888'
const REVISION = 'a'.repeat(40)
const C = '/api/control'
const W = `${C}/workspaces/${WORKSPACE}`
const P = `${C}/projects/${PROJECT}`
const A = `${C}/model-accounts`
const M = '/api/builder/agent-controller/conexus-builder/sessions'
const R = `${M}/project:${PROJECT}`
const SCOPE = `sessionScope=conversation:${CONVERSATION}`
const HANDOFF = 'h'.repeat(43)

export const LEDGER = Object.freeze([
  { listener: 'hub', method: 'GET', url: '/protocol/oidc/login', kind: 'sign-in', body: 'NONE', sample: { path: '/protocol/oidc/login' }, withoutCredential: { status: 302, location: 'https://issuer.test/auth' } },
  { listener: 'hub', method: 'GET', url: '/protocol/oidc/callback', kind: 'sign-in', body: 'NONE', sample: { path: '/protocol/oidc/callback?state=walk&code=walk' }, withoutCredential: { status: 400 } },
  { listener: 'hub', method: 'GET', url: `${C}/access-context`, kind: 'session', body: 'NONE', sample: { path: `${C}/access-context` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: '/api/session', kind: 'sign-out', body: 'NONE', sample: { path: '/api/session' }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/accounts`, kind: 'bootstrap', body: 'JSON', sample: { path: `${C}/accounts`, body: { displayName: 'Walker' } }, withoutCredential: { status: 401, code: 'BOOTSTRAP_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/workspaces/:workspaceId/members`, kind: 'session', body: 'NONE', sample: { path: `${W}/members` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/workspaces/:workspaceId/invitations`, kind: 'session', body: 'JSON', sample: { path: `${W}/invitations`, body: { email: 'walker@example.test', role: 'member' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'PUT', url: `${C}/workspaces/:workspaceId/members/:accountId`, kind: 'session', body: 'JSON', sample: { path: `${W}/members/${ACCOUNT}`, body: { role: 'member' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: `${C}/workspaces/:workspaceId/roster/:entryKind/:entryId`, kind: 'session', body: 'NONE', sample: { path: `${W}/roster/member/${ACCOUNT}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/application-access`, kind: 'session', body: 'NONE', sample: { path: `${P}/application-access` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/projects/:projectId/application-access`, kind: 'session', body: 'JSON', sample: { path: `${P}/application-access`, body: { email: 'walker@example.test' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: `${C}/projects/:projectId/application-access/:entryKind/:entryId`, kind: 'session', body: 'NONE', sample: { path: `${P}/application-access/invitation/${OTHER}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/installation`, kind: 'session', body: 'NONE', sample: { path: `${C}/installation` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/installation/administrators`, kind: 'session', body: 'NONE', sample: { path: `${C}/installation/administrators` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/installation/administrators`, kind: 'session', body: 'JSON', sample: { path: `${C}/installation/administrators`, body: { email: 'walker@example.test' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: `${C}/installation/administrators/:accountId`, kind: 'session', body: 'NONE', sample: { path: `${C}/installation/administrators/${ACCOUNT}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/workspaces`, kind: 'session', operation: 'WS-01', body: 'JSON', sample: { path: `${C}/workspaces`, body: { name: 'Walk' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/workspaces/:workspaceId/projects`, kind: 'session', operation: 'PRJ-01', body: 'NONE', sample: { path: `${W}/projects` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/workspaces/:workspaceId/projects`, kind: 'session', operation: 'PRJ-03', body: 'JSON', sample: { path: `${W}/projects`, body: { name: 'Walk', sourceBootstrap: { mode: 'NEW' } } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId`, kind: 'session', operation: 'PRJ-02', body: 'NONE', sample: { path: P }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: `${C}/projects/:projectId`, kind: 'session', operation: 'PRJ-04', body: 'NONE', sample: { path: `${P}?confirmName=Walk` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/workspaces/:workspaceId/project-summaries`, kind: 'session', operation: 'PRJ-SUMMARIES', body: 'NONE', sample: { path: `${W}/project-summaries` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/thumbnail`, kind: 'session', operation: 'PRJ-THUMBNAIL', body: 'NONE', sample: { path: `${P}/thumbnail` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/builder-session`, kind: 'session', operation: 'BLD-23', body: 'NONE', sample: { path: `${P}/builder-session` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/projects/:projectId/builder-session/messages`, kind: 'session', operation: 'BLD-24', body: 'JSON', sample: { path: `${P}/builder-session/messages`, body: { content: 'oi', conversationId: CONVERSATION } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/projects/:projectId/builder-session/runs/:builderRunId/cancel`, kind: 'session', operation: 'BLD-25', body: 'JSON', sample: { path: `${P}/builder-session/runs/${OTHER}/cancel`, body: {} }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/builder-session/runs/:builderRunId/trace`, kind: 'session', operation: 'BLD-26', body: 'NONE', sample: { path: `${P}/builder-session/runs/${OTHER}/trace` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/projects/:projectId/builder-session/preview`, kind: 'session', operation: 'BLD-30', body: 'JSON', sample: { path: `${P}/builder-session/preview`, body: {} }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/source/tree`, kind: 'session', operation: 'BLD-08', body: 'NONE', sample: { path: `${P}/source/tree?sourceRevision=${REVISION}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/source/file`, kind: 'session', operation: 'BLD-09', body: 'NONE', sample: { path: `${P}/source/file?sourceRevision=${REVISION}&path=index.html` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/source/compare`, kind: 'session', operation: 'BLD-29', body: 'NONE', sample: { path: `${P}/source/compare?baseSourceRevision=${REVISION}&resultSourceRevision=${'b'.repeat(40)}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: '/api/builder/agent-controller/:controllerId/sessions', kind: 'session', body: 'JSON', sample: { path: M, body: { resourceId: `project:${PROJECT}`, sessionScope: `conversation:${CONVERSATION}`, threadId: CONVERSATION } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId', kind: 'session', body: 'NONE', sample: { path: `${R}?${SCOPE}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/threads', kind: 'session', body: 'NONE', sample: { path: `${R}/threads` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/stream', kind: 'session', body: 'NONE', sample: { path: `${R}/stream?${SCOPE}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/threads/:threadId/messages', kind: 'session', body: 'NONE', sample: { path: `${R}/threads/${CONVERSATION}/messages` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/abort', kind: 'session', body: 'NONE', sample: { path: `${R}/abort?${SCOPE}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' }, guardAnswers: { code: 'BUILDER_RUN_STOP_REFUSED' } },
  { listener: 'hub', method: 'POST', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/model', kind: 'session', body: 'JSON', sample: { path: `${R}/model?${SCOPE}`, body: { modelId: 'anthropic/claude-sonnet-4-5' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/tool-suspension', kind: 'session', body: 'JSON', sample: { path: `${R}/tool-suspension?${SCOPE}`, body: { toolCallId: 'call-1', resumeData: { answer: 'sim' } } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' }, guardAnswers: { call: 'mount.answerQuestion' } },
  { listener: 'hub', method: 'PUT', url: '/api/builder/agent-controller/:controllerId/sessions/:resourceId/state', kind: 'session', body: 'JSON', sample: { path: `${R}/state?${SCOPE}`, body: { state: { thinkingLevel: 'low' } } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${A}/models`, kind: 'session', body: 'NONE', sample: { path: `${A}/models` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: A, kind: 'session', body: 'NONE', sample: { path: A }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'PUT', url: `${A}/:provider/api-key`, kind: 'session', body: 'JSON', sample: { path: `${A}/anthropic/api-key`, body: { key: `sk-ant-${'w'.repeat(24)}` } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/anthropic/oauth/start`, kind: 'session', body: 'JSON', sample: { path: `${A}/anthropic/oauth/start`, body: {} }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/anthropic/oauth/complete`, kind: 'session', body: 'JSON', sample: { path: `${A}/anthropic/oauth/complete`, body: { loginId: LOGIN, code: 'walk' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/openai-codex/oauth/start`, kind: 'session', body: 'JSON', sample: { path: `${A}/openai-codex/oauth/start`, body: {} }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/openai-codex/oauth/poll`, kind: 'session', body: 'NONE', sample: { path: `${A}/openai-codex/oauth/poll?loginId=${LOGIN}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${A}/google-ai-pro/connection`, kind: 'session', body: 'NONE', sample: { path: `${A}/google-ai-pro/connection` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/google-ai-pro/login/start`, kind: 'session', body: 'JSON', sample: { path: `${A}/google-ai-pro/login/start`, body: {} }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/google-ai-pro/login/complete`, kind: 'session', body: 'JSON', sample: { path: `${A}/google-ai-pro/login/complete`, body: { loginId: LOGIN, callbackUrl: 'http://localhost:8085/oauth2callback?code=walk' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${A}/google-ai-pro/login/:loginId`, kind: 'session', body: 'NONE', sample: { path: `${A}/google-ai-pro/login/${LOGIN}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/workspaces/:workspaceId/connections`, kind: 'session', operation: 'CON-01', body: 'NONE', sample: { path: `${W}/connections` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/workspaces/:workspaceId/connections`, kind: 'session', operation: 'CON-02', body: 'JSON', sample: { path: `${W}/connections`, body: { connectionId: OTHER, connectorId: 'sankhya', label: 'ERP', credential: { clientId: 'walk', clientSecret: 'walk', xToken: 'walk' } } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/workspaces/:workspaceId/connections/:connectionId/authentication-check`, kind: 'session', operation: 'CON-03', body: 'NONE', sample: { path: `${W}/connections/${OTHER}/authentication-check` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: `${C}/workspaces/:workspaceId/connections/:connectionId`, kind: 'session', operation: 'CON-04', body: 'NONE', sample: { path: `${W}/connections/${OTHER}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'GET', url: `${C}/projects/:projectId/connection-bindings`, kind: 'session', operation: 'CON-08', body: 'NONE', sample: { path: `${P}/connection-bindings` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'POST', url: `${C}/projects/:projectId/connection-bindings`, kind: 'session', operation: 'CON-09', body: 'JSON', sample: { path: `${P}/connection-bindings`, body: { connectionId: OTHER, name: 'erp' } }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  { listener: 'hub', method: 'DELETE', url: `${C}/projects/:projectId/connection-bindings/:bindingId`, kind: 'session', operation: 'CON-10', body: 'NONE', sample: { path: `${P}/connection-bindings/${OTHER}` }, withoutCredential: { status: 401, code: 'AUTHENTICATION_REQUIRED' } },
  ...[
    '/', '/setup', '/workspaces', '/workspaces/new', '/workspaces/:workspaceId/projects', '/workspaces/:workspaceId/projects/new',
    '/workspaces/:workspaceId/settings/people', '/projects/:projectId', '/projects/:projectId/c/:conversationId', '/projects/:projectId/settings',
    '/projects/:projectId/settings/access', '/projects/:projectId/integrations', '/settings', '/settings/account', '/settings/models',
    '/settings/installation/admins', '/signed-out', '/no-access',
  ].flatMap((url) => {
    const path = url.replace(':workspaceId', WORKSPACE).replace(':projectId', PROJECT).replace(':conversationId', CONVERSATION)
    return [
      { listener: 'hub', method: 'GET', url, kind: 'navigation', body: 'NONE', sample: { path }, withoutCredential: { status: 200, html: true } },
      { listener: 'hub', method: 'HEAD', url, kind: 'navigation', body: 'NONE', sample: { path }, withoutCredential: { status: 200 } },
    ]
  }),
  { listener: 'hub', method: 'GET', url: '/*', kind: 'navigation', body: 'NONE', sample: { path: '/assets/app.js' }, withoutCredential: { status: 200 } },
  { listener: 'hub', method: 'HEAD', url: '/*', kind: 'navigation', body: 'NONE', sample: { path: '/assets/app.js' }, withoutCredential: { status: 200 } },
  { listener: 'application', method: 'POST', url: '/__conexus/sign-out', kind: 'host-write', body: 'NONE', sample: { path: '/__conexus/sign-out' }, withoutCredential: { status: 204 } },
  { listener: 'application', method: 'POST', url: '/__conexus/api/:operation', kind: 'host-write', body: 'JSON', sample: { path: '/__conexus/api/listar', body: {} }, withoutCredential: { status: 401, code: 'APPLICATION_SIGN_IN_REQUIRED' } },
  { listener: 'application', method: 'GET', url: '/__conexus/sign-in/complete', kind: 'sign-in', body: 'NONE', sample: { path: `/__conexus/sign-in/complete?handoff=${HANDOFF}` }, withoutCredential: { status: 403, html: true } },
  { listener: 'application', method: 'GET', url: '/__conexus/no-access', kind: 'navigation', body: 'NONE', sample: { path: '/__conexus/no-access' }, withoutCredential: { status: 403, html: true } },
  { listener: 'application', method: 'HEAD', url: '/__conexus/no-access', kind: 'navigation', body: 'NONE', sample: { path: '/__conexus/no-access' }, withoutCredential: { status: 403 } },
  { listener: 'application', method: 'GET', url: '/', kind: 'navigation', body: 'NONE', sample: { path: '/' }, withoutCredential: { status: 303, location: 'https://hub.conexus.test/protocol/oidc/login?application=caderno&binding=' } },
  { listener: 'application', method: 'GET', url: '/*', kind: 'navigation', body: 'NONE', sample: { path: '/relatorios' }, withoutCredential: { status: 303, location: 'https://hub.conexus.test/protocol/oidc/login?application=caderno&binding=' } },
  { listener: 'application', method: 'HEAD', url: '/', kind: 'navigation', body: 'NONE', sample: { path: '/' }, withoutCredential: { status: 401 } },
  { listener: 'application', method: 'HEAD', url: '/*', kind: 'navigation', body: 'NONE', sample: { path: '/relatorios' }, withoutCredential: { status: 401 } },
  { listener: 'preview', method: 'POST', url: '/__conexus/preview-entry', kind: 'hub-entry', body: 'FORM', sample: { path: '/__conexus/preview-entry', body: `entryGrant=${HANDOFF}` }, withoutCredential: { status: 403 } },
  { listener: 'preview', method: 'POST', url: '/__conexus/api/:operation', kind: 'host-write', body: 'JSON', sample: { path: '/__conexus/api/listar', body: {} }, withoutCredential: { status: 403, code: 'PREVIEW_REFUSED' } },
  { listener: 'preview', method: 'GET', url: '/', kind: 'navigation', body: 'NONE', sample: { path: '/' }, withoutCredential: { status: 403 } },
  { listener: 'preview', method: 'GET', url: '/*', kind: 'navigation', body: 'NONE', sample: { path: '/assets/app.js' }, withoutCredential: { status: 403 } },
  { listener: 'preview', method: 'HEAD', url: '/', kind: 'navigation', body: 'NONE', sample: { path: '/' }, withoutCredential: { status: 403 } },
  { listener: 'preview', method: 'HEAD', url: '/*', kind: 'navigation', body: 'NONE', sample: { path: '/assets/app.js' }, withoutCredential: { status: 403 } },
])
