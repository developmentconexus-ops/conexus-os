import { Button } from '@mastra/playground-ui/components/Button'
import { FAILURES, type HubNoAccessReason } from '@conexus/contract'
import type { ReactNode } from 'react'
import { ConexusMark, ConexusWordmark } from '../../../../../packages/brand/src/index'
import './entry.css'
import { HubFailure } from '../../app/failure'
import { failureText, isRetryable } from '../../app/http'

export const SIGN_IN_URL = '/protocol/oidc/login'

// Screens outside a Workspace share one centered column under the lockup, like the sign-in page.
function EntryFrame({ title, children }: Readonly<{ title: string; children?: ReactNode }>) {
  return <main className="cx-entry">
    <div className="cx-entry-column">
      <ConexusWordmark size="md" />
      <h1>{title}</h1>
      {children}
    </div>
  </main>
}

export function EntryLoading({ label }: Readonly<{ label: string }>) {
  return <main className="cx-entry" aria-busy="true">
    <div className="cx-entry-wait" role="status">
      <ConexusMark size={32} working />
      <span>{label}</span>
    </div>
  </main>
}

export function SignedOut() {
  return <EntryFrame title="Sessão encerrada">
    <p>Você saiu do Conexus, ou a sessão expirou. Entre de novo para continuar de onde parou.</p>
    <Button as="a" href={SIGN_IN_URL} variant="primary" size="lg">Entrar de novo</Button>
  </EntryFrame>
}

const NO_ACCESS_TITLE = {
  SIGN_IN_EXPIRED: 'O login não foi concluído',
  SIGN_IN_FAILED: 'Não foi possível entrar',
  IDENTITY_EMAIL_NOT_VERIFIED: 'E-mail ainda não verificado',
  IDENTITY_NOT_ELIGIBLE: 'Acesso ainda não liberado',
  ACCOUNT_INACTIVE: 'Conta desativada',
} as const satisfies Record<HubNoAccessReason, string>

export function NoAccess({ reason }: Readonly<{ reason: HubNoAccessReason }>) {
  return <EntryFrame title={NO_ACCESS_TITLE[reason]}>
    <p>{failureText(new HubFailure(reason, null))}</p>
    {FAILURES[reason].action === 'SIGN_IN_AGAIN' && <Button as="a" href={SIGN_IN_URL} variant="primary" size="lg">Entrar de novo</Button>}
  </EntryFrame>
}

export function EntryFailure({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  return <EntryFrame title="Não foi possível abrir o Conexus">
    <p>{failureText(error)}</p>
    {isRetryable(error) && <Button type="button" variant="primary" size="lg" onClick={onRetry}>Tentar de novo</Button>}
  </EntryFrame>
}
