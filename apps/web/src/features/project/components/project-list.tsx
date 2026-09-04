import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId, useMemo, useState } from 'react'
import { listProjects, ProjectRequestError, projectListQueryKey } from '../api'

type ArchiveFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL'

export function ProjectList({ workspaceId }: { workspaceId: string }) {
  const nameId = useId()
  const archiveId = useId()
  const [name, setName] = useState('')
  const [archive, setArchive] = useState<ArchiveFilter>('ACTIVE')
  const projects = useQuery({
    queryKey: projectListQueryKey(workspaceId),
    queryFn: () => listProjects(workspaceId),
  })
  const visible = useMemo(() => {
    if (!projects.data) return []
    const needle = name.trim().toLocaleLowerCase()
    return projects.data.filter((project) => {
      const nameMatches = !needle || project.name.toLocaleLowerCase().includes(needle)
      const archiveMatches = archive === 'ALL' || project.archived === (archive === 'ARCHIVED')
      return nameMatches && archiveMatches
    })
  }, [archive, name, projects.data])

  if (projects.isPending) return <p role="status">Carregando os Projects…</p>
  if (projects.isError) {
    if (projects.error instanceof ProjectRequestError && projects.error.status === 401) {
      return (
        <section className="empty" aria-labelledby="project-authentication">
          <h2 id="project-authentication">Entre no Conexus</h2>
          <p>A sessão atual não autoriza consultar Projects.</p>
          <a className="primary" href="/protocol/oidc/login">Entrar</a>
        </section>
      )
    }
    if (projects.error instanceof ProjectRequestError && [403, 404].includes(projects.error.status ?? 0)) {
      return (
        <section className="empty" aria-labelledby="projects-undisclosed">
          <h2 id="projects-undisclosed">O servidor não revelou os Projects</h2>
          <p>Isso não confirma se existem Projects neste Workspace.</p>
        </section>
      )
    }
    return (
      <section className="empty" aria-labelledby="projects-failure">
        <h2 id="projects-failure">Não foi possível consultar os Projects</h2>
        <p>Isso não confirma uma lista vazia nem altera sua autoridade.</p>
        <button type="button" onClick={() => void projects.refetch()}>Tentar novamente</button>
      </section>
    )
  }

  return (
    <section aria-labelledby="projects-list">
      <div className="project-toolbar">
        <div>
          <label htmlFor={nameId}>Nome do Project</label>
          <input id={nameId} type="search" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <label htmlFor={archiveId}>Estado</label>
          <select id={archiveId} value={archive} onChange={(event) => setArchive(event.target.value as ArchiveFilter)}>
            <option value="ACTIVE">Ativos</option>
            <option value="ARCHIVED">Arquivados</option>
            <option value="ALL">Todos</option>
          </select>
        </div>
      </div>
      <h2 id="projects-list">Projects divulgados</h2>
      {projects.data.length === 0 ? (
        <div className="empty">
          <h3>Nenhum Project divulgado</h3>
          <p>O servidor confirmou uma lista vazia para este Workspace.</p>
        </div>
      ) : visible.length === 0 ? (
        <p role="status">Nenhum Project divulgado corresponde aos filtros locais.</p>
      ) : (
        <ul className="project-grid">
          {visible.map((project) => (
            <li className="project-card" key={project.projectId}>
              <div>
                <h3>{project.name}</h3>
                <p>{project.archived ? 'Arquivado' : 'Ativo'}</p>
              </div>
              <Link to="/projects/$projectId" params={{ projectId: project.projectId }}>Abrir</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
