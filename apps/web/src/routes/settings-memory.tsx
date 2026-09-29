import { createRoute } from '@tanstack/react-router'
import { MemoryScreen } from '../features/settings/components/memory-screen'
import { settingsRoute } from './settings'

export const settingsMemoryRoute = createRoute({ getParentRoute: () => settingsRoute, path: '/memory', component: MemoryScreen })
