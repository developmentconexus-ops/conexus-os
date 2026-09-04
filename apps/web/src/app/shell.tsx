import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { endCurrentSession } from '../features/identity-access/api'
import type { AccessContext } from '../generated/iam-client'

export type ShellScope = Readonly<{
  workspace?: Readonly<{ workspaceId: string; name: string }> | undefined
  project?: Readonly<{ projectId: string; name: string; workspaceId: string }> | undefined
}>

export function Shell({
  context,
  scope,
  children,
}: {
  context: AccessContext
  scope?: ShellScope | undefined
  children: ReactNode
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const navigation = useRef<HTMLElement>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const navigationTrigger = useRef<HTMLButtonElement>(null)
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
    if (navigationOpen) navigation.current?.focus()
  }, [navigationOpen])

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (
        menuOpen &&
        !menu.current?.contains(target) &&
        !accountTrigger.current?.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [menuOpen])

  const closeAccountMenu = () => {
    setMenuOpen(false)
    queueMicrotask(() => accountTrigger.current?.focus())
  }

  const closeNavigation = () => {
    setNavigationOpen(false)
    queueMicrotask(() => navigationTrigger.current?.focus())
  }

  const workspace = scope?.workspace
  const project = scope?.project

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" to="/" search={{ workspaceId: undefined }}>Conexus</Link>
        <nav className="context-trail" aria-label="Contexto atual">
          <Link to="/" search={{ workspaceId: undefined }}>Workspaces</Link>
          {workspace && (
            <>
              <span aria-hidden="true">/</span>
              <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>
                {workspace.name}
              </Link>
            </>
          )}
          {project && (
            <>
              <span aria-hidden="true">/</span>
              <span>{project.name}</span>
            </>
          )}
        </nav>
        <button
          className="navigation-toggle"
          type="button"
          ref={navigationTrigger}
          aria-expanded={navigationOpen}
          aria-controls="primary-navigation"
          onClick={() => {
            setMenuOpen(false)
            setNavigationOpen((value) => !value)
          }}
        >
          Navegação
        </button>
        <button
          type="button"
          ref={accountTrigger}
          aria-expanded={menuOpen}
          aria-controls="account-menu"
          onClick={() => {
            setNavigationOpen(false)
            setMenuOpen((value) => !value)
          }}
        >
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
      </header>
      <div className="shell-body">
        <aside
          id="primary-navigation"
          className="navigation-drawer"
          data-open={navigationOpen}
          aria-label="Navegação principal"
          tabIndex={-1}
          ref={navigation}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeNavigation()
          }}
        >
          <button className="navigation-close" type="button" onClick={closeNavigation}>
            Fechar navegação
          </button>
          <nav aria-label="Navegação principal">
            {project && workspace ? (
              <>
                <p className="navigation-context">Project</p>
                <Link to="/projects/$projectId" params={{ projectId: project.projectId }} aria-current="page">
                  Visão do Project
                </Link>
                <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>
                  Voltar aos Projects
                </Link>
              </>
            ) : workspace ? (
              <>
                <p className="navigation-context">Workspace</p>
                <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }} aria-current="page">
                  Projects
                </Link>
                <Link to="/workspaces/$workspaceId/projects/new" params={{ workspaceId: workspace.workspaceId }}>
                  Criar Project
                </Link>
              </>
            ) : (
              <>
                <p className="navigation-context">Conta</p>
                <Link to="/" search={{ workspaceId: undefined }} aria-current="page">Workspaces</Link>
                <Link to="/workspaces/new">Novo Workspace</Link>
              </>
            )}
          </nav>
        </aside>
        <div className="shell-content">{children}</div>
      </div>
    </div>
  )
}
