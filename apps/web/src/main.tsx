import { ThemeProvider } from '@mastra/playground-ui/components/ThemeProvider'
import { Toaster } from '@mastra/playground-ui/components/Toaster'
import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { config as configureZod } from 'zod'
import { AppQueryClientProvider } from './app/query-client'
import { router } from './app/router'
// The component library's stylesheet resets base elements for the whole document. Loaded with the
// page that first uses it, it changed paragraph margins and line height on every other page from
// that moment on, so it loads once, up front, and the application looks the same everywhere.
import '@mastra/playground-ui/style.css'
import '../../../packages/brand/src/index'
import './styles.css'

// The Hub serves the application under a script-src without 'unsafe-eval'. Zod probes for eval once,
// inside a try, and falls back on its own; the browser still reports the blocked probe as a security
// policy violation on every page load, which buries real ones. Jitless skips the probe.
configureZod({ jitless: true })

const root = document.getElementById('root')
if (!root) throw new Error('Conexus root element is missing')

createRoot(root).render(
  <ThemeProvider defaultTheme="system" storageKey="conexus-theme">
    <AppQueryClientProvider>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </AppQueryClientProvider>
  </ThemeProvider>,
)
