import { AlertDialog } from '@mastra/playground-ui/components/AlertDialog'
import { Button } from '@mastra/playground-ui/components/Button'
import { Input } from '@mastra/playground-ui/components/Input'
import { Label } from '@mastra/playground-ui/components/Label'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { ExternalLink, KeyRound } from 'lucide-react'
import { useId, useState } from 'react'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import {
  deleteProject, getProject, getProjectRepository, projectDeleteMessage, ProjectRequestError,
  projectQueryKey, projectRepositoryQueryKey, projectSummariesQueryKey,
} from '../features/project/api'
import { useInstallation } from '../features/settings/use-installation'
import type { ProjectRepresentation } from '../generated/project-client'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'

export const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/settings',
  component: ProjectSettingsRoute,
})

function ProjectSettingsRoute() {
  const { projectId } = projectSettingsRoute.useParams()
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  return <AccessGate>{(context) => {
    const workspace = project.data && context.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
    return <Shell context={context} scope={project.data && workspace ? { workspace, project: project.data } : undefined}>
      <div className="cx-page cx-page--narrow">
        {project.isPending && <div className="cx-page-head" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Carregando o Projeto</span></div>}
        {project.isError && <ProjectUnavailable error={project.error} onRetry={() => void project.refetch()} />}
        {project.isSuccess && <About project={project.data} />}
      </div>
    </Shell>
  }}</AccessGate>
}

function ProjectUnavailable({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const hidden = error instanceof ProjectRequestError && (error.status === 403 || error.status === 404)
  return <div className="cx-state" role="alert">
    <h2>{hidden ? 'Projeto indisponível' : 'Não foi possível carregar o Projeto'}</h2>
    <p>{hidden ? 'Este Projeto não existe ou você não faz parte do Workspace dele.' : 'O servidor não respondeu desta vez. Nada foi alterado.'}</p>
    {hidden ? <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button> : <Button type="button" variant="outline" onClick={onRetry}>Tentar de novo</Button>}
  </div>
}

function About({ project }: Readonly<{ project: ProjectRepresentation }>) {
  if (project.deleting) return <DeletionRecovery project={project} />
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
        <dt>Repositório</dt>
        <dd><RepositoryState projectId={project.projectId} /></dd>
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
    <DangerZone project={project} />
  </>
}

// The Hub purges project.project before the GitHub repository is gone, so a crash or a GitHub
// failure between those two steps leaves the tombstone the only disclosable trace: get_project keeps
// answering with deleting true from it, for the installation administrator who started this, so this
// screen still exists to retry from instead of the Project 404ing right when finishing it matters
// most. The retry names the tombstone's own recorded name, never a name the administrator retypes,
// since that recorded name is the only one this Project still has.
//
// projectRevision is only ever empty once get_project has fallen back to the tombstone, which only
// happens after the Hub purge has run -- so it is the one signal this screen has for which side of
// that purge the crash landed on, and the copy below must not claim the data is gone before it is.
function DeletionRecovery({ project }: Readonly<{ project: ProjectRepresentation }>) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const purged = project.projectRevision === ''
  const retry = useMutation({
    mutationFn: () => deleteProject(project.projectId, project.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectSummariesQueryKey(project.workspaceId) })
      await navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: project.workspaceId } })
    },
    onError: (error) => setMessage(projectDeleteMessage(error)),
  })

  return <div className="cx-state" role="alert">
    <h2>Exclusão de {project.name} não terminou</h2>
    <p>
      {purged
        ? 'O código e os dados deste Projeto já foram apagados. O repositório no GitHub ainda não.'
        : 'A exclusão deste Projeto está em andamento.'} Nada do que já foi apagado pode ser desfeito; termine a exclusão para concluir.
    </p>
    <Button type="button" variant="destructive" disabled={retry.isPending} onClick={() => retry.mutate()}>
      {retry.isPending ? 'Excluindo…' : 'Terminar exclusão'}
    </Button>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}
  </div>
}

function DangerZone({ project }: Readonly<{ project: ProjectRepresentation }>) {
  const installation = useInstallation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [message, setMessage] = useState('')
  const remove = useMutation({
    mutationFn: () => deleteProject(project.projectId, confirmName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectSummariesQueryKey(project.workspaceId) })
      await navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: project.workspaceId } })
    },
    onError: (error) => setMessage(projectDeleteMessage(error)),
  })

  if (installation.data?.administrator !== true) return null

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

function RepositoryState({ projectId }: Readonly<{ projectId: string }>) {
  const repository = useQuery({ queryKey: projectRepositoryQueryKey(projectId), queryFn: () => getProjectRepository(projectId) })
  if (repository.isPending) return <span className="cx-repo" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Verificando o repositório</span></span>
  if (repository.isError) {
    return <span className="cx-repo">
      <span>Não foi possível verificar o repositório agora.</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => void repository.refetch()}>Verificar de novo</Button>
    </span>
  }
  if (repository.data.state === 'UNREACHABLE') {
    return <span className="cx-repo">
      <span className="cx-chip" data-tone="failed">Inacessível</span>
      <span className="cx-repo-note">O Conexus não consegue alcançar o repositório no GitHub, então novos pedidos ficam parados. Um administrador da instalação pode reconectar o GitHub em Configurações.</span>
    </span>
  }
  return <span className="cx-repo">
    <a href={repository.data.url} target="_blank" rel="noreferrer" className="cx-repo-link">
      {repository.data.fullName} <ExternalLink size={14} aria-hidden /><span className="sr-only"> (abre o GitHub em outra aba)</span>
    </a>
    <span className="cx-chip" data-tone="live">Acessível</span>
  </span>
}
