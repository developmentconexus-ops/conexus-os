import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { AppQueryClientProvider } from './app/query-client'
import { router } from './app/router'
// The component library's stylesheet resets base elements for the whole document. Loaded with the
// page that first uses it, it changed paragraph margins and line height on every other page from
// that moment on, so it loads once, up front, and the application looks the same everywhere.
import '@mastra/playground-ui/style.css'
import '../../../packages/brand/src/index'
import './mastra-theme.css'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Conexus root element is missing')

createRoot(root).render(
  <AppQueryClientProvider>
    <RouterProvider router={router} />
  </AppQueryClientProvider>,
)
