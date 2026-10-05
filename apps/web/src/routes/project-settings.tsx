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
import { PRJ_SUMMARIES, type ProjectDetail } from '../../../../packages/contract/dist/index.js'
import { deleteProject, projectQuery } from '../features/project/api'
import { useInstallation } from '../features/settings/use-installation'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'
import { failureText, isFailure } from '../app/http'
import { FailureState } from '../app/failure-state'

export const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/settings',
  component: ProjectSettingsRoute,
})

function ProjectSettingsRoute() {
  const { projectId } = projectSettingsRoute.useParams()
  const project = useQuery(projectQuery(projectId))
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
  const hidden = isFailure(error, 'PROJECT_NOT_FOUND')
  if (!hidden) return <FailureState title="Não foi possível carregar o Projeto" error={error} onRetry={onRetry} />
  return <div className="cx-state" role="alert">
    <h2>Projeto indisponível</h2>
    <p>{failureText(error)}</p>
    <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button>
  </div>
}

function About({ project }: Readonly<{ project: ProjectDetail }>) {
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
    <DangerZone project={project} />
  </>
}

// The Hub purges project.project before the GitHub repository is gone, so a crash or a GitHub
// failure between those two steps leaves the tombstone the only disclosable trace: the project read keeps
// answering with deleting true from it, for the installation administrator who started this, so this
// screen still exists to retry from instead of the Project 404ing right when finishing it matters
// most. The retry names the tombstone's own recorded name, never a name the administrator retypes,
// since that recorded name is the only one this Project still has.
//
// projectRevision is only ever empty once the project read has fallen back to the tombstone, which only
// happens after the Hub purge has run -- so it is the one signal this screen has for which side of
// that purge the crash landed on. The GitHub delete itself runs after that purge and before the
// tombstone is marked complete, so an empty revision does not tell us whether GitHub succeeded before
// the crash -- the copy below must not claim either way, only that a retry is safe and needed.
function DeletionRecovery({ project }: Readonly<{ project: ProjectDetail }>) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const purged = project.projectRevision === ''
  const retry = useMutation({
    mutationFn: () => deleteProject(project.projectId, project.name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [PRJ_SUMMARIES.id] })
      await navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: project.workspaceId } })
    },
    onError: (error) => setMessage(failureText(error)),
  })

  return <div className="cx-state" role="alert">
    <h2>Exclusão de {project.name} não terminou</h2>
    <p>
      {purged
        ? 'O código e os dados deste Projeto já foram apagados. A exclusão do repositório no GitHub pode não ter sido concluída.'
        : 'A exclusão deste Projeto está em andamento.'} Nada do que já foi apagado pode ser desfeito; termine a exclusão para concluir.
    </p>
    <Button type="button" variant="destructive" disabled={retry.isPending} onClick={() => retry.mutate()}>
      {retry.isPending ? 'Excluindo…' : 'Terminar exclusão'}
    </Button>
    {message && <p className="cx-form-status" data-tone="error" role="alert">{message}</p>}
  </div>
}

function DangerZone({ project }: Readonly<{ project: ProjectDetail }>) {
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
      await queryClient.invalidateQueries({ queryKey: [PRJ_SUMMARIES.id] })
      await navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: project.workspaceId } })
    },
    onError: (error) => setMessage(failureText(error)),
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
