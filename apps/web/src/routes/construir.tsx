import { useMutation, useQuery } from '@tanstack/react-query'
import { createRoute, Navigate, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { ConexusMark } from '../../../../packages/brand/src/index'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { createFactoryConversation, listFactoryConversations } from '../features/builder/api'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { getProject, ProjectRequestError, projectQueryKey } from '../features/project/api'
import type { AccessContext } from '../generated/iam-client'
import { rootRoute } from './__root'

// The chat, editor and diff code is most of the application's weight, so it loads when Construir opens.
const Construir = lazy(() => import('../features/builder/construir/construir').then((module) => ({ default: module.Construir })))

const lensValues = ['preview', 'code', 'diff', 'details'] as const
type Lens = typeof lensValues[number]
const asLens = (value: unknown): Lens | undefined => lensValues.find((lens) => lens === value)

function Status({ title, children, working = false }: Readonly<{ title: string; children?: ReactNode; working?: boolean }>) {
  return <div className="cx-route-status" role="status"><ConexusMark size={32} working={working} /><h1>{title}</h1>{children}</div>
}

/** Access and Project reads every Construir route shares, with their loading and refusal states. */
function ProjectFrame({ projectId, children }: Readonly<{ projectId: string; children: (context: AccessContext) => ReactNode }>) {
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) {
    return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  }
  if (access.isPending) return <Status title="Abrindo o Construir" working />
  if (access.isError) return <Status title="Não foi possível consultar seu acesso"><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></Status>
  if (project.isError) {
    const hidden = project.error instanceof ProjectRequestError && [403, 404].includes(project.error.status ?? 0)
    return <Shell context={access.data}><Status title={hidden ? 'Project indisponível' : 'Não foi possível abrir o Project'}>
      {hidden ? <p>Este Project não existe ou não está disponível para você.</p> : <button type="button" onClick={() => void project.refetch()}>Tentar novamente</button>}
    </Status></Shell>
  }
  const workspace = project.data ? access.data.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId) : undefined
  return <Shell context={access.data} scope={project.data && workspace ? { workspace, project: project.data } : undefined}>
    {project.isPending ? <Status title="Abrindo o Project" working /> : children(access.data)}
  </Shell>
}

export const projectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId', component: ProjectEntry })
// Links from before Construir had its own address still land in the same place.
export const projectBuildRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/build',
  component: function LegacyBuild() {
    const { projectId } = projectBuildRoute.useParams()
    return <Navigate to="/projects/$projectId" params={{ projectId }} replace />
  },
})

/** Opens the Project's most recent conversation, or a new one when it has none. */
function ProjectEntry() {
  const { projectId } = projectRoute.useParams()
  return <ProjectFrame projectId={projectId}>{() => <OpenConversation projectId={projectId} />}</ProjectFrame>
}

function OpenConversation({ projectId }: Readonly<{ projectId: string }>) {
  const navigate = useNavigate()
  const conversations = useQuery({ queryKey: ['project-conversations', projectId], queryFn: () => listFactoryConversations(projectId) })
  // The browser picks the id, so a retried create lands on the row the first attempt wrote.
  const newId = useRef(crypto.randomUUID())
  const create = useMutation({ mutationFn: () => createFactoryConversation(projectId, newId.current) })
  const latest = conversations.data?.at(0)?.id ?? create.data?.id
  const empty = conversations.data?.length === 0
  const { mutate, isIdle } = create
  useEffect(() => { if (empty && isIdle) mutate() }, [empty, isIdle, mutate])
  useEffect(() => {
    if (latest) void navigate({ to: '/projects/$projectId/c/$conversationId', params: { projectId, conversationId: latest }, search: {}, replace: true })
  }, [latest, navigate, projectId])
  if (conversations.isError || create.isError) {
    return <Status title="Não foi possível abrir a conversa">
      <button type="button" onClick={() => { if (conversations.isError) void conversations.refetch(); else create.mutate() }}>Tentar novamente</button>
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
