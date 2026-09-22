import { createRoute } from '@tanstack/react-router'
import { ModelsScreen } from '../features/settings/components/models-screen'
import { useInstallation } from '../features/settings/use-installation'
import { settingsRoute } from './settings'

export const settingsModelsRoute = createRoute({ getParentRoute: () => settingsRoute, path: '/models', component: SettingsModelsRoute })

function SettingsModelsRoute() {
  const installation = useInstallation()
  return <ModelsScreen administrator={installation.data?.administrator === true} />
}
