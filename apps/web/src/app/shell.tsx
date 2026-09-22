import { Avatar } from '@mastra/playground-ui/components/Avatar'
import { Breadcrumb, Crumb } from '@mastra/playground-ui/components/Breadcrumb'
import { DropdownMenu } from '@mastra/playground-ui/components/DropdownMenu'
import { MainSidebar, MainSidebarProvider, useMainSidebar } from '@mastra/playground-ui/components/MainSidebar'
import { AppShell } from '@mastra/playground-ui/new/layout/app-shell'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft, ChevronDown, ChevronsUpDown, Database, Hammer, Info, LayoutGrid, Plug, Plus, Settings, Sparkles, Users,
} from 'lucide-react'
import { useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ConexusMark, ConexusWordmark } from '../../../../packages/brand/src/index'
import { endCurrentSession } from '../features/identity-access/api'
import { listProjects, projectListQueryKey } from '../features/project/api'
import type { AccessContext } from '../generated/iam-client'
import { ThemeToggle } from './theme-toggle'
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

// `label` only feeds the tooltip the collapsed 56px rail shows on hover; the visible label lives
// in the `children` Link via NavText.
function NavItem({ active, label, children }: Readonly<{ active: boolean; label: string; children: ReactElement<{ className?: string }> }>) {
  return <MainSidebar.NavLink isActive={active} link={{ name: label, url: '#' }} render={children} />
}

function NavText({ icon, children }: Readonly<{ icon: ReactNode; children: string }>) {
  return <>{icon}<MainSidebar.NavLabel>{children}</MainSidebar.NavLabel></>
}

/** The library's own default button carries no border/padding reset, so our global `button` base
 *  style (border, padding) otherwise leaks onto it and swallows the icon; `cx-rail-collapse` is
 *  unlayered CSS, so it wins back the plain icon-button look regardless of source order. The label
 *  flips with the actual state, not just the click that's about to happen. */
function SidebarCollapseTrigger() {
  const { desktopState } = useMainSidebar()
  const collapsed = desktopState === 'collapsed'
  return <MainSidebar.Trigger className="cx-rail-collapse" aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'} />
}

/** A capability the Project doesn't have yet. Shows "em breve" inline, and as the tooltip when the
 *  rail is collapsed to icons. */
function ComingSoonNavItem({ icon, label }: Readonly<{ icon: ReactNode; label: string }>) {
  return <MainSidebar.NavLink
    link={{ name: label, tooltipMsg: 'Em breve', url: '#' }}
    render={<span aria-disabled="true">
      {icon}
      <MainSidebar.NavLabel>{label}</MainSidebar.NavLabel>
      <span className="cx-nav-soon" aria-hidden>em breve</span>
    </span>}
  />
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
        <NavItem active={false} label="Voltar para Projetos">
          <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>
            <NavText icon={<ArrowLeft size={16} aria-hidden />}>Voltar para Projetos</NavText>
          </Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/projects/$projectId', params, fuzzy: true })) && !matchRoute({ to: '/projects/$projectId/settings', params })} label="Construir">
          <Link to="/projects/$projectId" params={params}><NavText icon={<Hammer size={16} aria-hidden />}>Construir</NavText></Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/projects/$projectId/settings', params }))} label="Sobre">
          <Link to="/projects/$projectId/settings" params={params}><NavText icon={<Info size={16} aria-hidden />}>Sobre</NavText></Link>
        </NavItem>
      </MainSidebar.NavList>
      <MainSidebar.NavHeader>Em breve</MainSidebar.NavHeader>
      <MainSidebar.NavList>
        <ComingSoonNavItem icon={<Database size={16} aria-hidden />} label="Dados" />
        <ComingSoonNavItem icon={<Sparkles size={16} aria-hidden />} label="Capacidades" />
        <ComingSoonNavItem icon={<Plug size={16} aria-hidden />} label="Integrações" />
      </MainSidebar.NavList>
    </MainSidebar.NavSection>
  }
  if (workspace) {
    const params = { workspaceId: workspace.workspaceId }
    return <MainSidebar.NavSection>
      <MainSidebar.NavHeader><span className="cx-rail-scope">{workspace.name}</span></MainSidebar.NavHeader>
      <MainSidebar.NavList>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/projects', params, fuzzy: true }))} label="Projetos">
          <Link to="/workspaces/$workspaceId/projects" params={params}><NavText icon={<LayoutGrid size={16} aria-hidden />}>Projetos</NavText></Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/settings/people', params }))} label="Pessoas">
          <Link to="/workspaces/$workspaceId/settings/people" params={params}><NavText icon={<Users size={16} aria-hidden />}>Pessoas</NavText></Link>
        </NavItem>
      </MainSidebar.NavList>
    </MainSidebar.NavSection>
  }
  return <MainSidebar.NavSection>
    <MainSidebar.NavHeader>Conexus</MainSidebar.NavHeader>
    <MainSidebar.NavList>
      <NavItem active={Boolean(matchRoute({ to: '/workspaces' }))} label="Workspaces">
        <Link to="/workspaces"><NavText icon={<LayoutGrid size={16} aria-hidden />}>Workspaces</NavText></Link>
      </NavItem>
      <NavItem active={Boolean(matchRoute({ to: '/workspaces/new' }))} label="Novo Workspace">
        <Link to="/workspaces/new"><NavText icon={<Plus size={16} aria-hidden />}>Novo Workspace</NavText></Link>
      </NavItem>
    </MainSidebar.NavList>
  </MainSidebar.NavSection>
}

function SwitcherTrigger({ label, className, children }: Readonly<{ label: string; className?: string; children?: ReactNode }>) {
  return <DropdownMenu.Trigger className={className ?? 'cx-switcher'} aria-label={label}>
    {children ?? <ChevronDown size={14} aria-hidden />}
  </DropdownMenu.Trigger>
}

function WorkspaceSwitcher({ context, current, trigger }: Readonly<{ context: AccessContext; current: string; trigger?: ReactNode }>) {
  const navigate = useNavigate()
  return <DropdownMenu>
    {trigger ?? <SwitcherTrigger label="Trocar de Workspace" />}
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
    <ThemeToggle />
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
  const workspace = scope?.workspace
  const project = scope?.project
  const settingsLabel = project ? 'Configurações do projeto' : 'Configurações'
  return (
    <MainSidebarProvider storageKey="conexus-shell" mobileBreakpoint={768} collapsedWidth={56} disableKeyboardShortcut={false}>
      <div className="shell-frame">
        <TopBar context={context} scope={scope} place={place} arrive={arrive} />
        <div className="shell">
          <MainSidebar className="shell-sidebar">
            <div className="cx-rail-top">
              {workspace
                ? <WorkspaceSwitcher context={context} current={workspace.workspaceId} trigger={
                  <SwitcherTrigger label="Trocar de Workspace" className="cx-rail-switch">
                    <span className="cx-rail-badge" aria-hidden>{workspace.name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
                    <span className="cx-rail-name">{workspace.name}</span>
                    <ChevronsUpDown size={14} aria-hidden className="cx-rail-switch-icon" />
                  </SwitcherTrigger>
                } />
                : <span className="cx-rail-switch cx-rail-switch--static"><ConexusMark size={18} /><span className="cx-rail-name">Conexus</span></span>}
              <SidebarCollapseTrigger />
            </div>
            <MainSidebar.Nav aria-label="Navegação principal">
              {rail ?? <ScopeRail scope={scope} />}
            </MainSidebar.Nav>
            {workspace && (
              <MainSidebar.Bottom className="cx-rail-bottom">
                <MainSidebar.NavList>
                  <NavItem active={false} label={settingsLabel}>
                    {project
                      ? <Link to="/projects/$projectId/settings" params={{ projectId: project.projectId }}><NavText icon={<Settings size={16} aria-hidden />}>{settingsLabel}</NavText></Link>
                      : <Link to="/settings/account"><NavText icon={<Settings size={16} aria-hidden />}>{settingsLabel}</NavText></Link>}
                  </NavItem>
                </MainSidebar.NavList>
              </MainSidebar.Bottom>
            )}
          </MainSidebar>
          <AppShell className="shell-main" mainLabel="Conteúdo">
            {children}
          </AppShell>
        </div>
      </div>
    </MainSidebarProvider>
  )
}
