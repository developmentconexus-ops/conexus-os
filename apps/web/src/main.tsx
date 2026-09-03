import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { AppQueryClientProvider } from './app/query-client'
import { router } from './app/router'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Conexus root element is missing')

createRoot(root).render(
  <AppQueryClientProvider>
    <RouterProvider router={router} />
  </AppQueryClientProvider>,
)
