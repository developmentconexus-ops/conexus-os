export function AccountSettings({ account, workspaces }: Readonly<{
  account: Readonly<{ accountId: string; displayName: string; email?: string }>
  workspaces: readonly Readonly<{ workspaceId: string; name: string }>[]
}>) {
  return <dl className="settings-account">
    <div><dt>Nome</dt><dd>{account.displayName}</dd></div>
    {account.email && <div><dt>E-mail</dt><dd>{account.email}</dd></div>}
    <div><dt>Identificador da conta</dt><dd><code>{account.accountId}</code></dd></div>
    <div><dt>Workspaces</dt><dd>{workspaces.length === 0 ? 'Nenhum' : workspaces.map((workspace) => workspace.name).join(', ')}</dd></div>
  </dl>
}
