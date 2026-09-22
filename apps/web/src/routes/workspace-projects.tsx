import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { readLastWorkspace, rememberWorkspace } from '../features/entry/entry-destination'
import { listProjectSummaries, projectSummariesQueryKey } from '../features/project/api'
import { ProjectGrid, ProjectGridFailure, ProjectGridSkeleton, projectActivity } from '../features/project/components/project-grid'
import { PromptBox } from '../features/project/components/prompt-box'
import { WorkspaceUnavailable } from '../features/workspace/components/workspace-unavailable'
import '../features/project/projects-home.css'
import { rootRoute } from './__root'

export const workspaceProjectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$workspaceId/projects',
  component: WorkspaceProjectsRoute,
})

function WorkspaceProjectsRoute() {
  const { workspaceId } = workspaceProjectsRoute.useParams()
  return <AccessGate>{(context) => {
    const workspace = context.workspaces.find((candidate) => candidate.workspaceId === workspaceId)
    if (!workspace) return <Shell context={context}><WorkspaceUnavailable /></Shell>
    return <Shell context={context} scope={{ workspace }}><ProjectsHome workspaceId={workspaceId} workspaceName={workspace.name} /></Shell>
  }}</AccessGate>
}

function ProjectsHome({ workspaceId, workspaceName }: Readonly<{ workspaceId: string; workspaceName: string }>) {
  // Captured once, before the effect below overwrites it: this is where the person's last visit
  // left off, and it may already be this very Workspace.
  const [returning] = useState(() => readLastWorkspace() === workspaceId)
  useEffect(() => rememberWorkspace(workspaceId), [workspaceId])
  const summaries = useQuery({
    queryKey: projectSummariesQueryKey(workspaceId),
    queryFn: () => listProjectSummaries(workspaceId),
    // While any Project is building, its chip follows the run without a reload.
    refetchInterval: (query) => query.state.data?.some((summary) => projectActivity(summary) === 'BUILDING') ? 5_000 : false,
  })
  const active = summaries.data?.filter((summary) => !summary.archived) ?? []
  const empty = summaries.isSuccess && active.length === 0
  return <div className="cx-page cx-home" data-empty={empty || undefined}>
    <PromptBox workspaceId={workspaceId} workspaceName={workspaceName} returning={returning} />
    {!empty && (
      <section className="cx-home-projects" aria-labelledby="home-projects">
        <div className="cx-home-projects-head">
          <h2 id="home-projects" className="cx-section-title">Projetos <span className="cx-home-projects-count">{active.length} em {workspaceName}</span></h2>
          <Link to="/workspaces/$workspaceId/projects/new" params={{ workspaceId }} className="cx-new-project"><Plus size={15} aria-hidden="true" />Novo projeto</Link>
        </div>
        {summaries.isPending && <ProjectGridSkeleton />}
        {summaries.isError && <ProjectGridFailure onRetry={() => void summaries.refetch()} />}
        {summaries.isSuccess && <ProjectGrid projects={active} />}
      </section>
    )}
  </div>
}
