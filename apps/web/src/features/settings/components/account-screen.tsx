import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from './page-header'
import { SectionEmpty, StatusLine } from './states'

export function AccountScreen({ account, workspaces }: Readonly<{
  account: Readonly<{ accountId: string; displayName: string; email?: string }>
  workspaces: readonly Readonly<{ workspaceId: string; name: string }>[]
}>) {
  const [copied, setCopied] = useState(false)
  const copyAccountId = async () => {
    try {
      await navigator.clipboard.writeText(account.accountId)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return <main className="cxs-page">
    <PageHeader title="Minha conta" />
    <section aria-labelledby="cxs-account-title">
      <h2 id="cxs-account-title" className="cxs-sr-only">Dados da conta</h2>
      <dl className="cxs-definition-list">
        <div><dt>Nome</dt><dd>{account.displayName}</dd></div>
        {account.email && <div><dt>E-mail</dt><dd>{account.email}</dd></div>}
      </dl>
      <details className="cxs-disclosure">
        <summary>Identificador da conta</summary>
        <code>{account.accountId}</code>
        <Button type="button" variant="outline" onClick={() => void copyAccountId()}>Copiar</Button>
        {copied && <StatusLine>Copiado.</StatusLine>}
      </details>
    </section>
    <section aria-labelledby="cxs-workspaces-title">
      <h2 id="cxs-workspaces-title">Meus Workspaces</h2>
      {workspaces.length === 0
        ? <SectionEmpty>Você ainda não participa de um Workspace. <Link to="/workspaces/new">Criar um Workspace</Link></SectionEmpty>
        : <ul className="cxs-list">
          {workspaces.map((workspace) => <li key={workspace.workspaceId}>
            <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>{workspace.name}</Link>
          </li>)}
        </ul>}
    </section>
  </main>
}
