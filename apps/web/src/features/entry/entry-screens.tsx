import { Button } from '@mastra/playground-ui/components/Button'
import type { ReactNode } from 'react'
import { ConexusMark, ConexusWordmark } from '../../../../../packages/brand/src/index'
import './entry.css'

export const SIGN_IN_URL = '/protocol/oidc/login'

// Screens outside a Workspace share one centered column under the lockup, like the sign-in page.
export function EntryFrame({ title, children, arrive = false }: Readonly<{ title: string; children?: ReactNode; arrive?: boolean }>) {
  return <main className="cx-entry">
    <div className="cx-entry-column">
      <ConexusWordmark size="md" arrive={arrive} />
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

export function NoAccess() {
  return <EntryFrame title="Acesso ainda não liberado">
    <p>Sua identidade foi confirmada, mas ainda não há uma conta no Conexus para ela.</p>
    <ul className="cx-entry-list">
      <li>Peça um convite a um owner do Workspace, com este mesmo email.</li>
      <li>Se já foi convidado, confirme seu email no provedor de login e entre de novo.</li>
    </ul>
    <Button as="a" href={SIGN_IN_URL} variant="outline" size="lg">Entrar com outra conta</Button>
  </EntryFrame>
}

export function EntryFailure({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return <EntryFrame title="Não foi possível abrir o Conexus">
    <p>O servidor não respondeu. Nada foi alterado; tente de novo em alguns segundos.</p>
    <Button type="button" variant="primary" size="lg" onClick={onRetry}>Tentar de novo</Button>
  </EntryFrame>
}
