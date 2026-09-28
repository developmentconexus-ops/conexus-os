import { createRoute } from '@tanstack/react-router'
import { ModelsScreen } from '../features/settings/components/models-screen'
import { settingsRoute } from './settings'

export const settingsModelsRoute = createRoute({ getParentRoute: () => settingsRoute, path: '/models', component: ModelsScreen })
