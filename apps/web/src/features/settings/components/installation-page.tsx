import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useInstallation } from '../use-installation'
import { SectionLoading } from './states'

// Wraps every /settings/installation/* screen: waits for the administrator check, then either
// renders the screen or the refused state. The Hub refuses the data underneath regardless; this
// is the UI's half of that contract.
export function InstallationPage({ children }: Readonly<{ children: ReactNode }>) {
  const installation = useInstallation()
  if (installation.isPending) return <main className="cxs-page"><SectionLoading rows={4} /></main>
  if (installation.isError || installation.data.administrator !== true) {
    return <main className="cxs-page">
      <h1>Configurações</h1>
      <p>Esta seção é só para administradores da instalação.</p>
      <Link to="/settings/account">Ir para Minha conta</Link>
    </main>
  }
  return <>{children}</>
}
