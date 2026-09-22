import { MainSidebar } from '@mastra/playground-ui/components/MainSidebar'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { returnToPath } from '../return-to'
import { settingsSections } from '../sections'

export function SettingsRail({ administrator }: Readonly<{ administrator: boolean }>) {
  const matchRoute = useMatchRoute()
  const personal = settingsSections.filter((section) => section.group === 'personal')
  const installation = administrator ? settingsSections.filter((section) => section.group === 'installation') : []
  const label = (text: string) => <MainSidebar.NavLabel>{text}</MainSidebar.NavLabel>
  return <MainSidebar.NavSection>
    <MainSidebar.NavList>
      <MainSidebar.NavLink isActive={false} render={
        <Link to={returnToPath()}><ArrowLeft size={16} aria-hidden="true" />{label('Voltar')}</Link>
      } />
    </MainSidebar.NavList>
    <MainSidebar.NavHeader>Pessoal</MainSidebar.NavHeader>
    <MainSidebar.NavList>
      {personal.map((section) => {
        const Icon = section.icon
        return <MainSidebar.NavLink key={section.id} isActive={Boolean(matchRoute({ to: section.to }))} render={
          <Link to={section.to}><Icon size={16} aria-hidden="true" />{label(section.label)}</Link>
        } />
      })}
    </MainSidebar.NavList>
    {installation.length > 0 && <>
      <MainSidebar.NavHeader>Instalação</MainSidebar.NavHeader>
      <MainSidebar.NavList>
        {installation.map((section) => {
          const Icon = section.icon
          return <MainSidebar.NavLink key={section.id} isActive={Boolean(matchRoute({ to: section.to }))} render={
            <Link to={section.to}><Icon size={16} aria-hidden="true" />{label(section.label)}</Link>
          } />
        })}
      </MainSidebar.NavList>
    </>}
  </MainSidebar.NavSection>
}
