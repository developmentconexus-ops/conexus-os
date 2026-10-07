import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useId, useState } from 'react'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { listProjectSummaries, type ProjectDetail } from '@conexus/contract'
import { deleteProject, projectQuery } from '../features/project/api'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'
import { failureText, isFailure } from '../app/http'
import { FailureState } from '../app/failure-state'
import { workspaceRosterQuery } from '../features/identity-access/membership-api'

export const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/settings',
  component: ProjectSettingsRoute,
})

function ProjectSettingsRoute() {
  const { projectId } = projectSettingsRoute.useParams()
  const project = useQuery(projectQuery(projectId))
  return <AccessGate>{(context) => {
    if (project.isSuccess && project.data.kind === 'found') return <ProjectSettingsLoaded context={context} project={project.data.project} />
    return <Shell context={context}><div className="cx-page cx-page--narrow">
      {project.isPending && <div className="cx-page-head" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Carregando o Projeto</span></div>}
      {project.isError && <ProjectUnavailable error={project.error} onRetry={() => void project.refetch()} />}
      {project.isSuccess && <ProjectUnavailable error={null} onRetry={() => void project.refetch()} />}
    </div></Shell>
  }}</AccessGate>
}

function ProjectSettingsLoaded({ context, project }: Readonly<{ context: import('@conexus/contract').Session; project: ProjectDetail }>) {
  const workspace = context.workspaces.find((candidate) => candidate.workspaceId === project.workspaceId)
  const roster = useQuery(workspaceRosterQuery(project.workspaceId))
  return <Shell context={context} scope={workspace ? { workspace, project } : undefined}>
    <div className="cx-page cx-page--narrow"><About project={project} owner={roster.data?.viewerRole === 'owner'} /></div>
  </Shell>
}

function ProjectUnavailable({ error, onRetry }: Readonly<{ error: unknown | null; onRetry: () => void }>) {
  const hidden = error === null || isFailure(error, 'PROJECT_NOT_FOUND')
  if (!hidden) return <FailureState title="Não foi possível carregar o Projeto" error={error} onRetry={onRetry} />
  return <div className="cx-state" role="alert">
    <h2>Projeto indisponível</h2>
    <p>{error === null ? 'Não encontramos esse Projeto.' : failureText(error)}</p>
    <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button>
  </div>
}

function About({ project, owner }: Readonly<{ project: ProjectDetail; owner: boolean }>) {
  if (project.state === 'deleting') return <DeletionRecovery project={project} owner={owner} />
  return <>
    <div className="cx-page-head">
      <div>
        <h1>Sobre o Projeto</h1>
        <p>O que o Conexus sabe sobre {project.name} e onde o código dele mora.</p>
      </div>
      <Button as={Link} to={`/projects/${project.projectId}/settings/access`} variant="outline">
        <KeyRound size={16} aria-hidden /> Acesso ao aplicativo
      </Button>
    </div>
    <dl className="cx-facts">
      <div>
        <dt>Nome</dt>
        <dd>{project.name}{project.archived && <span className="cx-chip">Arquivado</span>}</dd>
      </div>
      <div>
        <dt>Código</dt>
        <dd>Guardado no próprio Conexus. Cada mudança aprovada vira uma nova versão.</dd>
      </div>
      <div>
        <dt>Internet</dt>
        <dd>O agente executa comandos sozinho num ambiente isolado com acesso à internet.</dd>
      </div>
    </dl>
    <details className="cx-technical">
      <summary>Identificação técnica</summary>
      <dl>
        <dt>Projeto</dt><dd><code>{project.projectId}</code></dd>
        <dt>Revisão</dt><dd><code>{project.projectRevision}</code></dd>
      </dl>
    </details>
    {owner && <DangerZone project={project} />}
  </>
}

function DeletionRecovery({ project, owner }: Readonly<{ project: ProjectDetail; owner: boolean }>) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const retry = useMutation({
    mutationFn: () => deleteProject(project.projectId, project.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listProjectSummaries.id] })
      await navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: project.workspaceId } })
    },
    onError: (error) => setMessage(failureText(error)),
  })

  return <div className="cx-state" role="alert">
    <h2>Exclusão de {project.name} em andamento</h2>
    <p>Este Projeto está sendo excluído. {owner ? 'Você pode tentar concluir a exclusão novamente.' : 'Um responsável pelo Workspace poderá concluir a exclusão.'}</p>
    {owner && <Button type="button" variant="destructive" disabled={retry.isPending} onClick={() => retry.mutate()}>
      {retry.isPending ? 'Excluindo…' : 'Tentar concluir exclusão'}
    </Button>}
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}
  </div>
}

function DangerZone({ project }: Readonly<{ project: ProjectDetail }>) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [message, setMessage] = useState('')
  const remove = useMutation({
    mutationFn: () => deleteProject(project.projectId, confirmName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [listProjectSummaries.id] })
      await navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: project.workspaceId } })
    },
    onError: (error) => setMessage(failureText(error)),
  })

  return <section className="cx-danger" aria-labelledby="cx-danger-title">
    <h2 id="cx-danger-title">Zona de risco</h2>
    <p>Excluir {project.name} apaga o código, os dados e o repositório no GitHub, para sempre. Não é possível desfazer.</p>
    <Button
      type="button"
      variant="destructive"
      onClick={() => { setConfirmName(''); setMessage(''); setOpen(true) }}
    >
      Excluir Projeto
    </Button>
    <AlertDialog open={open} onOpenChange={(next) => { if (!remove.isPending) setOpen(next) }}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>Excluir {project.name}?</AlertDialog.Title>
          <AlertDialog.Description>
            O código, os dados e o repositório {project.name} no GitHub somem para sempre. Para confirmar, digite o nome exato do Projeto.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <div className="cx-field cx-danger-confirm">
          <Label htmlFor={inputId}>Nome do Projeto</Label>
          <Input id={inputId} value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" placeholder={project.name} />
        </div>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={remove.isPending}>Cancelar</AlertDialog.Cancel>
          <AlertDialog.Action disabled={confirmName !== project.name || remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? 'Excluindo…' : 'Excluir para sempre'}
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}
  </section>
}
