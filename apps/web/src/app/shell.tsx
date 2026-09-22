import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Breadcrumb, Crumb } from '@mastra/playground-ui/components/Breadcrumb'
import { DropdownMenu } from '@mastra/playground-ui/components/DropdownMenu'
import { MainSidebar, MainSidebarProvider } from '@mastra/playground-ui/components/MainSidebar'
import { AppShell } from '@mastra/playground-ui/new/layout/app-shell'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ChevronDown, Hammer, Info, LayoutGrid, Plus, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ConexusMark, ConexusWordmark } from '../../../../packages/brand/src/index'
import { endCurrentSession } from '../features/identity-access/api'
import { listProjects, projectListQueryKey } from '../features/project/api'
import type { AccessContext } from '../generated/iam-client'
import './frame.css'

export type ShellScope = Readonly<{
  workspace?: Readonly<{ workspaceId: string; name: string }> | undefined
  project?: Readonly<{ projectId: string; name: string; workspaceId: string }> | undefined
}>

// The mark fits together once per page load, not on every route that remounts the shell.
let shellArrived = false
const firstShellMount = (): boolean => {
  const first = !shellArrived
  shellArrived = true
  return first
}

function NavItem({ active, children }: Readonly<{ active: boolean; children: ReactElement<{ className?: string }> }>) {
  return <MainSidebar.NavLink isActive={active} render={children} />
}

function NavText({ icon, children }: Readonly<{ icon: ReactNode; children: string }>) {
  return <>{icon}<MainSidebar.NavLabel>{children}</MainSidebar.NavLabel></>
}

function ScopeRail({ scope }: Readonly<{ scope: ShellScope | undefined }>) {
  const matchRoute = useMatchRoute()
  const workspace = scope?.workspace
  const project = scope?.project
  if (project && workspace) {
    const params = { projectId: project.projectId }
    return <MainSidebar.NavSection>
      <MainSidebar.NavHeader><span className="cx-rail-scope">{project.name}</span></MainSidebar.NavHeader>
      <MainSidebar.NavList>
        <NavItem active={false}>
          <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>
            <NavText icon={<ArrowLeft size={16} aria-hidden />}>Voltar para Projetos</NavText>
          </Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/projects/$projectId', params, fuzzy: true })) && !matchRoute({ to: '/projects/$projectId/settings', params })}>
          <Link to="/projects/$projectId" params={params}><NavText icon={<Hammer size={16} aria-hidden />}>Construir</NavText></Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/projects/$projectId/settings', params }))}>
          <Link to="/projects/$projectId/settings" params={params}><NavText icon={<Info size={16} aria-hidden />}>Sobre</NavText></Link>
        </NavItem>
      </MainSidebar.NavList>
    </MainSidebar.NavSection>
  }
  if (workspace) {
    const params = { workspaceId: workspace.workspaceId }
    return <MainSidebar.NavSection>
      <MainSidebar.NavHeader><span className="cx-rail-scope">{workspace.name}</span></MainSidebar.NavHeader>
      <MainSidebar.NavList>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/projects', params, fuzzy: true }))}>
          <Link to="/workspaces/$workspaceId/projects" params={params}><NavText icon={<LayoutGrid size={16} aria-hidden />}>Projetos</NavText></Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/settings/people', params }))}>
          <Link to="/workspaces/$workspaceId/settings/people" params={params}><NavText icon={<Users size={16} aria-hidden />}>Pessoas</NavText></Link>
        </NavItem>
      </MainSidebar.NavList>
    </MainSidebar.NavSection>
  }
  return <MainSidebar.NavSection>
    <MainSidebar.NavHeader>Conexus</MainSidebar.NavHeader>
    <MainSidebar.NavList>
      <NavItem active={Boolean(matchRoute({ to: '/workspaces' }))}>
        <Link to="/workspaces"><NavText icon={<LayoutGrid size={16} aria-hidden />}>Workspaces</NavText></Link>
      </NavItem>
      <NavItem active={Boolean(matchRoute({ to: '/workspaces/new' }))}>
        <Link to="/workspaces/new"><NavText icon={<Plus size={16} aria-hidden />}>Novo Workspace</NavText></Link>
      </NavItem>
    </MainSidebar.NavList>
  </MainSidebar.NavSection>
}

function SwitcherTrigger({ label }: Readonly<{ label: string }>) {
  return <DropdownMenu.Trigger className="cx-switcher" aria-label={label}>
    <ChevronDown size={14} aria-hidden />
  </DropdownMenu.Trigger>
}

function WorkspaceSwitcher({ context, current }: Readonly<{ context: AccessContext; current: string }>) {
  const navigate = useNavigate()
  return <DropdownMenu>
    <SwitcherTrigger label="Trocar de Workspace" />
    <DropdownMenu.Content align="start" className="cx-menu">
      <DropdownMenu.Label>Workspaces</DropdownMenu.Label>
      {context.workspaces.map((workspace) => (
        <DropdownMenu.Item
          key={workspace.workspaceId}
          aria-current={workspace.workspaceId === current ? 'true' : undefined}
          onClick={() => void navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: workspace.workspaceId } })}
        >
          {workspace.name}
        </DropdownMenu.Item>
      ))}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onClick={() => void navigate({ to: '/workspaces/new' })}>
        <Plus size={14} aria-hidden /> Novo Workspace
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu>
}

function ProjectSwitcher({ workspaceId, current }: Readonly<{ workspaceId: string; current: string }>) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const projects = useQuery({ queryKey: projectListQueryKey(workspaceId), queryFn: () => listProjects(workspaceId), enabled: open })
  return <DropdownMenu open={open} onOpenChange={setOpen}>
    <SwitcherTrigger label="Trocar de Projeto" />
    <DropdownMenu.Content align="start" className="cx-menu">
      <DropdownMenu.Label>Projetos</DropdownMenu.Label>
      {projects.isPending && <DropdownMenu.Item disabled>Carregando…</DropdownMenu.Item>}
      {projects.isError && <DropdownMenu.Item disabled>Não foi possível carregar</DropdownMenu.Item>}
      {projects.data?.filter((project) => !project.archived).map((project) => (
        <DropdownMenu.Item
          key={project.projectId}
          aria-current={project.projectId === current ? 'true' : undefined}
          onClick={() => void navigate({ to: '/projects/$projectId', params: { projectId: project.projectId } })}
        >
          {project.name}
        </DropdownMenu.Item>
      ))}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onClick={() => void navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId } })}>
        Todos os Projetos
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu>
}

function AccountMenu({ context }: Readonly<{ context: AccessContext }>) {
  const navigate = useNavigate()
  const signOutInFlight = useRef(false)
  const signOut = useMutation({
    mutationFn: endCurrentSession,
    onSuccess: () => navigate({ to: '/signed-out' }),
    onSettled: () => {
      signOutInFlight.current = false
    },
  })
  const { displayName, email } = context.account
  return <div className="cx-account">
    <DropdownMenu>
      <DropdownMenu.Trigger className="cx-account-trigger" aria-label={`Conta de ${displayName}`}>
        <Avatar name={displayName} size="sm" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="cx-menu cx-account-menu">
        <div className="cx-account-who">
          <strong>{displayName}</strong>
          {email && <span>{email}</span>}
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onClick={() => void navigate({ to: '/settings/account' })}>Configurações</DropdownMenu.Item>
        <DropdownMenu.Item
          disabled={signOut.isPending}
          onClick={() => {
            if (signOutInFlight.current) return
            signOutInFlight.current = true
            signOut.mutate()
          }}
        >
          {signOut.isPending ? 'Saindo…' : 'Sair do Conexus'}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
    {signOut.isError && (
      <p className="cx-account-error" role="alert">Não foi possível sair agora. Tente de novo.</p>
    )}
  </div>
}

function TopBar({ context, scope, place, arrive }: Readonly<{ context: AccessContext; scope: ShellScope | undefined; place: string | undefined; arrive: boolean }>) {
  const workspace = scope?.workspace
  const project = scope?.project
  return <header className="cx-topbar">
    <MainSidebar.MobileTrigger aria-label="Abrir navegação" className="cx-drawer-trigger" />
    <Breadcrumb label="Contexto atual" className="cx-trail">
      <Crumb as={Link} to="/" className="cx-home-crumb" aria-label="Conexus, início">
        <span className="cx-lockup-wide"><ConexusWordmark size={18} arrive={arrive} /></span>
        <span className="cx-lockup-narrow"><ConexusMark size={18} /></span>
      </Crumb>
      {workspace && (
        <Crumb
          as={Link}
          to={`/workspaces/${workspace.workspaceId}/projects`}
          isCurrent={!project}
          action={<WorkspaceSwitcher context={context} current={workspace.workspaceId} />}
        >
          {workspace.name}
        </Crumb>
      )}
      {workspace && project && (
        <Crumb
          as={Link}
          to={`/projects/${project.projectId}`}
          isCurrent
          action={<ProjectSwitcher workspaceId={workspace.workspaceId} current={project.projectId} />}
        >
          {project.name}
        </Crumb>
      )}
      {place && <Crumb as="span" isCurrent>{place}</Crumb>}
    </Breadcrumb>
    <AccountMenu context={context} />
  </header>
}

export function Shell({
  context,
  scope,
  rail,
  place,
  children,
}: {
  context: AccessContext
  scope?: ShellScope | undefined
  rail?: ReactNode
  /** A top-level area outside any Workspace, such as Configurações, named as the last crumb. */
  place?: string
  children: ReactNode
}) {
  const [arrive] = useState(firstShellMount)
  return (
    <MainSidebarProvider storageKey="conexus-shell" mobileBreakpoint={768} disableKeyboardShortcut>
      <div className="shell">
        <MainSidebar className="shell-sidebar">
          <div className="cx-rail-lockup"><ConexusWordmark size={20} /></div>
          <MainSidebar.Nav aria-label="Navegação principal">
            {rail ?? <ScopeRail scope={scope} />}
          </MainSidebar.Nav>
        </MainSidebar>
        <AppShell className="shell-main" mainLabel="Conteúdo" routeHeader={<TopBar context={context} scope={scope} place={place} arrive={arrive} />}>
          {children}
        </AppShell>
      </div>
    </MainSidebarProvider>
  )
}
