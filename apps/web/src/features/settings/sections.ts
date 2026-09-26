import { Brain, Code2, KeyRound, ShieldCheck, SlidersHorizontal, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'

type SettingsGroup = 'personal' | 'installation'

export type SettingsSection = Readonly<{
  id: string
  label: string
  to: string
  icon: ComponentType<{ size?: number }>
  group: SettingsGroup
}>

// One table drives the rail, the page titles and which routes exist; a route that is not here is
// not a settings screen.
export const settingsSections: readonly SettingsSection[] = [
  { id: 'account', label: 'Minha conta', to: '/settings/account', icon: User, group: 'personal' },
  { id: 'models', label: 'Minhas contas de modelo', to: '/settings/models', icon: KeyRound, group: 'personal' },
  { id: 'installation-github', label: 'GitHub', to: '/settings/installation/github', icon: Code2, group: 'installation' },
  { id: 'installation-models', label: 'Contas compartilhadas', to: '/settings/installation/models', icon: Users, group: 'installation' },
  { id: 'installation-model-defaults', label: 'Modelos padrão', to: '/settings/installation/model-defaults', icon: SlidersHorizontal, group: 'installation' },
  { id: 'installation-memory', label: 'Memória', to: '/settings/installation/memory', icon: Brain, group: 'installation' },
  { id: 'installation-admins', label: 'Administradores', to: '/settings/installation/admins', icon: ShieldCheck, group: 'installation' },
] as const
