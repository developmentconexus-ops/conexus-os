import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { getProject, ProjectRequestError, projectQueryKey } from '../api'

export function ProjectDetail({ projectId }: { projectId: string }) {
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  if (project.isPending) return <p role="status">Carregando o Project…</p>
  if (project.isError) {
    if (project.error instanceof ProjectRequestError && [403, 404].includes(project.error.status ?? 0)) {
      return (
        <section className="empty" aria-labelledby="project-undisclosed">
          <h1 id="project-undisclosed">Project indisponível</h1>
          <p>O servidor não revelou este Project para a autoridade atual.</p>
        </section>
      )
    }
    return (
      <section className="empty" aria-labelledby="project-failure">
        <h1 id="project-failure">Não foi possível consultar o Project</h1>
        <p>Isso não confirma ausência nem altera seu acesso.</p>
        <button type="button" onClick={() => void project.refetch()}>Tentar novamente</button>
      </section>
    )
  }
  return (
    <article className="project-detail">
      <p className="eyebrow">Project</p>
      <h1>{project.data.name}</h1>
      <p><strong>Estado:</strong> {project.data.archived ? 'Arquivado' : 'Ativo'}</p>
      <details>
        <summary>Identidade técnica</summary>
        <code>{project.data.projectId}</code>
        <code>{project.data.projectRevision}</code>
      </details>
      <p><Link to="/projects/$projectId/inception" params={{ projectId }}>Iniciar Project Inception</Link></p>
      <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: project.data.workspaceId }}>
        Voltar aos Projects
      </Link>
    </article>
  )
}
