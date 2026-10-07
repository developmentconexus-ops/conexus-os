import { useMutation, useQuery } from '@tanstack/react-query'
import { createRoute, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { ConexusMark } from '../../../../packages/brand/src/index'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { listConversations, openConversation } from '../features/builder/mastra-session'
import { projectQuery } from '../features/project/api'
import type { Session } from '@conexus/contract'
import { rootRoute } from './__root'

import { failureText, isFailure, isRetryable } from '@conexus/contract'
// The chat, editor and diff code is most of the application's weight, so it loads when Construir opens.
const Construir = lazy(() => import('../features/builder/construir/construir').then((module) => ({ default: module.Construir })))

const lensValues = ['preview', 'code', 'diff', 'details'] as const
type Lens = typeof lensValues[number]
const asLens = (value: unknown): Lens | undefined => lensValues.find((lens) => lens === value)

function Status({ title, children, working = false }: Readonly<{ title: string; children?: ReactNode; working?: boolean }>) {
  return <div className="cx-route-status" role="status"><ConexusMark size={32} working={working} /><h1>{title}</h1>{children}</div>
}

/** The Project read every Construir route shares, inside the app's own access gate. */
function ProjectFrame({ projectId, children }: Readonly<{ projectId: string; children: (context: Session) => ReactNode }>) {
  return <AccessGate>{(context) => <ProjectScope context={context} projectId={projectId}>{children(context)}</ProjectScope>}</AccessGate>
}

function ProjectScope({ context, projectId, children }: Readonly<{ context: Session; projectId: string; children: ReactNode }>) {
  const project = useQuery(projectQuery(projectId))
  if (project.isError) {
    const hidden = isFailure(project.error, 'PROJECT_NOT_FOUND')
    return <Shell context={context}><Status title={hidden ? 'Projeto indisponível' : 'Não foi possível abrir o Projeto'}>
      <p>{failureText(project.error)}</p>
      {!hidden && isRetryable(project.error) && <button type="button" onClick={() => void project.refetch()}>Tentar novamente</button>}
    </Status></Shell>
  }
  if (project.isSuccess && project.data.kind === 'not-found') {
    return <Shell context={context}><Status title="Projeto indisponível"><p>Não encontramos esse Projeto.</p></Status></Shell>
  }
  if (project.isSuccess && project.data.kind === 'found' && project.data.project.state === 'deleting') {
    return <Shell context={context}><Status title="Exclusão do Projeto em andamento" /></Shell>
  }
  const projectDetail = project.data?.kind === 'found' ? project.data.project : undefined
  const workspace = projectDetail ? context.workspaces.find((candidate) => candidate.workspaceId === projectDetail.workspaceId) : undefined
  return <Shell context={context} scope={projectDetail && workspace ? { workspace, project: projectDetail } : undefined}>
    {project.isPending ? <Status title="Abrindo o Projeto" working /> : children}
  </Shell>
}

export const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId', component: ProjectEntry })

/** Opens the Project's most recent conversation, or a new one when it has none. */
function ProjectEntry() {
  const { projectId } = projectRoute.useParams()
  return <ProjectFrame projectId={projectId}>{() => <OpenConversation projectId={projectId} />}</ProjectFrame>
}

function OpenConversation({ projectId }: Readonly<{ projectId: string }>) {
  const navigate = useNavigate()
  const conversations = useQuery({ queryKey: ['project-conversations', projectId], queryFn: () => listConversations(projectId) })
  // The browser picks the id, so a retried open lands on the thread the first attempt made.
  const newId = useRef(crypto.randomUUID())
  const create = useMutation({ mutationFn: () => openConversation(projectId, newId.current) })
  const latest = conversations.data?.at(0)?.id ?? create.data?.id
  const empty = conversations.data?.length === 0
  const { mutate, isIdle } = create
  useEffect(() => { if (empty && isIdle) mutate() }, [empty, isIdle, mutate])
  useEffect(() => {
    if (latest) void navigate({ to: '/projects/$projectId/c/$conversationId', params: { projectId, conversationId: latest }, search: {}, replace: true })
  }, [latest, navigate, projectId])
  if (conversations.isError || create.isError) {
    return <Status title="Não foi possível abrir a conversa">
      <p>{failureText(conversations.isError ? conversations.error : create.error)}</p>
      {isRetryable(conversations.isError ? conversations.error : create.error) && <button type="button" onClick={() => { if (conversations.isError) void conversations.refetch(); else create.mutate() }}>Tentar novamente</button>}
    </Status>
  }
  return <Status title="Abrindo a conversa" working />
}

export const construirRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/c/$conversationId',
  validateSearch: (search: Record<string, unknown>): Readonly<{ lens?: Lens }> => {
    const lens = asLens(search.lens)
    return lens && lens !== 'preview' ? { lens } : {}
  },
  component: ConstruirRoute,
})

function ConstruirRoute() {
  const { projectId, conversationId } = construirRoute.useParams()
  const { lens = 'preview' } = construirRoute.useSearch()
  const navigate = useNavigate({ from: construirRoute.fullPath })
  return <ProjectFrame projectId={projectId}>{(context) => <Suspense fallback={<Status title="Abrindo o Construir" working />}>
    <Construir
      projectId={projectId}
      conversationId={conversationId}
      accountId={context.account.accountId}
      lens={lens}
      onLensChange={(next) => void navigate({ search: next === 'preview' ? {} : { lens: next }, replace: true })}
      onConversationChange={(next) => void navigate({ to: '/projects/$projectId/c/$conversationId', params: { projectId, conversationId: next }, search: (current) => current })}
    />
  </Suspense>}</ProjectFrame>
}
