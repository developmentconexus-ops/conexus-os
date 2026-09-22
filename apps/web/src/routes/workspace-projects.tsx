import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { rememberWorkspace } from '../features/entry/entry-destination'
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
    return <Shell context={context} scope={{ workspace }}><ProjectsHome workspaceId={workspaceId} /></Shell>
  }}</AccessGate>
}

function ProjectsHome({ workspaceId }: Readonly<{ workspaceId: string }>) {
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
    <PromptBox workspaceId={workspaceId} showExamples={empty} />
    {!empty && (
      <section className="cx-home-projects" aria-labelledby="home-projects">
        <h2 id="home-projects" className="cx-section-title">Projetos</h2>
        {summaries.isPending && <ProjectGridSkeleton />}
        {summaries.isError && <ProjectGridFailure onRetry={() => void summaries.refetch()} />}
        {summaries.isSuccess && <ProjectGrid projects={active} />}
      </section>
    )}
  </div>
}
