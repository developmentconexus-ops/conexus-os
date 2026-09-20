import { Tab, TabContent, TabList, Tabs } from '@mastra/playground-ui/components/Tabs'
import { ThemeProvider } from '@mastra/playground-ui/components/ThemeProvider'
import { ModelConnectionSettings, type SettingsWorkspace } from '../../model-connection/components/model-connection-settings'

export function SettingsTabs({ account, workspaces }: Readonly<{
  account: Readonly<{ accountId: string; displayName: string; email?: string }>
  workspaces: readonly SettingsWorkspace[]
}>) {
  return <ThemeProvider defaultTheme="light" storageKey="conexus-builder-theme">
    <Tabs defaultTab="credentials">
      <TabList><Tab value="credentials">Credenciais de modelo</Tab><Tab value="account">Conta</Tab></TabList>
      <TabContent value="credentials"><ModelConnectionSettings workspaces={workspaces} currentAccountId={account.accountId} /></TabContent>
      <TabContent value="account">
        <dl className="settings-account">
          <div><dt>Nome</dt><dd>{account.displayName}</dd></div>
          {account.email && <div><dt>E-mail</dt><dd>{account.email}</dd></div>}
          <div><dt>Identificador da conta</dt><dd><code>{account.accountId}</code></dd></div>
          <div><dt>Workspaces</dt><dd>{workspaces.length === 0 ? 'Nenhum' : workspaces.map((workspace) => workspace.name).join(', ')}</dd></div>
        </dl>
      </TabContent>
    </Tabs>
  </ThemeProvider>
}
