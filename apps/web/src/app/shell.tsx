import { Breadcrumb, Crumb } from '@mastra/playground-ui/components/Breadcrumb'
import { MainSidebar, MainSidebarProvider } from '@mastra/playground-ui/components/MainSidebar'
import { AppShell } from '@mastra/playground-ui/new/layout/app-shell'
import { useMutation } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { ConexusWordmark } from '../../../../packages/brand/src/index'
import { endCurrentSession } from '../features/identity-access/api'
import type { AccessContext } from '../generated/iam-client'

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

function Lockup({ arrive }: Readonly<{ arrive: boolean }>) {
  return <Link className="brand" to="/" search={{ workspaceId: undefined }}><ConexusWordmark size={22} arrive={arrive} /></Link>
}

function NavItem({ active, children }: Readonly<{ active: boolean; children: ReactElement<{ className?: string }> }>) {
  return <MainSidebar.NavLink isActive={active} render={children} />
}

function Navigation({ scope }: Readonly<{ scope: ShellScope | undefined }>) {
  const matchRoute = useMatchRoute()
  const workspace = scope?.workspace
  const project = scope?.project
  const label = (text: string) => <MainSidebar.NavLabel>{text}</MainSidebar.NavLabel>
  if (project && workspace) {
    const params = { projectId: project.projectId }
    return <MainSidebar.NavSection>
      <MainSidebar.NavHeader>Project</MainSidebar.NavHeader>
      <MainSidebar.NavList>
        <NavItem active={Boolean(matchRoute({ to: '/projects/$projectId', params }))}>
          <Link to="/projects/$projectId" params={params}>{label('Visão do Project')}</Link>
        </NavItem>
        <NavItem active={false}>
          <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>{label('Voltar aos Projects')}</Link>
        </NavItem>
      </MainSidebar.NavList>
    </MainSidebar.NavSection>
  }
  if (workspace) {
    const params = { workspaceId: workspace.workspaceId }
    return <MainSidebar.NavSection>
      <MainSidebar.NavHeader>Workspace</MainSidebar.NavHeader>
      <MainSidebar.NavList>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/projects', params }))}>
          <Link to="/workspaces/$workspaceId/projects" params={params}>{label('Projects')}</Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/projects/new', params }))}>
          <Link to="/workspaces/$workspaceId/projects/new" params={params}>{label('Criar Project')}</Link>
        </NavItem>
        <NavItem active={Boolean(matchRoute({ to: '/workspaces/$workspaceId/members', params }))}>
          <Link to="/workspaces/$workspaceId/members" params={params}>{label('Membros')}</Link>
        </NavItem>
      </MainSidebar.NavList>
    </MainSidebar.NavSection>
  }
  return <MainSidebar.NavSection>
    <MainSidebar.NavHeader>Conta</MainSidebar.NavHeader>
    <MainSidebar.NavList>
      <NavItem active={Boolean(matchRoute({ to: '/' }))}>
        <Link to="/" search={{ workspaceId: undefined }}>{label('Workspaces')}</Link>
      </NavItem>
      <NavItem active={Boolean(matchRoute({ to: '/workspaces/new' }))}>
        <Link to="/workspaces/new">{label('Novo Workspace')}</Link>
      </NavItem>
    </MainSidebar.NavList>
  </MainSidebar.NavSection>
}

function AccountMenu({ context }: Readonly<{ context: AccessContext }>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const signOutInFlight = useRef(false)
  const navigate = useNavigate()
  const signOut = useMutation({
    mutationFn: endCurrentSession,
    onSuccess: async () => {
      setMenuOpen(false)
      await navigate({ to: '/', search: { workspaceId: undefined } })
    },
    onSettled: () => {
      signOutInFlight.current = false
    },
  })

  useEffect(() => {
    if (menuOpen) menu.current?.focus()
  }, [menuOpen])

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuOpen && !menu.current?.contains(target) && !accountTrigger.current?.contains(target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [menuOpen])

  const closeAccountMenu = () => {
    setMenuOpen(false)
    queueMicrotask(() => accountTrigger.current?.focus())
  }

  return <div className="account">
    <button type="button" ref={accountTrigger} aria-expanded={menuOpen} aria-controls="account-menu" onClick={() => setMenuOpen((value) => !value)}>
      {context.account.displayName}
    </button>
    {menuOpen && (
      <div
        id="account-menu"
        className="account-menu"
        role="dialog"
        aria-label="Conta atual"
        tabIndex={-1}
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeAccountMenu()
        }}
      >
        <strong>{context.account.displayName}</strong>
        {context.account.email && <span>{context.account.email}</span>}
        <details>
          <summary>Identidade técnica</summary>
          <code>{context.account.accountId}</code>
        </details>
        <Link to="/settings" onClick={closeAccountMenu}>Configurações</Link>
        <button
          type="button"
          disabled={signOut.isPending}
          onClick={() => {
            if (signOutInFlight.current) return
            signOutInFlight.current = true
            signOut.mutate()
          }}
        >
          {signOut.isPending ? 'Saindo…' : 'Sair'}
        </button>
        {signOut.isError && (
          <p role="alert">
            O encerramento não foi confirmado. Sua sessão continua sendo tratada como ativa.
          </p>
        )}
      </div>
    )}
  </div>
}

export function Shell({
  context,
  scope,
  children,
}: {
  context: AccessContext
  scope?: ShellScope | undefined
  children: ReactNode
}) {
  const [arrive] = useState(firstShellMount)
  const workspace = scope?.workspace
  const project = scope?.project

  return (
    <MainSidebarProvider storageKey="conexus-shell" mobileBreakpoint={768} disableKeyboardShortcut>
      <div className="shell">
        <MainSidebar className="shell-sidebar">
          <div className="shell-lockup"><Lockup arrive={arrive} /></div>
          <MainSidebar.Nav aria-label="Navegação principal">
            <Navigation scope={scope} />
          </MainSidebar.Nav>
        </MainSidebar>
        <AppShell
          className="shell-main"
          mainLabel="Conteúdo"
          mobileHeader={<div className="shell-mobile-header"><MainSidebar.MobileTrigger aria-label="Abrir navegação" /><Lockup arrive={false} /></div>}
          routeHeader={
            <header className="topbar">
              <Breadcrumb label="Contexto atual" className="context-trail">
                <Crumb as={Link} to="/" isCurrent={!workspace}>Workspaces</Crumb>
                {workspace && <Crumb as={Link} to={`/workspaces/${workspace.workspaceId}/projects`} isCurrent={!project}>{workspace.name}</Crumb>}
                {project && <Crumb as="span" isCurrent>{project.name}</Crumb>}
              </Breadcrumb>
              <AccountMenu context={context} />
            </header>
          }
        >
          {children}
        </AppShell>
      </div>
    </MainSidebarProvider>
  )
}
